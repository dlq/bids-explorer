import type {
  RecordingViewSnapshot,
  RecordingWindow,
  RecordingTrace,
} from '../core/recordingTypes';
declare function acquireVsCodeApi(): { postMessage(message: unknown): void };
const api = acquireVsCodeApi();
const node = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
let snapshot: RecordingViewSnapshot | undefined,
  windowData: RecordingWindow | undefined,
  busy = false,
  first = true,
  page = 0;
const selected = new Set<number>();
const inputNumber = (id: string): number => {
  const value = node<HTMLInputElement>(id).value;
  return value.trim() ? Number(value) : NaN;
};
const send = (type: string, request?: unknown) =>
  api.postMessage({ type, token: snapshot?.token, request });
function setBusy(value: boolean): void {
  busy = value;
  for (const id of ['start', 'duration', 'load', 'previous', 'next', 'reload'])
    node<HTMLButtonElement | HTMLInputElement>(id).disabled = value;
  node<HTMLButtonElement>('cancel').disabled = !value;
  if (!value && snapshot) {
    node<HTMLButtonElement>('previous').disabled =
      Number(node<HTMLInputElement>('start').value) <= 0;
    node<HTMLButtonElement>('next').disabled =
      !!windowData && windowData.endSeconds >= snapshot.header.recordedSeconds!;
  }
}
function load(): void {
  if (!snapshot || busy) return;
  node('error').hidden = true;
  node('status').textContent = 'Loading requested channels and time window…';
  setBusy(true);
  send('loadWindow', {
    startSeconds: inputNumber('start'),
    durationSeconds: inputNumber('duration'),
    channels: [...selected],
  });
}
function renderChannels(): void {
  if (!snapshot) return;
  const query = node<HTMLInputElement>('filter').value.toLowerCase();
  const rows = snapshot.header.signals
    .map((channel, index) => ({ channel, index }))
    .filter(({ channel }) => !channel.annotations && channel.label.toLowerCase().includes(query));
  page = Math.max(0, Math.min(page, Math.ceil(rows.length / 20) - 1));
  node('channels').replaceChildren();
  for (const { channel, index } of rows.slice(page * 20, page * 20 + 20)) {
    const label = document.createElement('label'),
      input = document.createElement('input'),
      text = document.createElement('span');
    input.type = 'checkbox';
    input.id = 'channel-' + index;
    input.checked = selected.has(index);
    input.setAttribute(
      'aria-label',
      `Show ${channel.label || 'unnamed channel'} (channel ${index + 1})`,
    );
    input.addEventListener('change', () => {
      if (input.checked && selected.size >= 8) {
        input.checked = false;
        node('error').textContent = 'Choose at most eight channels.';
        node('error').hidden = false;
        return;
      }
      if (input.checked) selected.add(index);
      else selected.delete(index);
      node('selection').textContent =
        `${selected.size} of ${snapshot!.header.signals.filter((c) => !c.annotations).length} signal channels selected · up to 8 at once`;
    });
    text.textContent = `${index + 1}. ${channel.label || '(unnamed channel)'} · ${channel.samplingFrequency} Hz · ${channel.unit || 'Unit not recorded'}`;
    label.append(input, text);
    node('channels').append(label);
  }
  node('selection').textContent =
    `${selected.size} of ${snapshot.header.signals.filter((c) => !c.annotations).length} signal channels selected · up to 8 at once`;
  node('channel-page').textContent =
    `${rows.length ? page * 20 + 1 : 0}–${Math.min(rows.length, (page + 1) * 20)} of ${rows.length} channels`;
  node<HTMLButtonElement>('channels-previous').disabled = page === 0;
  node<HTMLButtonElement>('channels-next').disabled = (page + 1) * 20 >= rows.length;
}
function draw(canvas: HTMLCanvasElement, trace: RecordingTrace): void {
  if (!windowData) return;
  const ratio = window.devicePixelRatio || 1,
    w = Math.max(200, canvas.clientWidth),
    h = 150;
  canvas.width = w * ratio;
  canvas.height = h * ratio;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const style = getComputedStyle(document.body),
    left = 72,
    right = w - 18,
    top = 18,
    bottom = h - 30;
  const scale = Math.max(Math.abs(trace.minimum), Math.abs(trace.maximum), 1e-300);
  const minimum = trace.minimum / scale,
    maximum = trace.maximum / scale;
  const padding =
    maximum === minimum ? Math.max(Math.abs(minimum) * 0.05, 1e-6) : (maximum - minimum) * 0.08;
  const low = minimum - padding,
    high = maximum + padding;
  ctx.strokeStyle = style.getPropertyValue('--vscode-panel-border').trim() || '#888888';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(left, bottom);
  ctx.lineTo(right, bottom);
  ctx.stroke();
  ctx.fillStyle = style.getPropertyValue('--vscode-foreground').trim() || '#888888';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(trace.maximum.toPrecision(4), left - 8, top + 8);
  ctx.fillText(trace.minimum.toPrecision(4), left - 8, bottom);
  for (let tick = 0; tick <= 4; tick++) {
    const x = left + ((right - left) * tick) / 4;
    ctx.textAlign = tick === 0 ? 'left' : tick === 4 ? 'right' : 'center';
    ctx.fillText(
      (
        windowData.startSeconds +
        ((windowData.endSeconds - windowData.startSeconds) * tick) / 4
      ).toFixed(2) + ' s',
      x,
      h - 7,
    );
    ctx.beginPath();
    ctx.moveTo(x, bottom);
    ctx.lineTo(x, bottom + 4);
    ctx.stroke();
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, right - left, bottom - top);
  ctx.clip();
  ctx.strokeStyle = style.getPropertyValue('--vscode-charts-blue').trim() || '#3794ff';
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  trace.points.forEach((point, index) => {
    const x =
        left +
        ((point.timeSeconds - windowData!.startSeconds) /
          (windowData!.endSeconds - windowData!.startSeconds)) *
          (right - left),
      y = bottom - ((point.value / scale - low) / (high - low)) * (bottom - top);
    if (index) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  });
  ctx.stroke();
  ctx.restore();
}
function renderPlots(): void {
  node('plots').replaceChildren();
  if (!windowData) return;
  for (const trace of windowData.channels) {
    const figure = document.createElement('figure'),
      title = document.createElement('h3'),
      canvas = document.createElement('canvas'),
      caption = document.createElement('figcaption');
    title.textContent = `${trace.label || 'Unnamed channel'} · ${trace.unit || 'Unit not recorded'} · Auto scale`;
    canvas.setAttribute('role', 'img');
    canvas.tabIndex = 0;
    canvas.setAttribute(
      'aria-label',
      `${trace.label || 'Unnamed channel'}, ${trace.samplingFrequency} Hz. ${trace.sampleCount} samples from ${windowData.startSeconds} to ${windowData.endSeconds} seconds. Minimum ${trace.minimum.toPrecision(4)}, maximum ${trace.maximum.toPrecision(4)} ${trace.unit || '(unit not recorded)'}.`,
    );
    caption.textContent = `${trace.samplingFrequency} Hz · ${trace.sampleCount.toLocaleString()} samples checked · ${trace.points.length.toLocaleString()} displayed points${trace.sampleCount > trace.points.length ? ' (min/max envelope)' : ''}`;
    figure.append(title, canvas, caption);
    node('plots').append(figure);
    draw(canvas, trace);
  }
}
new ResizeObserver(() => {
  if (windowData)
    node('plots')
      .querySelectorAll('canvas')
      .forEach((canvas, index) => draw(canvas, windowData!.channels[index]));
}).observe(node('plots'));
function report(): void {
  const trace = windowData?.channels[0];
  api.postMessage({
    type: 'rendered',
    kind: 'recordingWaveform',
    traceCount: windowData?.channels.length ?? 0,
    startSeconds: windowData?.startSeconds,
    endSeconds: windowData?.endSeconds,
    firstTrace: trace
      ? {
          label: trace.label,
          unit: trace.unit,
          sampleCount: trace.sampleCount,
          minimum: trace.minimum,
          maximum: trace.maximum,
          samplingFrequency: trace.samplingFrequency,
        }
      : undefined,
    busy,
    error: node('error').hidden ? '' : node('error').textContent,
    status: node('status').textContent,
    selection: node('selection').textContent,
    channelLabels: [...node('channels').querySelectorAll('label')].map((n) => n.textContent),
    title: node('recording-title').textContent,
  });
}
window.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (event.origin !== window.location.origin) return;
  const message = event.data;
  if (!message || typeof message !== 'object' || !('type' in message)) return;
  if (message.type === 'inspect') {
    report();
    return;
  }
  if (message.type === 'snapshot' && 'snapshot' in message) {
    snapshot = message.snapshot as RecordingViewSnapshot;
    windowData = undefined;
    selected.clear();
    page = 0;
    snapshot.header.signals.forEach((channel, index) => {
      if (!channel.annotations && selected.size < 2) selected.add(index);
    });
    node('recording-title').textContent = snapshot.title;
    node('context').textContent = snapshot.context;
    node('filename').textContent = snapshot.filename;
    node('source').textContent = snapshot.source;
    node('metadata').hidden = !snapshot.canInspect;
    node('header-details').replaceChildren();
    for (const channel of snapshot.header.signals) {
      const p = document.createElement('p');
      p.textContent = channel.annotations
        ? 'EDF+ annotation storage; not decoded as a waveform.'
        : `${channel.label || 'Unnamed channel'} · ${channel.samplingFrequency} Hz · ${channel.unit || 'Unit not recorded'} · Physical range ${channel.physicalMinimum} to ${channel.physicalMaximum} · Digital range ${channel.digitalMinimum} to ${channel.digitalMaximum}`;
      node('header-details').append(p);
    }
    node('summary').textContent =
      `${snapshot.header.format} · ${snapshot.header.recordedSeconds ?? 'Unknown'} s recorded · ${snapshot.header.signals.filter((c) => !c.annotations).length} signal channels · Rates and units from EDF header`;
    node<HTMLInputElement>('start').value = '0';
    node<HTMLInputElement>('duration').value = '10';
    node('error').hidden = true;
    node('status').textContent = 'No samples loaded.';
    setBusy(false);
    renderChannels();
    renderPlots();
    if (first) {
      first = false;
      load();
    }
    report();
    return;
  }
  if (!snapshot || !('token' in message) || message.token !== snapshot.token) return;
  if (message.type === 'window' && 'window' in message) {
    windowData = message.window as RecordingWindow;
    node('status').textContent =
      `Showing ${windowData.startSeconds}–${windowData.endSeconds} s · ${windowData.channels.length} ${windowData.channels.length === 1 ? 'channel' : 'channels'}. Only this time window has been checked.`;
    node('error').hidden = true;
    setBusy(false);
    renderPlots();
    report();
  }
  if (
    message.type === 'windowError' &&
    'message' in message &&
    typeof message.message === 'string'
  ) {
    node('status').textContent = message.message;
    if (!('cancelled' in message) || !message.cancelled) {
      node('error').textContent = message.message;
      node('error').hidden = false;
    }
    setBusy(false);
    report();
  }
});
node('metadata').addEventListener('click', () => send('metadata'));
node('load').addEventListener('click', load);
node('cancel').addEventListener('click', () => {
  node('status').textContent = 'Cancelling the pending read…';
  node<HTMLButtonElement>('cancel').disabled = true;
  send('cancel');
});
node('reload').addEventListener('click', () => {
  setBusy(true);
  send('reload');
});
for (const [id, direction] of [
  ['previous', -1],
  ['next', 1],
] as const)
  node(id).addEventListener('click', () => {
    const start = node<HTMLInputElement>('start'),
      duration = Number(node<HTMLInputElement>('duration').value);
    start.value = String(Math.max(0, Number(start.value) + direction * duration));
    load();
  });
node('filter').addEventListener('input', () => {
  page = 0;
  renderChannels();
});
node('channels-previous').addEventListener('click', () => {
  page--;
  renderChannels();
});
node('channels-next').addEventListener('click', () => {
  page++;
  renderChannels();
});
api.postMessage({ type: 'ready' });
