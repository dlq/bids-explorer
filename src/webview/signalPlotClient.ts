import type { ImageState } from './imageViewTypes';
import type { VoxelSignal } from './voxelSignal';

const canvas = document.getElementById('signal-plot') as HTMLCanvasElement;
const axis = document.getElementById('signal-axis')!;
const current = document.getElementById('signal-current')!;
const coverage = document.getElementById('signal-coverage')!;
let signal: VoxelSignal | null = null;
let state: ImageState | undefined;

export function updateSignalPlot(next: ImageState | undefined, trace?: VoxelSignal | null) {
  state = next;
  if (trace !== undefined) signal = trace;
  document.getElementById('voxel-signal')!.hidden =
    Math.max(next?.loadedFrames ?? 0, next?.previewFrames ?? 0) < 2;
  const voxel = signal?.voxel.join(', ') ?? '';
  axis.textContent = signal ? signal.axis + ' · ' + signal.units : '';
  current.textContent = next
    ? `Voxel ${voxel} · Volume ${next.display.frame} · Value ${next.voxelValue ?? 'unavailable'}`
    : '';
  coverage.textContent = !signal?.frames.length
    ? 'Reading signal…'
    : signal.pending
      ? `Showing ${signal.frames.length} loaded volume. ${/cancelled|Unable/.test(next?.status ?? '') ? 'Loading stopped before the remaining volumes arrived.' : 'Remaining volumes are loading.'}`
      : signal.total > signal.frames.length
        ? `Showing ${signal.frames.length} evenly spaced samples of ${signal.total} volumes. Brief changes between samples may be omitted.`
        : `All ${signal.total} volumes. Click the plot or use Left and Right to select a volume.`;
  draw();
}

function draw() {
  const context = canvas.getContext('2d');
  if (!context) return;
  const width = Math.max(1, canvas.clientWidth);
  const height = 160;
  canvas.width = Math.round(width * devicePixelRatio);
  canvas.height = Math.round(height * devicePixelRatio);
  context.scale(devicePixelRatio, devicePixelRatio);
  context.clearRect(0, 0, width, height);
  if (!signal?.x.length) return;
  const finite = signal.values.filter((value): value is number => value !== null);
  if (!finite.length) {
    coverage.textContent = 'No finite signal values at this voxel.';
    return;
  }
  let low = Math.min(...finite),
    high = Math.max(...finite);
  if (low === high) {
    low -= 0.5;
    high += 0.5;
  }
  const first = signal.x[0],
    last = signal.x[signal.x.length - 1];
  const left = 48,
    right = Math.max(left + 1, width - 12),
    top = 12,
    bottom = 132;
  const x = (value: number) => left + ((value - first) / (last - first || 1)) * (right - left);
  const y = (value: number) => bottom - ((value - low) / (high - low)) * (bottom - top);
  const style = getComputedStyle(document.body);
  context.strokeStyle = style.getPropertyValue('--vscode-charts-blue').trim() || '#3794ff';
  context.lineWidth = 1.5;
  context.beginPath();
  let connected = false;
  signal.values.forEach((value, index) => {
    if (value === null) {
      connected = false;
      return;
    }
    if (connected) context.lineTo(x(signal!.x[index]), y(value));
    else context.moveTo(x(signal!.x[index]), y(value));
    connected = true;
  });
  context.stroke();
  context.fillStyle = style.color;
  context.font = '11px sans-serif';
  context.fillText(high.toPrecision(3), 0, top + 4);
  context.fillText(low.toPrecision(3), 0, bottom);
  context.fillText(String(Number(first.toPrecision(5))), left, 152);
  context.textAlign = 'right';
  context.fillText(String(Number(last.toPrecision(5))), right, 152);
  const marker = state?.signalPosition ?? first;
  context.strokeStyle = style.getPropertyValue('--vscode-charts-orange').trim() || '#d18616';
  context.beginPath();
  context.moveTo(x(marker), top);
  context.lineTo(x(marker), bottom);
  context.stroke();
  canvas.setAttribute('aria-label', `${current.textContent}. ${axis.textContent}.`);
}

export function bindSignalPlot(select: (frame: number) => void) {
  canvas.onkeydown = (event) => {
    if (!state || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    select(
      Math.max(
        1,
        Math.min(
          state.loadedFrames || 1,
          state.display.frame + (event.key === 'ArrowRight' ? 1 : -1),
        ),
      ),
    );
  };
  canvas.onclick = (event) => {
    if (!signal?.frames.length) return;
    const bounds = canvas.getBoundingClientRect();
    const fraction = Math.max(
      0,
      Math.min(1, (event.clientX - bounds.left - 48) / Math.max(1, bounds.width - 60)),
    );
    const position = signal.x[0] + fraction * (signal.x[signal.x.length - 1] - signal.x[0]);
    let nearest = 0;
    signal.x.forEach((value, index) => {
      if (Math.abs(value - position) < Math.abs(signal!.x[nearest] - position)) nearest = index;
    });
    select(signal.frames[nearest]);
  };
  new ResizeObserver(draw).observe(canvas);
}
