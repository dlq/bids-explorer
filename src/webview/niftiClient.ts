import {
  Niivue,
  NVImage,
  MULTIPLANAR_TYPE,
  SHOW_RENDER,
  type NiiVueLocation,
} from '@niivue/niivue';
import { readNiftiStream } from './niftiStream.js';
import type { ImageControl, ImageState } from './imageViewTypes';

const canvas = document.querySelector<HTMLCanvasElement>('canvas')!;
const status = document.querySelector<HTMLElement>('[role="status"]')!;
const cancel = document.querySelector<HTMLButtonElement>('#cancel')!;
declare function acquireVsCodeApi(): { postMessage(message: unknown): void };
const api = acquireVsCodeApi();
const viewer = new Niivue({
  multiplanarPadPixels: 4,
  multiplanarLayout: MULTIPLANAR_TYPE.GRID,
  multiplanarShowRender: SHOW_RENDER.ALWAYS,
});
let volume: NVImage | undefined;
let defaultWindow: [number, number] = [0, 1];
const state: ImageState = {
  status: 'Loading image…',
  previewFrames: 0,
  loadedFrames: 0,
  position: 'Image position available after loading.',
  navigationEnabled: false,
  information: [],
  display: {
    layout: 'quad',
    colormap: 'gray',
    minimum: 0,
    maximum: 1,
    crosshair: true,
    frame: 1,
  },
};
function publish(inspect = false) {
  state.status = status.textContent ?? '';
  const bounds = inspect
    ? document.querySelector('.image-canvas')!.getBoundingClientRect()
    : undefined;
  const imageBounds = inspect ? canvas.getBoundingClientRect() : undefined;
  const toolbarBottom = inspect
    ? Math.max(
        ...Array.from(document.querySelector('header')!.children).map(
          (child) => child.getBoundingClientRect().bottom,
        ),
      )
    : 0;
  api.postMessage({
    ...(bounds
      ? {
          blackPadding: imageBounds
            ? {
                left: imageBounds.left - bounds.left,
                right: bounds.right - imageBounds.right,
                top: imageBounds.top - bounds.top,
                bottom: bounds.bottom - imageBounds.bottom,
              }
            : undefined,
          edgePadding: {
            left: bounds.left,
            right: innerWidth - bounds.right,
            top: bounds.top - toolbarBottom,
            bottom: innerHeight - bounds.bottom,
          },
        }
      : {}),
    type: 'imageState',
    ...state,
    renderedPanels: viewer.screenSlices.map((slice) => slice.axCorSag),
  });
}
const controller = new AbortController();
cancel.onclick = () => controller.abort();
document.getElementById('image-controls')!.onclick = () =>
  api.postMessage({ type: 'showImageControls' });
window.addEventListener('pagehide', () => controller.abort(), { once: true });
function applyControl(control: ImageControl) {
  if (control.action === 'cancel') {
    controller.abort();
    return;
  }
  if (!volume || !state.navigationEnabled) return;
  const { action, value } = control;
  if (action === 'layout' && typeof value === 'string') {
    const layouts: Record<string, number> = {
      quad: viewer.sliceTypeMultiplanar,
      multiplanar: viewer.sliceTypeMultiplanar,
      volume: viewer.sliceTypeRender,
      axial: viewer.sliceTypeAxial,
      coronal: viewer.sliceTypeCoronal,
      sagittal: viewer.sliceTypeSagittal,
    };
    if (Object.hasOwn(layouts, value)) {
      viewer.opts.multiplanarShowRender = value === 'quad' ? SHOW_RENDER.ALWAYS : SHOW_RENDER.NEVER;
      viewer.setMultiplanarLayout(value === 'quad' ? MULTIPLANAR_TYPE.GRID : MULTIPLANAR_TYPE.AUTO);
      viewer.setSliceType(layouts[value]);
      state.display.layout = value;
    }
  }
  if (
    action === 'colormap' &&
    typeof value === 'string' &&
    ['gray', 'viridis', 'hot'].includes(value)
  ) {
    viewer.setColormap(volume.id, value);
    state.display.colormap = value;
  }
  if (action === 'crosshair' && typeof value === 'boolean') {
    viewer.setCrosshairWidth(value ? 1 : 0);
    state.display.crosshair = value;
  }
  if (
    action === 'window' &&
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((item) => typeof item === 'number' && Number.isFinite(item)) &&
    value[0] < value[1]
  ) {
    volume.cal_min = value[0] as number;
    volume.cal_max = value[1] as number;
    state.display.minimum = volume.cal_min;
    state.display.maximum = volume.cal_max;
    viewer.updateGLVolume();
  }
  if (
    action === 'frame' &&
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= state.loadedFrames
  ) {
    viewer.setFrame4D(volume.id, value - 1);
    state.display.frame = value;
  }
  if (
    action === 'move' &&
    value &&
    typeof value === 'object' &&
    'axis' in value &&
    'step' in value &&
    ['x', 'y', 'z'].includes(String(value.axis)) &&
    (value.step === 1 || value.step === -1)
  )
    viewer.moveCrosshairInVox(
      value.axis === 'x' ? value.step : 0,
      value.axis === 'y' ? value.step : 0,
      value.axis === 'z' ? value.step : 0,
    );
  if (action === 'reset') {
    applyControl({ action: 'layout', value: 'quad' });
    applyControl({ action: 'colormap', value: 'gray' });
    applyControl({ action: 'window', value: defaultWindow });
    applyControl({ action: 'crosshair', value: true });
    viewer.scene.crosshairPos = [0.5, 0.5, 0.5];
    viewer.moveCrosshairInVox(0, 0, 0);
    if (state.loadedFrames) applyControl({ action: 'frame', value: 1 });
  }
  publish();
}
window.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (event.data === 'inspect') publish(true);
  if (
    event.data &&
    typeof event.data === 'object' &&
    'type' in event.data &&
    event.data.type === 'imageControl' &&
    'control' in event.data &&
    event.data.control &&
    typeof event.data.control === 'object' &&
    'action' in event.data.control
  )
    applyControl(event.data.control as ImageControl);
});
function information(image: NVImage, frames: number) {
  const header = image.hdr;
  if (!header) return;
  const units =
    new Map([
      [1, 'm'],
      [2, 'mm'],
      [3, 'µm'],
    ]).get(header.xyzt_units & 7) ?? 'units not recorded';
  const timeUnits = new Map([
    [8, 's'],
    [16, 'ms'],
    [24, 'µs'],
  ]).get(header.xyzt_units & 56);
  const positive = (values: number[]) =>
    values.every((value) => Number.isFinite(value) && value > 0);
  state.information = [
    { label: 'Dimensions', value: header.dims.slice(1, 4).join(' × ') + ' voxels' },
    {
      label: 'Voxel spacing',
      value: positive(header.pixDims.slice(1, 4))
        ? header.pixDims
            .slice(1, 4)
            .map((value) => Number(value.toPrecision(6)))
            .join(' × ') +
          ' ' +
          units
        : 'Not recorded',
    },
    { label: 'Frames', value: String(frames) },
    {
      label: 'Frame interval',
      value:
        frames === 1
          ? 'Single frame'
          : timeUnits && positive([header.pixDims[4]])
            ? `${Number(header.pixDims[4].toPrecision(6))} ${timeUnits}`
            : 'Not recorded in temporal units',
    },
    { label: 'Voxel data type', value: header.getDatatypeCodeString(header.datatypeCode) },
  ];
}
function show(image: NVImage, frames: number, restore = false) {
  const previous = { ...state.display };
  volume = image;
  viewer.addVolume(image);
  state.navigationEnabled = true;
  const min = image.cal_min ?? 0,
    max = image.cal_max ?? 1;
  defaultWindow = [min, max];
  if (restore) {
    applyControl({ action: 'colormap', value: previous.colormap });
    applyControl({ action: 'window', value: [previous.minimum, previous.maximum] });
  } else {
    state.display.minimum = min;
    state.display.maximum = max;
  }
  information(image, frames);
  viewer.moveCrosshairInVox(0, 0, 0);
  publish();
}
async function open() {
  await viewer.attachToCanvas(canvas);
  viewer.onLocationChange = (location) => {
    const { vox } = location as NiiVueLocation;
    state.position = `Voxel position X ${vox[0]}, Y ${vox[1]}, Z ${vox[2]}.`;
    publish();
  };
  viewer.onIntensityChange = (image) => {
    state.display.minimum = image.cal_min ?? 0;
    state.display.maximum = image.cal_max ?? 1;
    publish();
  };
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
    state.previewFrames = frames;
    show(preview, frames);
    status.textContent = `Showing frame 1 of ${frames}. Loading remaining frames…`;
    publish();
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      setTimeout(resolve, 100);
    });
  });
  const image = await NVImage.loadFromUrl({ url: complete, name: 'image.nii' });
  controller.signal.throwIfAborted();
  const position = [
    viewer.scene.crosshairPos[0],
    viewer.scene.crosshairPos[1],
    viewer.scene.crosshairPos[2],
  ];
  if (preview) viewer.removeVolume(preview);
  state.loadedFrames = image.nFrame4D ?? 1;
  show(image, state.loadedFrames, !!preview);
  viewer.scene.crosshairPos = position;
  viewer.moveCrosshairInVox(0, 0, 0);
  status.textContent = `${state.loadedFrames} ${state.loadedFrames === 1 ? 'frame' : 'frames'} loaded.`;
  publish();
}
void open()
  .catch((error: unknown) => {
    status.textContent = controller.signal.aborted
      ? 'Loading cancelled.'
      : `Unable to load NIfTI image. ${String(error)}`;
    publish();
  })
  .finally(() => {
    cancel.disabled = true;
  });
