import {
  parseGradients,
  groupGradients,
  rotateDirection,
  type GradientTable,
  type GradientGrouping,
} from '../core/gradients.js';

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};
const api = acquireVsCodeApi();
function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing preview control: ${id}`);
  return node as T;
}
const sphere = element<HTMLCanvasElement>('sphere'),
  strip = element<HTMLCanvasElement>('strip');
let table: GradientTable | undefined;
let grouping: GradientGrouping | undefined;
let selected = 0,
  page = 0,
  yaw = 0.65,
  pitch = -0.25;
let lowB = 50,
  tolerance = 50;
let projected: { index: number; x: number; y: number; z: number }[] = [];
const saved: unknown = api.getState();
if (saved && typeof saved === 'object') {
  if ('selected' in saved && typeof saved.selected === 'number' && Number.isInteger(saved.selected))
    selected = Math.max(0, saved.selected);
  if ('yaw' in saved && typeof saved.yaw === 'number' && Number.isFinite(saved.yaw))
    yaw = saved.yaw;
  if ('pitch' in saved && typeof saved.pitch === 'number' && Number.isFinite(saved.pitch))
    pitch = Math.max(-1.5, Math.min(1.5, saved.pitch));
  if (
    'lowB' in saved &&
    typeof saved.lowB === 'number' &&
    Number.isFinite(saved.lowB) &&
    saved.lowB >= 0 &&
    saved.lowB <= 1000000
  )
    lowB = saved.lowB;
  if (
    'tolerance' in saved &&
    typeof saved.tolerance === 'number' &&
    Number.isFinite(saved.tolerance) &&
    saved.tolerance >= 0 &&
    saved.tolerance <= 1000000
  )
    tolerance = saved.tolerance;
}
function save(): void {
  api.setState({ selected, yaw, pitch, lowB, tolerance });
}
function report(): void {
  if (!table || !grouping) return;
  api.postMessage({
    type: 'rendered',
    volumeCount: table.volumes.length,
    selectedIndex: selected,
    selectedBValue: table.volumes[selected].b,
    lowBCount: grouping.lowBIndices.length,
    directionCount: grouping.plottedIndices.length,
    groupCount: grouping.groups.filter((g) => g.count > 0).length,
  });
}
function css(name: string, fallback: string): string {
  return getComputedStyle(document.body).getPropertyValue(name).trim() || fallback;
}
function palette(): string[] {
  return [
    css('--vscode-charts-yellow', '#b48600'),
    css('--vscode-charts-blue', '#478cff'),
    css('--vscode-charts-orange', '#d77a2a'),
    css('--vscode-charts-green', '#36a274'),
    css('--vscode-charts-purple', '#aa6cde'),
    css('--vscode-charts-red', '#e5686d'),
  ];
}
function canvasContext(canvas: HTMLCanvasElement): {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
} {
  const bounds = canvas.getBoundingClientRect(),
    ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(bounds.width * ratio));
  canvas.height = Math.max(1, Math.round(bounds.height * ratio));
  const ctx = canvas.getContext('2d');
  if (!ctx)
    throw new Error('Canvas rendering is unavailable. Use the numeric table or original files.');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.font = '12px ' + getComputedStyle(document.body).fontFamily;
  return { ctx, width: bounds.width, height: bounds.height };
}
function drawSphere(): void {
  if (!table || !grouping) return;
  const { ctx, width, height } = canvasContext(sphere),
    r = Math.max(20, Math.min(width, height) / 2 - 36),
    cx = width / 2,
    cy = height / 2;
  const colors = palette();
  const color = (index: number): string => colors[index % colors.length];
  const foreground = css('--vscode-editor-foreground', '#ccc'),
    line = css('--vscode-panel-border', '#666');
  ctx.strokeStyle = line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  for (const vertical of [false, true]) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, vertical ? r / 3 : r, vertical ? r : r / 3, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  const axes: readonly (readonly [number, number, number])[] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (let i = 0; i < axes.length; i++) {
    const p = rotateDirection(axes[i], yaw, pitch)!;
    ctx.strokeStyle = line;
    ctx.beginPath();
    ctx.moveTo(cx - p[0] * r, cy + p[1] * r);
    ctx.lineTo(cx + p[0] * r, cy - p[1] * r);
    ctx.stroke();
    ctx.fillStyle = foreground;
    ctx.fillText(['x', 'y', 'z'][i], cx + p[0] * (r + 15) - 3, cy - p[1] * (r + 15) + 4);
  }
  projected = grouping.plottedIndices
    .map((index) => {
      const p = rotateDirection(table!.volumes[index].vector, yaw, pitch)!;
      return { index, x: cx + p[0] * r, y: cy - p[1] * r, z: p[2] };
    })
    .sort((a, b) => a.z - b.z);
  for (const point of projected) {
    ctx.globalAlpha = point.z < 0 ? 0.45 : 0.95;
    ctx.fillStyle = color(grouping.groupByVolume[point.index]);
    ctx.beginPath();
    ctx.arc(point.x, point.y, point.index === selected ? 6 : 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const point = projected.find((p) => p.index === selected);
  if (point) {
    ctx.strokeStyle = foreground;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 9, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.fillStyle = foreground;
    ctx.textAlign = 'center';
    ctx.fillText('Selected volume has no displayed direction', cx, height - 8);
    ctx.textAlign = 'left';
  }
}
function drawStrip(): void {
  if (!table || !grouping) return;
  const { ctx, width, height } = canvasContext(strip),
    left = 58,
    right = Math.max(left + 1, width - 18),
    top = 25,
    bottom = Math.max(top + 1, height - 40);
  const max = Math.max(1, ...table.volumes.map((v) => v.b));
  const x = (index: number): number =>
    left + ((right - left) * index) / Math.max(1, table!.volumes.length - 1);
  const y = (b: number): number => bottom - (bottom - top) * (b / max);
  const colors = palette();
  const color = (index: number): string => colors[index % colors.length];
  const foreground = css('--vscode-editor-foreground', '#ccc'),
    line = css('--vscode-panel-border', '#666');
  ctx.strokeStyle = line;
  ctx.fillStyle = foreground;
  for (const fraction of [0, 0.5, 1]) {
    const position = bottom - (bottom - top) * fraction;
    ctx.beginPath();
    ctx.moveTo(left, position);
    ctx.lineTo(right, position);
    ctx.stroke();
    ctx.textAlign = 'right';
    ctx.fillText(
      (max * fraction).toLocaleString(undefined, { maximumFractionDigits: 0 }),
      left - 9,
      position + 4,
    );
  }
  ctx.textAlign = 'center';
  ctx.fillText('Volume', (left + right) / 2, height - 5);
  ctx.fillText('1', left, height - 20);
  ctx.fillText(String(table.volumes.length), right, height - 20);
  ctx.textAlign = 'left';
  ctx.fillText('b (s/mm²)', left, 12);
  for (const volume of table.volumes) {
    ctx.strokeStyle = color(grouping.groupByVolume[volume.index]);
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(x(volume.index), bottom);
    ctx.lineTo(x(volume.index), y(volume.b));
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = color(grouping.groupByVolume[volume.index]);
    ctx.beginPath();
    ctx.arc(x(volume.index), y(volume.b), 3, 0, Math.PI * 2);
    ctx.fill();
  }
  const volume = table.volumes[selected];
  ctx.strokeStyle = foreground;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x(selected), y(volume.b), 7, 0, Math.PI * 2);
  ctx.stroke();
}
function draw(): void {
  drawSphere();
  drawStrip();
}
function pair(label: string, value: string): void {
  const dt = document.createElement('dt'),
    dd = document.createElement('dd');
  dt.textContent = label;
  dd.textContent = value;
  element('selected-values').append(dt, dd);
}
function renderRows(): void {
  if (!table) return;
  const rows = element('rows');
  rows.replaceChildren();
  const start = page * 50,
    end = Math.min(table.volumes.length, start + 50);
  for (let i = start; i < end; i++) {
    const volume = table.volumes[i],
      row = document.createElement('tr');
    if (i === selected) row.classList.add('selected');
    const cell = document.createElement('td'),
      button = document.createElement('button');
    button.textContent = String(i + 1);
    button.setAttribute('aria-label', `Select volume ${i + 1}`);
    button.addEventListener('click', () => select(i));
    cell.append(button);
    row.append(cell);
    for (const token of volume.raw) {
      const td = document.createElement('td');
      td.textContent = token;
      row.append(td);
    }
    rows.append(row);
  }
  element('page-label').textContent = `${start + 1}–${end} of ${table.volumes.length}`;
  element<HTMLButtonElement>('page-back').disabled = page === 0;
  element<HTMLButtonElement>('page-next').disabled = end === table.volumes.length;
}
function select(index: number): void {
  if (!table || !grouping || !Number.isInteger(index)) return;
  selected = Math.max(0, Math.min(table.volumes.length - 1, index));
  page = Math.floor(selected / 50);
  const volume = table.volumes[selected],
    group = grouping.groups[grouping.groupByVolume[selected]];
  element<HTMLInputElement>('volume').value = String(selected + 1);
  element<HTMLInputElement>('volume').max = String(table.volumes.length);
  element('volume-total').textContent = `of ${table.volumes.length}`;
  element<HTMLButtonElement>('previous').disabled = selected === 0;
  element<HTMLButtonElement>('next').disabled = selected === table.volumes.length - 1;
  element('selected-values').replaceChildren();
  pair('b-value', volume.raw[0] + ' s/mm²');
  pair('Stored vector', volume.raw.slice(1).join(', '));
  pair('Vector length', volume.norm.toPrecision(6));
  pair(
    'Display group',
    group.lowB
      ? `Low-b (≤ ${lowB})`
      : `b ≈ ${group.mean!.toLocaleString(undefined, { maximumFractionDigits: 1 })}`,
  );
  draw();
  renderRows();
  save();
  report();
}
function regroup(): void {
  if (!table) return;
  grouping = groupGradients(table, lowB, tolerance);
  element('summary').textContent =
    `${table.volumes.length} volumes · ${grouping.plottedIndices.length} plotted directions · ${grouping.lowBIndices.length} low-b volumes${grouping.zeroDirectionIndices.length ? ` · ${grouping.zeroDirectionIndices.length} other zero-length vectors` : ''}`;
  element<HTMLInputElement>('low-b').value = String(lowB);
  element<HTMLInputElement>('tolerance').value = String(tolerance);
  const legend = element('legend');
  legend.replaceChildren();
  for (const group of grouping.groups.filter((g) => g.count)) {
    const item = document.createElement('span'),
      swatch = document.createElement('span');
    swatch.className = 'swatch group-' + (group.id % 6);
    item.append(
      swatch,
      document.createTextNode(
        `${group.lowB ? `Low-b ≤ ${lowB}` : `b ≈ ${group.mean!.toLocaleString(undefined, { maximumFractionDigits: 1 })}`} · ${group.count}`,
      ),
    );
    legend.append(item);
  }
  select(selected);
}
function showError(message: string): void {
  const error = element('error');
  error.hidden = false;
  error.textContent = message;
}
window.addEventListener('message', (event: MessageEvent<unknown>) => {
  const message = event.data;
  if (!message || typeof message !== 'object' || !('type' in message)) return;
  if (
    message.type === 'data' &&
    'bvalText' in message &&
    typeof message.bvalText === 'string' &&
    'bvecText' in message &&
    typeof message.bvecText === 'string' &&
    'bvalUri' in message &&
    typeof message.bvalUri === 'string' &&
    'bvecUri' in message &&
    typeof message.bvecUri === 'string' &&
    'capturedAt' in message &&
    typeof message.capturedAt === 'string'
  ) {
    try {
      if (message.bvalText.length > 1024 * 1024 || message.bvecText.length > 1024 * 1024)
        throw new Error('Preview payload exceeds its size limit.');
      table = parseGradients(message.bvalText, message.bvecText);
      selected = Math.min(selected, table.volumes.length - 1);
      element('error').hidden = true;
      element('source-name').textContent =
        decodeURIComponent(new URL(message.bvalUri).pathname.split('/').at(-1)!) +
        ' + ' +
        decodeURIComponent(new URL(message.bvecUri).pathname.split('/').at(-1)!);
      element('association').textContent =
        'imageUri' in message && typeof message.imageUri === 'string'
          ? 'Inherited pair for ' +
            message.imageUri +
            '. No image-volume count or anatomical orientation check. Reload resolves applicability again.'
          : 'Same-directory, same-basename pair. No image association or inherited applicability is inferred.';
      const sources = element('sources');
      sources.replaceChildren();
      for (const uri of [message.bvalUri, message.bvecUri]) {
        const p = document.createElement('p');
        p.textContent = uri;
        sources.append(p);
      }
      element('captured').textContent =
        'Read-only snapshot · ' +
        new Date(message.capturedAt).toLocaleString() +
        '. Reload explicitly after source changes.';
      regroup();
    } catch (error) {
      showError(String(error));
    }
  }
  if (message.type === 'error' && 'message' in message && typeof message.message === 'string')
    showError(message.message);
  if (message.type === 'selectVolume' && 'index' in message && typeof message.index === 'number')
    select(message.index);
});
for (const [id, change] of [
  ['rotate-left', [-0.15, 0]],
  ['rotate-right', [0.15, 0]],
  ['rotate-up', [0, -0.15]],
  ['rotate-down', [0, 0.15]],
] as const) {
  element(id).addEventListener('click', () => {
    yaw += change[0];
    pitch = Math.max(-1.5, Math.min(1.5, pitch + change[1]));
    drawSphere();
    save();
  });
}
element('reset').addEventListener('click', () => {
  yaw = 0.65;
  pitch = -0.25;
  drawSphere();
  save();
});
element('previous').addEventListener('click', () => select(selected - 1));
element('next').addEventListener('click', () => select(selected + 1));
element('volume').addEventListener('input', () =>
  select(Number(element<HTMLInputElement>('volume').value) - 1),
);
for (const id of ['low-b', 'tolerance'])
  element(id).addEventListener('change', () => {
    const low = Number(element<HTMLInputElement>('low-b').value),
      tol = Number(element<HTMLInputElement>('tolerance').value);
    if (![low, tol].every((v) => Number.isFinite(v) && v >= 0 && v <= 1000000)) {
      showError('Display thresholds must be between 0 and 1,000,000.');
      return;
    }
    lowB = low;
    tolerance = tol;
    element('error').hidden = true;
    regroup();
  });
element('page-back').addEventListener('click', () => {
  page = Math.max(0, page - 1);
  renderRows();
});
element('page-next').addEventListener('click', () => {
  if (table) page = Math.min(Math.ceil(table.volumes.length / 50) - 1, page + 1);
  renderRows();
});
for (const which of ['bval', 'bvec'])
  element('raw-' + which).addEventListener('click', () =>
    api.postMessage({ type: 'openRaw', which }),
  );
element('reload').addEventListener('click', () => api.postMessage({ type: 'reload' }));
strip.addEventListener('click', (event) => {
  if (!table) return;
  const bounds = strip.getBoundingClientRect();
  select(
    Math.round(
      ((event.clientX - bounds.left - 58) / Math.max(1, bounds.width - 76)) *
        Math.max(1, table.volumes.length - 1),
    ),
  );
});
strip.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    select(selected + (event.key === 'ArrowLeft' ? -1 : 1));
  }
});
let drag: { x: number; y: number; distance: number } | undefined;
sphere.addEventListener('pointerdown', (event) => {
  drag = { x: event.clientX, y: event.clientY, distance: 0 };
  sphere.setPointerCapture(event.pointerId);
});
sphere.addEventListener('pointermove', (event) => {
  if (!drag) return;
  const dx = event.clientX - drag.x,
    dy = event.clientY - drag.y;
  drag.distance += Math.abs(dx) + Math.abs(dy);
  yaw += dx * 0.008;
  pitch = Math.max(-1.5, Math.min(1.5, pitch + dy * 0.008));
  drag.x = event.clientX;
  drag.y = event.clientY;
  drawSphere();
});
sphere.addEventListener('pointerup', (event) => {
  if (!drag) return;
  const click = drag.distance < 5;
  drag = undefined;
  sphere.releasePointerCapture(event.pointerId);
  save();
  if (click) {
    const bounds = sphere.getBoundingClientRect();
    const point = projected
      .map((p) => ({
        ...p,
        distance: Math.hypot(
          p.x - (event.clientX - bounds.left),
          p.y - (event.clientY - bounds.top),
        ),
      }))
      .filter((p) => p.distance <= 12)
      .sort((a, b) => a.distance - b.distance || b.z - a.z)[0];
    if (point) select(point.index);
  }
});
sphere.addEventListener('pointercancel', () => {
  drag = undefined;
});
sphere.addEventListener('keydown', (event) => {
  const delta: Record<string, readonly [number, number]> = {
    ArrowLeft: [-0.15, 0],
    ArrowRight: [0.15, 0],
    ArrowUp: [0, -0.15],
    ArrowDown: [0, 0.15],
  };
  const change = delta[event.key];
  if (change) {
    event.preventDefault();
    yaw += change[0];
    pitch = Math.max(-1.5, Math.min(1.5, pitch + change[1]));
    drawSphere();
    save();
  }
});
new ResizeObserver(() => draw()).observe(element('summary').parentElement!);
new MutationObserver(() => draw()).observe(document.body, {
  attributes: true,
  attributeFilter: ['class', 'style'],
});
api.postMessage({ type: 'ready' });
