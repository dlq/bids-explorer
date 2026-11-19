import { Niivue, NVImage, MULTIPLANAR_TYPE, SHOW_RENDER } from '@niivue/niivue';
import { readVoxelSignal, signalTime, type SignalTiming } from './voxelSignal.js';
import { readNiftiStream } from './niftiStream.js';
import type { CutawaySide, ImageControl, ImageState, LightboxSettings } from './imageViewTypes';

const canvas = document.querySelector<HTMLCanvasElement>('canvas')!;
const status = document.getElementById('load-status')!;
const cancel = document.querySelector<HTMLButtonElement>('#cancel')!;
declare function acquireVsCodeApi(): { postMessage(message: unknown): void };
const api = acquireVsCodeApi();
const viewer = new Niivue({
  multiplanarPadPixels: 4,
  clipPlaneHotKey: '',
  cycleClipPlaneHotKey: '',
  clipPlaneColor: [0, 0, 0, 0],
  multiplanarLayout: MULTIPLANAR_TYPE.GRID,
  multiplanarShowRender: SHOW_RENDER.ALWAYS,
});
let volume: NVImage | undefined;
let defaultWindow: [number, number] = [0, 1];
const defaultCorner = ['right', 'anterior', 'superior'] as const;
const sideDirections: Record<CutawaySide, readonly [number, number, number]> = {
  right: [1, 270, 0],
  left: [-1, 90, 0],
  anterior: [1, 0, 0],
  posterior: [-1, 180, 0],
  superior: [1, 0, -90],
  inferior: [-1, 0, 90],
};
const state: ImageState = {
  status: 'Loading image…',
  playbackRate: 5,
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
    orientation: 'neurological',
    volumeMode: 'cutaway',
    cutawayCorner: defaultCorner,
  },
};
let lastPublishedSignal: ImageState['signal'];
function publish(inspect = false) {
  const { signal, ...summary } = state;
  const signalUpdate = inspect || signal !== lastPublishedSignal ? { signal } : {};
  lastPublishedSignal = signal;
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
    ...summary,
    ...signalUpdate,
    ...(inspect
      ? {
          clipPlanes: viewer.scene.clipPlaneDepthAziElevs,
          camera: [viewer.scene.renderAzimuth, viewer.scene.renderElevation],
          slicePositions: viewer.screenSlices.map((slice) => slice.sliceFrac),
        }
      : {}),
    renderedPanels: viewer.screenSlices.map((slice) => slice.axCorSag),
  });
}
let playbackTimer = 0;
let nextPlaybackFrame = 0;
function pausePlayback() {
  cancelAnimationFrame(playbackTimer);
  playbackTimer = 0;
  state.playing = false;
}
function selectFrame(frame: number) {
  state.display.frame = frame;
  viewer.setFrame4D(volume!.id, frame - 1);
  updatePosition();
}
function advancePlayback() {
  playbackTimer = requestAnimationFrame((now) => {
    if (now >= nextPlaybackFrame) {
      nextPlaybackFrame = now + 1000 / (state.playbackRate ?? 5);
      selectFrame(state.display.frame + 1);
      if (state.display.frame === state.loadedFrames) pausePlayback();
      publish();
    }
    if (state.playing) advancePlayback();
  });
}
const controller = new AbortController();
controller.signal.addEventListener('abort', () => {
  pausePlayback();
  publish();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pausePlayback();
    publish();
  }
});
cancel.onclick = () => controller.abort();
document.getElementById('image-controls')!.onclick = () =>
  api.postMessage({ type: 'showImageControls' });
window.addEventListener('pagehide', () => controller.abort(), { once: true });
const screenshot = document.querySelector<HTMLButtonElement>('#save-screenshot')!;
const screenshotStatus = document.getElementById('screenshot-status')!;
screenshot.onclick = () => {
  screenshot.disabled = true;
  screenshotStatus.textContent = 'Capturing screenshot…';
  api.postMessage({ type: 'saveScreenshot' });
};

async function captureScreenshot(request: string, imageName: string) {
  try {
    if (!state.navigationEnabled || !canvas.width || !canvas.height) throw new Error();
    viewer.drawScene();
    const scale = Math.min(1, 2048 / Math.max(canvas.width, canvas.height));
    const output = document.createElement('canvas');
    const width = Math.max(1, Math.round(canvas.width * scale));
    const height = Math.max(1, Math.round(canvas.height * scale));
    output.width = width;
    output.height = height + 56;
    const context = output.getContext('2d');
    if (!context) throw new Error();
    context.fillStyle = '#000';
    context.fillRect(0, 0, output.width, output.height);
    context.drawImage(canvas, 0, 0, width, height);
    context.fillStyle = '#fff';
    context.font = '14px sans-serif';
    const spacing = state.information.find((row) => row.label === 'Voxel spacing')?.value;
    const layouts: Record<string, string> = {
      quad: 'Three planes + 3D',
      multiplanar: 'Three planes',
      volume: '3D volume',
      axial: 'Axial',
      coronal: 'Coronal',
      sagittal: 'Sagittal',
      lightbox: 'Lightbox',
    };
    const lightbox = state.display.layout === 'lightbox' ? state.lightbox?.settings : undefined;
    const layout = layouts[state.display.layout] ?? 'NIfTI view';
    const cutaway =
      ['quad', 'volume'].includes(state.display.layout) && state.display.volumeMode === 'cutaway'
        ? ` · Cutaway ${(state.display.cutawayCorner ?? []).join(', ')}`
        : '';
    context.fillText(imageName, 8, height + 20, Math.max(1, width - 16));
    context.fillText(
      [
        layout +
          (lightbox
            ? ` (${lightbox.plane} ${lightbox.first}–${lightbox.last}, step ${lightbox.step})`
            : '') +
          cutaway,
        state.display.layout !== 'volume' ? state.display.orientation : undefined,
        `Volume ${state.display.frame}`,
        spacing ? `Voxel spacing ${spacing}` : undefined,
      ]
        .filter(Boolean)
        .join(' · '),
      8,
      height + 42,
      Math.max(1, width - 16),
    );
    const png = await new Promise<Blob | null>((resolve) => output.toBlob(resolve, 'image/png'));
    api.postMessage({ type: 'screenshotCaptured', request, bytes: await png?.arrayBuffer() });
  } catch {
    api.postMessage({ type: 'screenshotCaptured', request });
  }
}

const spatialUnits = new Map([
  [1, 'm'],
  [2, 'mm'],
  [3, 'µm'],
]);

let metadataTiming: SignalTiming = {};
let signalKey = '';
let signalGeneration = 0;
function currentTiming(): SignalTiming {
  const total = Math.max(state.loadedFrames, state.previewFrames);
  if (metadataTiming.starts?.length === total)
    return { ...metadataTiming, source: 'JSON frame times' };
  if (metadataTiming.step && Number.isFinite(metadataTiming.step * (total - 1)))
    return { ...metadataTiming, starts: undefined, source: 'JSON RepetitionTime' };
  const header = volume?.hdr;
  const scale = new Map([
    [8, 1],
    [16, 0.001],
    [24, 0.000001],
  ]).get((header?.xyzt_units ?? 0) & 56);
  const step = (header?.pixDims[4] ?? 0) * (scale ?? 0);
  return {
    units: metadataTiming.units,
    ...(step > 0 && Number.isFinite(step * (total - 1) + (header?.toffset ?? 0) * (scale ?? 0))
      ? {
          step,
          offset: Number.isFinite(header?.toffset) ? header!.toffset * scale! : 0,
          source: 'NIfTI header',
        }
      : {}),
  };
}
function updateSignal(voxel: readonly number[]) {
  const total = Math.max(state.loadedFrames, state.previewFrames);
  if (!volume || total < 2) return;
  const timing = currentTiming();
  state.signalPosition = timing.source
    ? signalTime(state.display.frame - 1, timing)
    : state.display.frame;
  const key = [voxel.join(','), state.loadedFrames, state.previewFrames, signalGeneration].join(
    ':',
  );
  if (key === signalKey) return;
  signalKey = key;
  state.signal = {
    voxel,
    total,
    frames: [],
    x: [],
    values: [],
    axis: '',
    units: '',
    pending: true,
  };
  const image = volume;
  void readVoxelSignal(
    voxel,
    total,
    state.loadedFrames || 1,
    (frame) => image.getValue(voxel[0], voxel[1], voxel[2], frame),
    timing,
    () => signalKey !== key || controller.signal.aborted,
  ).then((signal) => {
    if (!signal || signalKey !== key) return;
    state.signal = signal;
    publish();
  });
}

function updatePosition() {
  if (!volume) return;
  const voxel = Array.from(viewer.frac2vox(viewer.scene.crosshairPos));
  const header = volume.hdr;
  const units = spatialUnits.get((header?.xyzt_units ?? 0) & 7);
  const matrix = volume.matRAS;
  const [a, b, c, , d, e, f, , g, h, i] = matrix ?? [];
  const determinant = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  const valid =
    matrix &&
    Array.from(matrix).every(Number.isFinite) &&
    Number.isFinite(determinant) &&
    determinant !== 0;
  const hasQform = (header?.qform_code ?? 0) > 0;
  const hasSform = (header?.sform_code ?? 0) > 0;
  const physical =
    units && valid && (hasQform || hasSform) ? Array.from(viewer.vox2mm(voxel, matrix)) : undefined;
  const transform = !units
    ? 'Physical coordinates unavailable. Spatial units are missing.'
    : !hasQform && !hasSform
      ? 'Physical coordinates unavailable. No qform or sform is recorded.'
      : !physical?.every(Number.isFinite)
        ? 'Physical coordinates unavailable. The viewer transform is invalid.'
        : hasQform && hasSform
          ? 'Image coordinates use the viewer’s NIfTI affine. Both qform and sform are recorded and may differ.'
          : 'Image coordinates use the viewer’s NIfTI affine.';
  state.coordinates = {
    voxel,
    physical: physical?.every(Number.isFinite) ? physical : undefined,
    units,
    transform,
  };
  state.position = `Voxel position X ${voxel[0]}, Y ${voxel[1]}, Z ${voxel[2]}.`;
  updateSignal(voxel);
  const intensity = volume.getValue(voxel[0], voxel[1], voxel[2], state.display.frame - 1);
  state.voxelValue = Number.isFinite(intensity)
    ? String(Number(intensity.toPrecision(8)))
    : String(intensity);
}

function goToPosition(image: NVImage, value: unknown) {
  if (!value || typeof value !== 'object' || !('space' in value) || !('coordinates' in value))
    return;
  const { space, coordinates } = value;
  if (
    (space !== 'voxel' && space !== 'physical') ||
    !Array.isArray(coordinates) ||
    coordinates.length !== 3 ||
    !coordinates.every((part: unknown) => typeof part === 'number' && Number.isFinite(part))
  )
    return;
  if (
    (space === 'physical' && !state.coordinates?.physical) ||
    (space === 'voxel' && !coordinates.every(Number.isInteger))
  ) {
    state.positionError =
      space === 'physical'
        ? 'Physical coordinates are unavailable for this image.'
        : 'Enter whole-number voxel indices.';
    return;
  }
  const voxel =
    space === 'physical'
      ? Array.from(image.mm2vox(coordinates as number[]))
      : (coordinates as number[]);
  const dimensions = image.dimsRAS;
  if (
    !dimensions ||
    !voxel.every(
      (index, axis) => Number.isInteger(index) && index >= 0 && index < dimensions[axis + 1],
    )
  ) {
    state.positionError = 'That position is outside the image.';
    return;
  }
  state.positionError = undefined;
  const current = viewer.frac2vox(viewer.scene.crosshairPos);
  viewer.moveCrosshairInVox(voxel[0] - current[0], voxel[1] - current[1], voxel[2] - current[2]);
}

function faceCutaway() {
  const [x, y, z] = state.display.cutawayCorner ?? defaultCorner;
  const azimuth =
    180 + (Math.atan2(x === 'right' ? 1 : -1, y === 'anterior' ? 1 : -1) * 180) / Math.PI;
  viewer.setRenderAzimuthElevation(azimuth, z === 'superior' ? 35 : -35);
}
function updateCutaway() {
  const enabled = state.display.volumeMode === 'cutaway';
  if (!enabled && !viewer.opts.isClipPlanesCutaway) return;
  viewer.opts.isClipPlanesCutaway = enabled;
  const corner = state.display.cutawayCorner ?? defaultCorner;
  viewer.setClipPlanes(
    enabled
      ? corner.map((side, axis) => {
          const [direction, azimuth, elevation] = sideDirections[side];
          // NiiVue clips the positive half-space in RAS texture coordinates.
          const depth = direction * (0.5 - viewer.scene.crosshairPos[axis]);
          return [depth, azimuth, elevation];
        })
      : [],
  );
}

function guardClipGesture(event: MouseEvent) {
  if (state.display.volumeMode !== 'cutaway') return;
  if (event.type === 'mousedown' && event.button !== 2) return;
  const bounds = canvas.getBoundingClientRect();
  const x = ((event.clientX - bounds.left) * canvas.width) / bounds.width;
  const y = ((event.clientY - bounds.top) * canvas.height) / bounds.height;
  const inVolume = viewer.screenSlices.some(
    ({ axCorSag, leftTopWidthHeight: [left, top, width, height] }) =>
      axCorSag === viewer.sliceTypeRender &&
      x >= left &&
      x < left + width &&
      y >= top &&
      y < top + height,
  );
  if (inVolume) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}
canvas.addEventListener('mousedown', guardClipGesture, { capture: true });
canvas.addEventListener('wheel', guardClipGesture, { capture: true, passive: false });

const lightboxAxes = { axial: 2, coronal: 1, sagittal: 0 } as const;

function setLightbox(image: NVImage, value: unknown) {
  if (!value || typeof value !== 'object' || !('plane' in value)) return;
  const { plane } = value;
  if (plane !== 'axial' && plane !== 'coronal' && plane !== 'sagittal') return;
  const axis = lightboxAxes[plane];
  const dimension = image.dimsRAS?.[axis + 1];
  if (!dimension || !image.frac2mmOrtho) return;
  const lastIndex = dimension - 1;
  let settings: LightboxSettings = {
    plane,
    first: 0,
    last: lastIndex,
    step: Math.max(1, Math.ceil(lastIndex / 11)),
  };
  if ('first' in value && 'last' in value && 'step' in value) {
    const { first, last, step } = value;
    if (!state.lightbox) return;
    if (
      typeof first !== 'number' ||
      typeof last !== 'number' ||
      typeof step !== 'number' ||
      ![first, last, step].every(Number.isSafeInteger) ||
      first < 0 ||
      last < first ||
      last > lastIndex ||
      step < 1 ||
      Math.floor((last - first) / step) >= 24
    ) {
      state.lightbox.error =
        'Choose an in-range first and last slice and positive spacing for up to 24 slices.';
      return;
    }
    settings = { plane, first, last, step };
  }
  // Mosaic positions use the same orthogonal image coordinates as the 2D viewer.
  const rows: string[][] = [];
  const count = Math.floor((settings.last - settings.first) / settings.step) + 1;
  const columns = Math.ceil(Math.sqrt(count));
  for (let index = 0; index < count; index++) {
    const fraction: [number, number, number] = [0.5, 0.5, 0.5];
    fraction[axis] = (settings.first + index * settings.step + 0.5) / dimension;
    const position = image.convertFrac2MM(fraction)[axis];
    if (!Number.isFinite(position)) return;
    if (index % columns === 0) rows.push([]);
    rows[rows.length - 1].push(String(position));
  }
  state.lightbox = { settings, lastIndex, count };
  viewer.setSliceMosaicString(
    `L ${plane[0].toUpperCase()} ${rows.map((row) => row.join(' ')).join('; ')}`,
  );
}

function applyControl(control: ImageControl) {
  if (control.action === 'cancel') {
    controller.abort();
    return;
  }
  const { action, value } = control;
  if (action === 'signalTiming' && value && typeof value === 'object') {
    const timing = value as SignalTiming;
    const starts = timing.starts;
    metadataTiming = {
      starts:
        Array.isArray(starts) &&
        starts.length > 1 &&
        starts.length <= 100000 &&
        starts.every((time, i) => Number.isFinite(time) && (i === 0 || time > starts[i - 1]))
          ? starts
          : undefined,
      step:
        typeof timing.step === 'number' && Number.isFinite(timing.step) && timing.step > 0
          ? timing.step
          : undefined,
      units: typeof timing.units === 'string' ? timing.units.slice(0, 80) : undefined,
    };
    signalGeneration++;
    updatePosition();
    publish();
    return;
  }
  if (!volume || !state.navigationEnabled) return;
  if (action === 'pause') pausePlayback();
  if (action === 'playbackRate' && typeof value === 'number' && [1, 2, 5, 10].includes(value)) {
    state.playbackRate = value;
    if (state.playing) {
      cancelAnimationFrame(playbackTimer);
      nextPlaybackFrame = performance.now() + 1000 / value;
      advancePlayback();
    }
  }
  if (action === 'play' && state.loadedFrames > 1 && !controller.signal.aborted && !state.playing) {
    if (state.display.frame === state.loadedFrames) selectFrame(1);
    state.playing = true;
    nextPlaybackFrame = performance.now() + 1000 / (state.playbackRate ?? 5);
    advancePlayback();
  }
  if (action === 'lightbox' && state.display.layout === 'lightbox') setLightbox(volume, value);
  if (action === 'position') goToPosition(volume, value);
  if (action === 'volumeMode' && (value === 'full' || value === 'cutaway')) {
    state.display.volumeMode = value;
    updateCutaway();
    if (value === 'cutaway') faceCutaway();
  }
  if (action === 'cutawayCorner' && Array.isArray(value) && value.length === 3) {
    const [x, y, z] = value as unknown[];
    if (
      (x === 'left' || x === 'right') &&
      (y === 'anterior' || y === 'posterior') &&
      (z === 'superior' || z === 'inferior')
    ) {
      state.display.cutawayCorner = [x, y, z];
      updateCutaway();
      faceCutaway();
    }
  }
  if (action === 'orientation' && (value === 'neurological' || value === 'radiological')) {
    state.display.orientation = value;
    viewer.setRadiologicalConvention(value === 'radiological');
  }
  if (action === 'layout' && typeof value === 'string') {
    const layouts: Record<string, number> = {
      quad: viewer.sliceTypeMultiplanar,
      multiplanar: viewer.sliceTypeMultiplanar,
      volume: viewer.sliceTypeRender,
      axial: viewer.sliceTypeAxial,
      coronal: viewer.sliceTypeCoronal,
      sagittal: viewer.sliceTypeSagittal,
    };
    if (value === 'lightbox') {
      setLightbox(volume, state.lightbox?.settings ?? { plane: 'axial' });
      if (state.lightbox) state.display.layout = 'lightbox';
    } else if (Object.hasOwn(layouts, value)) {
      if (state.display.layout === 'lightbox') viewer.setSliceMosaicString('');
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
    pausePlayback();
    selectFrame(value);
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
    pausePlayback();
    state.positionError = undefined;
    state.display.cutawayCorner = defaultCorner;
    applyControl({ action: 'volumeMode', value: 'cutaway' });
    applyControl({ action: 'orientation', value: 'neurological' });
    applyControl({ action: 'layout', value: 'quad' });
    state.lightbox = undefined;
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
  if (event.origin !== window.location.origin) return;
  const message = event.data;
  if (message && typeof message === 'object' && 'type' in message) {
    if (
      message.type === 'captureScreenshot' &&
      'request' in message &&
      typeof message.request === 'string' &&
      'imageName' in message &&
      typeof message.imageName === 'string'
    )
      void captureScreenshot(message.request, message.imageName);
    if (
      message.type === 'screenshotStatus' &&
      'text' in message &&
      typeof message.text === 'string'
    ) {
      screenshotStatus.textContent = message.text;
      screenshot.disabled = !state.navigationEnabled;
    }
  }
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
  const units = spatialUnits.get(header.xyzt_units & 7) ?? 'units not recorded';
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
  if (!restore) faceCutaway();
  state.navigationEnabled = true;
  if (!screenshotStatus.textContent) screenshot.disabled = false;
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
  viewer.onLocationChange = () => {
    updatePosition();
    updateCutaway();
    publish();
  };
  viewer.onIntensityChange = (image) => {
    state.display.minimum = image.cal_min ?? 0;
    state.display.maximum = image.cal_max ?? 1;
    publish();
  };
  controller.signal.throwIfAborted();
  let stopReading: () => void;
  const bytes = new ReadableStream<Uint8Array<ArrayBuffer>>(
    {
      start(output) {
        const signal = controller.signal;
        const cleanup = () => {
          window.removeEventListener('message', receive);
          signal.removeEventListener('abort', abort);
        };
        const abort = () => {
          cleanup();
          api.postMessage('cancelNiftiRead');
          output.error(signal.reason);
        };
        const receive = (event: MessageEvent<unknown>) => {
          const message = event.data;
          if (
            event.origin !== window.location.origin ||
            !message ||
            typeof message !== 'object' ||
            !('type' in message)
          )
            return;
          if (
            message.type === 'niftiChunk' &&
            'bytes' in message &&
            message.bytes instanceof ArrayBuffer
          ) {
            output.enqueue(new Uint8Array(message.bytes));
          } else if (message.type === 'niftiEnd') {
            cleanup();
            output.close();
          } else if (message.type === 'niftiReadError') {
            cleanup();
            output.error(new Error('Could not read the image file.'));
          }
        };
        window.addEventListener('message', receive);
        signal.addEventListener('abort', abort, { once: true });
        stopReading = () => {
          cleanup();
          api.postMessage('cancelNiftiRead');
        };
      },
      pull() {
        api.postMessage('readNiftiChunk');
      },
      cancel() {
        stopReading();
      },
    },
    { highWaterMark: 0 },
  );
  const stream =
    canvas.dataset.gzip === 'true' ? bytes.pipeThrough(new DecompressionStream('gzip')) : bytes;
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
    cancel.hidden = true;
  });
