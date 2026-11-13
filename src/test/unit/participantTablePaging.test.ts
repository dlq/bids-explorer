import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtemp, open, rm, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ParticipantTablePage } from '../../core/tableTypes';
import { loadParticipantPreview, scanParticipantTable } from '../../sources/participantTablePaging';

void test('participant paging checks 500,000 rows with bounded results, cancellation and revision checks', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'bids-large-participants-'));
  const path = join(folder, 'participants.tsv');
  const uri = pathToFileURL(path).href;
  const signal = new AbortController().signal;
  const updates: ParticipantTablePage[] = [];
  const record = (progress: ParticipantTablePage) => {
    updates.push(progress);
  };
  try {
    const file = await open(path, 'w');
    try {
      await file.write('participant_id\tgroup\r\n');
      for (let offset = 0; offset < 500000; offset += 5000) {
        await file.write(
          Array.from({ length: 5000 }, (_, index) => {
            const id = offset + index;
            return `sub-${id}\t${id >= 499900 ? 'late' : 'early'}\r\n`;
          }).join(''),
        );
      }
    } finally {
      await file.close();
    }
    const preview = await loadParticipantPreview(uri, signal);
    assert.equal(preview.dictionary?.status, 'absent');
    const page = await scanParticipantTable(uri, 1, 'LATE', signal, record);
    assert.equal(page.progress.checked, 500000);
    assert.equal(page.progress.matched, 100);
    assert.equal(page.progress.bytes, page.progress.totalBytes);
    assert.equal(page.data.table.rows.length, 50);
    assert.deepEqual(page.data.table.rows[0].cells, ['sub-499950', 'late']);
    assert.equal(page.data.table.rows[0].line, 499952);
    assert.ok(updates.some((update) => update.state === 'scanning' && update.bytes === 0));

    const controller = new AbortController();
    await assert.rejects(
      scanParticipantTable(uri, 0, 'absent', controller.signal, (progress) => {
        record(progress);
        if (progress.checked > 0) controller.abort();
      }),
      /abort/i,
    );
    assert.equal(updates.at(-1)?.state, 'cancelled');
    assert.ok(updates.at(-1)!.checked < 500000);

    await writeFile(path, 'participant_id\tgroup\nsub-1\n');
    await assert.rejects(
      scanParticipantTable(uri, 0, '', signal, record, page.data.table.snapshot),
      /changed/,
    );
    assert.equal(updates.at(-1)?.state, 'failed');
    const small = await loadParticipantPreview(uri, signal);
    assert.equal(small.data?.table.unevenRows, 1);
    assert.equal((await scanParticipantTable(uri, 0, '', signal, record)).data.table.unevenRows, 1);

    await writeFile(path, 'participant_id\n' + 'a\n'.repeat(10001));
    assert.equal((await loadParticipantPreview(uri, signal)).dictionary?.status, 'absent');
    await writeFile(path, '');
    await assert.rejects(loadParticipantPreview(uri, signal), /header/);
    await assert.rejects(scanParticipantTable(uri, 0, '', signal, record), /header/);
    await truncate(path, 512 * 1024 ** 2 + 1);
    await assert.rejects(scanParticipantTable(uri, 0, '', signal, record), /512 MiB/);
    await assert.rejects(
      scanParticipantTable(pathToFileURL(folder).href, 0, '', signal, record),
      /ordinary file/,
    );
    await writeFile(path, 'participant_id\nsub-1\n');
    await assert.rejects(
      scanParticipantTable(uri, 0, '', signal, () => {
        void truncate(path, 0);
      }),
      /changed|ended|header/,
    );
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
