import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import type { DirectoryEntry } from '../../core/directory';
import {
  recordingTableCandidates,
  channelMetadata,
  recordingEvents,
} from '../../core/recordingMetadata';
import { eventNumber, eventsInWindow } from '../../core/recordingEvents';
import { parseTable } from '../../core/tables';
import { loadRecordingMetadata } from '../../sources/recordingMetadata';
import { LogicalDirectorySource } from '../../sources/logicalDirectory';
import { zipFixture } from '../zipFixture';
import { tarFixture, tarRecord } from '../tarFixture';
import { squashfsFiles } from '../squashfsFixture';
import { gzipSync } from 'node:zlib';

const signal = () => new AbortController().signal;
const entry = (path: string, kind: DirectoryEntry['kind'] = 'file'): DirectoryEntry => ({
  name: path.split('/').at(-1)!,
  uri: 'file:///study/' + path,
  datasetUri: 'file:///study',
  relativePath: path,
  kind,
});
const table = (text: string) =>
  parseTable(
    {
      sourceUri: 'file:///table.tsv',
      text,
      revision: { size: text.length, modifiedAt: 1 },
      capturedAt: 'now',
    },
    signal(),
    'name',
  );

void test('recording tables match scoped entities, nearest ancestors and numeric run labels without guessing a source', () => {
  const target = entry('sub-01/eeg/sub-01_task-rest_run-01_eeg.edf');
  const root = entry('task-rest_events.tsv'),
    leaf = entry('sub-01/eeg/sub-01_task-rest_run-1_events.tsv');
  const levels = [
    {
      relativePath: '',
      coverage: 'complete' as const,
      entries: [
        root,
        entry('README'),
        entry('task-other_events.tsv'),
        entry('task-rest_task-rest_events.tsv'),
      ],
    },
    {
      relativePath: 'sub-01/eeg',
      coverage: 'complete' as const,
      entries: [
        leaf,
        entry('sub-01/eeg/sub-01_task-rest_run-2_events.tsv'),
        entry('sub-01/eeg/sub-01_task-rest_eeg.json'),
      ],
    },
  ];
  assert.deepEqual(recordingTableCandidates(target, levels, 'events'), [leaf]);
  assert.deepEqual(recordingTableCandidates(target, levels.slice(0, 1), 'events'), [root]);
  const duplicate = { ...leaf, uri: 'file:///other-source' };
  assert.deepEqual(
    recordingTableCandidates(target, [{ ...levels[1], entries: [leaf, duplicate] }], 'events'),
    [leaf, duplicate],
  );
  assert.equal(
    recordingTableCandidates(
      target,
      [{ ...levels[1], entries: [{ ...leaf, kind: 'symlink' }] }],
      'events',
    )[0].kind,
    'symlink',
  );
  assert.throws(
    () => recordingTableCandidates(entry('sub-01_sub-02_eeg.edf'), levels, 'events'),
    /ambiguous/,
  );
  assert.throws(
    () => recordingTableCandidates(entry('bad_name_eeg.edf'), levels, 'events'),
    /ambiguous/,
  );
  assert.throws(
    () =>
      recordingTableCandidates(
        target,
        [{ ...levels[1], entries: [{ ...leaf, datasetUri: 'file:///different' }] }],
        'events',
      ),
    /identity/,
  );
  assert.throws(
    () =>
      recordingTableCandidates(
        target,
        [{ ...levels[1], entries: [{ ...leaf, relativePath: 'elsewhere' }] }],
        'events',
      ),
    /identity/,
  );
  assert.throws(
    () =>
      recordingTableCandidates(
        target,
        [{ ...levels[1], entries: Array(50001).fill(leaf) }],
        'events',
      ),
    /50,000/,
  );
  assert.throws(
    () =>
      recordingTableCandidates(target, [{ ...levels[1], entries: Array(65).fill(leaf) }], 'events'),
    /64/,
  );
});

void test('channel rows match exact names; duplicates are withheld and malformed tables are not interpreted', async () => {
  const input = await table(
    'name\ttype\tunits\tstatus\nECG\tECG\tmV\tgood\nFz\tEEG\tuV\tbad\nFz\tEEG\tV\tgood\nn/a\tMISC\tn/a\tn/a\n\tMISC\tn/a\tn/a\n',
  );
  const rows = channelMetadata(input);
  assert.deepEqual([...rows.keys()], ['ECG']);
  assert.equal(rows.get('ECG')!.line, 2);
  assert.equal(rows.get('ECG')!.values.units, 'mV');
  for (const text of ['other\nx\n', 'name\tname\nx\tx\n', 'name\ttype\nx\n']) {
    const value = await table(text);
    assert.throws(() => channelMetadata(value), /columns/);
  }
});

void test('event timing preserves negative onsets, overlaps, unknown durations, exact text and sample values', async () => {
  const input = await table(
    'onset\tduration\ttrial_type\tsample\n-2\t4\ttraining\t0002\n0\t0\ttrigger\t9007199254740993\n1\tn/a\tunknown\t\n2\t-1\tinvalid\t\nnope\t1\tbad onset\t\n10\t1\tnext\t\n',
  );
  const events = recordingEvents(input);
  assert.deepEqual(
    eventsInWindow(events, 0, 10).map((event) => event.label),
    ['training', 'trigger', 'unknown'],
  );
  assert.equal(events[0].onset, -2);
  assert.equal(events[2].duration, undefined);
  assert.equal(events[1].values[3], '9007199254740993');
  assert.equal(eventsInWindow(events, 3, 5).length, 0);
  assert.equal(recordingEvents(await table('onset\tduration\n0\t1\n'))[0].label, 'Event at line 2');
  assert.equal(
    recordingEvents(await table('onset\tduration\ttrial_type\n0\t1\t\n'))[0].label,
    'Event at line 2',
  );
  assert.throws(() => recordingEvents({ ...input, columns: ['duration'] }), /columns/);
  for (const value of ['', 'n/a', 'Infinity', '1e999', '0x10', ' 1', 'NaN'])
    assert.equal(eventNumber(value), undefined);
  assert.equal(eventNumber('-1.25e2'), -125);
  assert.equal(eventNumber('.5'), 0.5);
});

void test('logical recording metadata preserves archive source choices, inheritance and read-only data across supported formats', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bids-recording-tables-'));
  try {
    const edf = 'sub-01/eeg/sub-01_task-rest_eeg.edf',
      channels = 'sub-01/eeg/sub-01_task-rest_channels.tsv',
      events = 'task-rest_events.tsv';
    const texts = [
      { name: edf, bytes: Buffer.from('not read for metadata') },
      { name: channels, bytes: Buffer.from('name\ttype\tunits\nFz\tEEG\tuV\n') },
      {
        name: events,
        bytes: Buffer.from('onset\tduration\ttrial_type\n-1\t2\ttraining\n5\t0\tcue\n'),
      },
    ];
    for (const format of ['loose', 'zip', 'tar', 'tgz', 'sqfs']) {
      const folder = join(dir, format);
      await mkdir(folder);
      if (format === 'loose')
        for (const item of texts) {
          await mkdir(join(folder, item.name, '..'), { recursive: true });
          await writeFile(join(folder, item.name), item.bytes);
        }
      else {
        const tar = tarFixture(...texts.map((item) => tarRecord(item.name, item.bytes)));
        const bytes =
          format === 'zip'
            ? zipFixture(texts)
            : format === 'sqfs'
              ? squashfsFiles(
                  texts
                    .map((item) => ({
                      name: item.name.split('/').at(-1)!,
                      text: item.bytes.toString(),
                    }))
                    .sort((a, b) => Buffer.compare(Buffer.from(a.name), Buffer.from(b.name))),
                )
              : format === 'tgz'
                ? gzipSync(tar)
                : tar;
        await writeFile(join(folder, 'dataset.' + format), bytes);
      }
      const source = new LogicalDirectorySource();
      let node = await source.root(pathToFileURL(folder).href);
      for (const part of format === 'sqfs'
        ? ['sub-01_task-rest_eeg.edf']
        : ['sub-01', 'eeg', 'sub-01_task-rest_eeg.edf'])
        node = (await source.children(node, signal())).find((e) => e.name === part)!;
      assert.ok(node, format);
      const result = await loadRecordingMetadata(source, node, signal());
      assert.equal(result.channels.status, 'resolved', format);
      assert.equal(result.events.status, 'resolved', format);
      assert.equal(result.channels.channelRows![0].values.name, 'Fz');
      assert.equal(result.events.events![0].onset, -1);
      assert.match(result.events.candidates[0].uri, format === 'loose' ? /^file:/ : /^bids-/);
      if (format === 'loose')
        assert.deepEqual(await readFile(join(folder, events)), texts[2].bytes);
    }
    // Equal logical paths in separate physical archives remain a source choice.
    const overlay = join(dir, 'overlay');
    await mkdir(overlay);
    await writeFile(join(overlay, 'one.zip'), zipFixture(texts));
    await writeFile(join(overlay, 'two.zip'), zipFixture([texts[1], texts[2]]));
    const source = new LogicalDirectorySource();
    let node = await source.root(pathToFileURL(overlay).href);
    for (const part of ['sub-01', 'eeg', 'sub-01_task-rest_eeg.edf'])
      node = (await source.children(node, signal())).find((e) => e.name === part)!;
    const ambiguous = await loadRecordingMetadata(source, node, signal());
    assert.equal(ambiguous.channels.status, 'ambiguous');
    assert.equal(ambiguous.events.status, 'ambiguous');
    const chosen = await loadRecordingMetadata(source, node, signal(), {
      channels: ambiguous.channels.candidates[1].uri,
    });
    assert.equal(chosen.channels.status, 'resolved');
    assert.equal(chosen.events.status, 'ambiguous');
    assert.equal(
      (await loadRecordingMetadata(source, node, signal(), { channels: 'file:///not-a-candidate' }))
        .channels.status,
      'ambiguous',
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

void test('recording table failures distinguish absence, unsafe/unreadable files, incomplete coverage, cancellation and changed sources', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bids-recording-table-failures-'));
  try {
    const source = new LogicalDirectorySource(),
      root = await source.root(pathToFileURL(dir).href);
    const target = {
      ...root,
      name: 'sub-01_task-rest_eeg.edf',
      relativePath: 'sub-01_task-rest_eeg.edf',
      uri: pathToFileURL(join(dir, 'sub-01_task-rest_eeg.edf')).href,
      kind: 'file' as const,
    };
    await writeFile(join(dir, target.name), 'unchanged');
    assert.equal((await loadRecordingMetadata(source, target, signal())).channels.status, 'absent');
    const path = join(dir, 'sub-01_task-rest_channels.tsv');
    await symlink(join(dir, 'missing'), path);
    source.refresh();
    assert.equal(
      (await loadRecordingMetadata(source, target, signal())).channels.status,
      'unreadable',
    );
    await rm(path);
    await writeFile(path, 'name\ttype\nFz\n');
    source.refresh();
    assert.equal(
      (await loadRecordingMetadata(source, target, signal())).channels.status,
      'unreadable',
    );
    await writeFile(path, 'name\ttype\nFz\tEEG\n');
    source.refresh();
    const children = source.children.bind(source);
    source.children = async (...args) =>
      (await children(...args)).map((e) =>
        e.name === path.split('/').at(-1) ? { ...e, paging: { page: 2, failures: 0 } } : e,
      );
    assert.equal(
      (await loadRecordingMetadata(source, target, signal())).channels.status,
      'unknown',
    );
    source.children = children;
    const revision = source.revision.bind(source);
    let count = 0;
    source.revision = async (e) => {
      const r = await revision(e);
      return e.name.endsWith('channels.tsv') && ++count > 1
        ? { ...r, modifiedAt: r.modifiedAt + 1 }
        : r;
    };
    await assert.rejects(loadRecordingMetadata(source, target, signal()), /changed/);
    source.revision = revision;
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(loadRecordingMetadata(source, target, controller.signal), /abort/i);
    const read = source.revision.bind(source);
    const during = new AbortController();
    source.revision = async (e) => {
      if (e.name.endsWith('channels.tsv')) during.abort();
      return read(e);
    };
    await assert.rejects(loadRecordingMetadata(source, target, during.signal), /abort/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
