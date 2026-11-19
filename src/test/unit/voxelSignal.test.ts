import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readVoxelSignal, signalTime } from '../../webview/voxelSignal';

void test('signal preserves voxel values, irregular frame times and missing samples', async () => {
  const signal = await readVoxelSignal(
    [1, 2, 3],
    4,
    4,
    (frame) => [10, 20, NaN, 40][frame],
    { starts: [0, 2, 5, 9], source: 'JSON frame times', units: 'Bq/mL' },
    () => false,
  );
  assert.deepEqual(signal?.values, [10, 20, null, 40]);
  assert.deepEqual(signal?.x, [0, 2, 5, 9]);
  assert.deepEqual(signal?.frames, [1, 2, 3, 4]);
  assert.equal(signal?.axis, 'Time (s) · JSON frame times');
  assert.equal(signal?.units, 'Bq/mL');
  assert.equal(signal?.pending, false);
  assert.equal(signalTime(2, { step: 2, offset: 1 }), 5);
});
void test('signal uses volume numbers without timing and marks unloaded data', async () => {
  const signal = await readVoxelSignal(
    [0, 0, 0],
    10,
    1,
    () => 7,
    {},
    () => false,
  );
  assert.deepEqual(signal?.x, [1]);
  assert.deepEqual(signal?.values, [7]);
  assert.equal(signal?.axis, 'Volume');
  assert.equal(signal?.pending, true);
});
void test('long traces bound voxel reads and include first and last volumes', async () => {
  let reads = 0;
  const signal = await readVoxelSignal(
    [0, 0, 0],
    500000,
    500000,
    (frame) => {
      reads++;
      return frame;
    },
    { step: 0.5, source: 'NIfTI header' },
    () => false,
  );
  assert.equal(reads, 4096);
  assert.equal(signal?.frames[0], 1);
  assert.equal(signal?.frames.at(-1), 500000);
  assert.equal(signal?.values.at(-1), 499999);
});
void test('obsolete signal work stops before reading more voxel data', async () => {
  let reads = 0;
  const signal = await readVoxelSignal(
    [0, 0, 0],
    4096,
    4096,
    () => {
      reads++;
      return 1;
    },
    {},
    () => reads >= 256,
  );
  assert.equal(signal, undefined);
  assert.equal(reads, 256);
});
