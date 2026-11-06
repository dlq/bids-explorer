const maxImageBytes = 1024 ** 3;
const maxPreviewBytes = 128 * 1024 ** 2;

/** Read a single decoded response, sharing the prefix between the preview and final image. */
export async function readNiftiStream(
  stream: ReadableStream<Uint8Array>,
  showFirstFrame: (frame: ArrayBuffer, frameCount: number) => Promise<void>,
): Promise<ArrayBuffer> {
  const reader = stream.getReader();
  let pending: Uint8Array = new Uint8Array();
  async function fill(target: Uint8Array) {
    let written = 0;
    while (written < target.length) {
      if (!pending.length) {
        const next = await reader.read();
        if (next.done) throw new Error('The NIfTI file ended before its declared voxel data.');
        pending = next.value;
      }
      const count = Math.min(pending.length, target.length - written);
      target.set(pending.subarray(0, count), written);
      pending = pending.subarray(count);
      written += count;
    }
  }

  try {
    const header = new Uint8Array(540);
    await fill(header.subarray(0, 348));
    const view = new DataView(header.buffer);
    const little = [348, 540].includes(view.getInt32(0, true));
    const size = view.getInt32(0, little);
    if (size !== 348 && size !== 540) throw new Error('Invalid NIfTI header size.');
    const version2 = size === 540;
    if (version2) await fill(header.subarray(348));
    const magic = version2 ? 4 : 344;
    const expected = version2 ? [110, 43, 50, 0, 13, 10, 26, 10] : [110, 43, 49, 0];
    if (!expected.every((byte, index) => header[magic + index] === byte))
      throw new Error('The viewer requires a single-file NIfTI image.');

    const dimension = (index: number) =>
      version2
        ? Number(view.getBigInt64(16 + index * 8, little))
        : view.getInt16(40 + index * 2, little);
    const rank = dimension(0);
    const offset = version2 ? Number(view.getBigInt64(168, little)) : view.getFloat32(108, little);
    const bits = view.getInt16(version2 ? 14 : 72, little);
    const datatype = view.getInt16(version2 ? 12 : 70, little);
    const datatypeBits = new Map([
      [2, 8],
      [4, 16],
      [8, 32],
      [16, 32],
      [32, 64],
      [64, 64],
      [128, 24],
      [256, 8],
      [512, 16],
      [768, 32],
      [1024, 64],
      [1280, 64],
      [1536, 128],
      [1792, 128],
      [2048, 256],
      [2304, 32],
    ]);
    if (
      rank < 1 ||
      rank > 7 ||
      !Number.isInteger(rank) ||
      !Number.isSafeInteger(offset) ||
      offset < size + 4 ||
      datatypeBits.get(datatype) !== bits
    )
      throw new Error('Unsupported NIfTI dimensions, voxel offset or datatype.');
    let voxelBytes = bits / 8;
    for (let index = 1; index <= rank; index++) {
      const length = dimension(index);
      if (!Number.isSafeInteger(length) || length < 1) throw new Error('Invalid NIfTI dimension.');
      voxelBytes *= length;
    }
    const total = offset + voxelBytes;
    if (!Number.isSafeInteger(total) || total > maxImageBytes)
      throw new Error('This NIfTI image exceeds the 1 GiB decoded size limit.');

    let prefix: Uint8Array = header.subarray(0, size);
    const frameCount = rank === 4 ? dimension(4) : 1;
    const firstFrameEnd = offset + voxelBytes / frameCount;
    if (frameCount > 1 && firstFrameEnd <= maxPreviewBytes) {
      const first = new Uint8Array(firstFrameEnd);
      first.set(prefix);
      await fill(first.subarray(size));
      const preview = first.slice();
      const previewHeader = new DataView(preview.buffer);
      if (version2) {
        previewHeader.setBigInt64(16, 3n, little);
        previewHeader.setBigInt64(48, 1n, little);
      } else {
        previewHeader.setInt16(40, 3, little);
        previewHeader.setInt16(48, 1, little);
      }
      await showFirstFrame(preview.buffer, frameCount);
      prefix = first;
    }
    const complete = new Uint8Array(total);
    complete.set(prefix);
    await fill(complete.subarray(prefix.length));
    // Read to EOF so gzip integrity checks run. Trailing bytes are not part of the image.
    let bytes = total + pending.length;
    while (bytes <= maxImageBytes) {
      const next = await reader.read();
      if (next.done) return complete.buffer;
      bytes += next.value.length;
    }
    throw new Error('This NIfTI image exceeds the 1 GiB decoded size limit.');
  } finally {
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
