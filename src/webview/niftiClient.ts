import { Niivue, NVImage } from '@niivue/niivue';
import { readNiftiStream } from './niftiStream.js';

const canvas = document.querySelector<HTMLCanvasElement>('canvas')!;
const status = document.querySelector<HTMLElement>('[role="status"]')!;
const frame = document.querySelector<HTMLInputElement>('input')!;
const label = document.querySelector<HTMLOutputElement>('output')!;
const cancel = document.querySelector<HTMLButtonElement>('button')!;
declare function acquireVsCodeApi(): { postMessage(message: unknown): void };
const api = acquireVsCodeApi();
let previewFrames = 0;
let loadedFrames = 0;
window.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (event.data === 'inspect')
    api.postMessage({ previewFrames, loadedFrames, status: status.textContent });
});
const controller = new AbortController();
cancel.onclick = () => controller.abort();
window.addEventListener('pagehide', () => controller.abort(), { once: true });

async function open() {
  const viewer = new Niivue();
  await viewer.attachToCanvas(canvas);
  const response = await fetch(canvas.dataset.source!, { signal: controller.signal });
  if (!response.ok || !response.body)
    throw new Error(`Unable to read the image (HTTP ${response.status}).`);
  const stream =
    canvas.dataset.gzip === 'true'
      ? response.body.pipeThrough(new DecompressionStream('gzip'))
      : response.body;

  let preview: NVImage | undefined;
  const complete = await readNiftiStream(stream, async (buffer, frames) => {
    preview = await NVImage.loadFromUrl({ url: buffer, name: 'preview.nii' });
    controller.signal.throwIfAborted();
    viewer.addVolume(preview);
    previewFrames = frames;
    status.textContent = `Showing frame 1 of ${frames}. Loading remaining frames…`;
    // Give the browser a chance to paint before allocating the complete image.
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      setTimeout(resolve, 100);
    });
  });
  const volume = await NVImage.loadFromUrl({ url: complete, name: 'image.nii' });
  controller.signal.throwIfAborted();
  if (preview) viewer.removeVolume(preview);
  viewer.addVolume(volume);
  loadedFrames = volume.nFrame4D ?? 1;
  status.textContent = `${loadedFrames} ${loadedFrames === 1 ? 'frame' : 'frames'} loaded.`;
  if (loadedFrames > 1) {
    frame.max = String(loadedFrames);
    frame.disabled = false;
    frame.oninput = () => {
      viewer.setFrame4D(volume.id, frame.valueAsNumber - 1);
      label.value = frame.value;
    };
  }
}

void open()
  .catch((error: unknown) => {
    status.textContent = controller.signal.aborted
      ? 'Loading cancelled.'
      : `Unable to load NIfTI image. ${String(error)}`;
  })
  .finally(() => {
    cancel.disabled = true;
  });
