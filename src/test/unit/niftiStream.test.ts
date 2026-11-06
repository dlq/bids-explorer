import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gunzipSync } from 'node:zlib';
import { readNiftiStream } from '../../webview/niftiStream';
import { niftiFixture } from '../niftiFixture';

void test('shows the first frame before the remaining chunks are available', async () => {
  const first = gunzipSync(niftiFixture());
  first.writeInt16LE(4, 40);
  first.writeInt16LE(2, 48);
  const second = Buffer.alloc(8, 222);
  let writer!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      writer = controller;
      controller.enqueue(first.subarray(0, 200));
      controller.enqueue(first.subarray(200));
    },
  });
  let shown = false;
  const complete = await readNiftiStream(stream, (preview, frames) => {
    shown = true;
    assert.equal(frames, 2);
    assert.equal(new DataView(preview).getInt16(40, true), 3);
    assert.equal(new DataView(preview).getInt16(48, true), 1);
    assert.deepEqual(Buffer.from(preview).subarray(352), first.subarray(352));
    writer.enqueue(second);
    writer.close();
    return Promise.resolve();
  });
  assert.equal(shown, true);
  assert.deepEqual(Buffer.from(complete), Buffer.concat([first, second]));
});

void test('rejects a truncated image even if its preview was complete', async () => {
  const first = gunzipSync(niftiFixture());
  first.writeInt16LE(4, 40);
  first.writeInt16LE(2, 48);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(first);
      controller.close();
    },
  });
  let shown = false;
  await assert.rejects(
    readNiftiStream(stream, () => {
      shown = true;
      return Promise.resolve();
    }),
    /ended before/,
  );
  assert.equal(shown, true);
});

void test('preserves big-endian NIfTI-2 geometry and voxel offset in the preview', async () => {
  const data = Buffer.alloc(564);
  data.writeInt32BE(540);
  data.set([110, 43, 50, 0, 13, 10, 26, 10], 4);
  data.writeInt16BE(4, 12);
  data.writeInt16BE(16, 14);
  for (const [index, size] of [4n, 2n, 1n, 1n, 2n].entries())
    data.writeBigInt64BE(size, 16 + 8 * index);
  data.writeBigInt64BE(556n, 168);
  data.set([1, 2, 3, 4, 5, 6, 7, 8], 556);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
  const complete = await readNiftiStream(stream, (preview, frames) => {
    assert.equal(frames, 2);
    const first = Buffer.from(preview);
    assert.equal(first.readBigInt64BE(16), 3n);
    assert.equal(first.readBigInt64BE(168), 556n);
    assert.deepEqual(first.subarray(556), data.subarray(556, 560));
    return Promise.resolve();
  });
  assert.deepEqual(Buffer.from(complete), data);
});

void test('rejects oversized declared data and cancels the unread stream', async () => {
  const header = gunzipSync(niftiFixture());
  for (const offset of [42, 44, 46]) header.writeInt16LE(32767, offset);
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(header);
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(
    readNiftiStream(stream, () => assert.fail('Oversized data must not render')),
    /decoded size limit/,
  );
  assert.equal(cancelled, true);
});
