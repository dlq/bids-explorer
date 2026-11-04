import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtemp, writeFile, rm, symlink, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadParticipants } from '../../sources/participants';
import { readTextSnapshot } from '../../sources/previewText';

void test('participant loader keeps independent source snapshots and tolerates absent, malformed and linked dictionaries', async () => {
  const root = await mkdtemp(join(tmpdir(), 'bids-table-'));
  const path = join(root, 'participants.tsv'),
    dictionary = join(root, 'participants.json');
  const uri = pathToFileURL(path).href;
  const load = () => loadParticipants(uri, new AbortController().signal);
  try {
    await writeFile(path, 'participant_id\tage\nsub-001\t0034\n');
    assert.equal((await load()).dictionary.status, 'absent');
    const text =
      '{"age":{"Description":"Recorded age","Units":"year"},"age":{"Unknown":9007199254740993}}';
    await writeFile(dictionary, text);
    const result = await load();
    assert.equal(result.dictionary.status, 'loaded');
    assert.deepEqual(result.dictionary.metadata?.duplicateKeys, ['age']);
    assert.equal(result.dictionary.metadata?.fields[1].valueText, '{"Unknown":9007199254740993}');
    assert.equal(result.table.rows[0].cells[0], 'sub-001');
    assert.equal(await readFile(dictionary, 'utf8'), text);
    await writeFile(dictionary, 'broken');
    assert.equal((await load()).dictionary.status, 'unavailable');
    await rm(dictionary);
    await symlink(path, dictionary);
    assert.match((await load()).dictionary.error!, /ordinary files/);
    await assert.rejects(
      loadParticipants(pathToFileURL(join(root, 'other.tsv')).href, new AbortController().signal),
      /Choose/,
    );
    const cancelled = new AbortController();
    const pending = loadParticipants(
      uri,
      cancelled.signal,
      async (...args: Parameters<typeof readTextSnapshot>) => {
        if (args[0].endsWith('.json')) {
          cancelled.abort();
          throw new Error('cancelled');
        }
        return readTextSnapshot(...args);
      },
    );
    await assert.rejects(pending, /abort/i);
    await assert.rejects(
      loadParticipants(uri, new AbortController().signal, () =>
        Promise.reject(new Error('table denied')),
      ),
      /table denied/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
