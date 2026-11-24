import { eventsInWindow, eventNumber } from '../core/recordingEvents.js';
import type {
  RecordingMetadata,
  ChannelMetadata,
  RecordingEvent,
  RecordingTableKind,
} from '../core/recordingMetadataTypes';
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
let metadata: RecordingMetadata | undefined,
  tablesToken = '',
  tablesBusy = false,
  eventPage = 0;
let channelRows = new Map<string, ChannelMetadata>();
let events: readonly RecordingEvent[] = [];
function tableAction(type: string, kind: RecordingTableKind, index: number): void {
  api.postMessage({ type, token: snapshot?.token, tablesToken, kind, index });
}
function channelDetails(index: number): string {
  const channel = snapshot!.header.signals[index];
  if (!metadata || metadata.channels.status !== 'resolved') return '';
  const duplicate =
    snapshot!.header.signals.filter((c) => !c.annotations && c.label === channel.label).length > 1;
  const row = duplicate ? undefined : channelRows.get(channel.label);
  if (!row) return 'No unique matching channels.tsv row';
  const v = Object.fromEntries(
    Object.entries(row.values).map(([key, value]) => [
      key,
      value.length > 200 ? value.slice(0, 200) + '…' : value,
    ]),
  );
  const details = [
    v.type && `Type ${v.type}`,
    v.status && `Recorded status: ${v.status}`,
    v.status_description,
    v.description,
    v.reference && `Reference ${v.reference}`,
  ].filter(Boolean);
  const units = (s: string) => s.replace(/[µμ]/g, 'u');
  if (v.units && v.units !== 'n/a' && units(v.units) !== units(channel.unit))
    details.push(
      `Unit differs: TSV ${v.units}; EDF ${channel.unit || 'not recorded'} (EDF calibration retained)`,
    );
  const rate = eventNumber(v.sampling_frequency ?? '');
  if (v.sampling_frequency && v.sampling_frequency !== 'n/a' && rate !== channel.samplingFrequency)
    details.push(
      `Sampling rate differs: TSV ${v.sampling_frequency} Hz; EDF ${channel.samplingFrequency} Hz (EDF timing retained)`,
    );
  return `channels.tsv line ${row.line} · ${details.join(' · ')}`;
}
function renderSources(): void {
  node('table-sources').replaceChildren();
  if (!metadata) return;
  for (const kind of ['channels', 'events'] as const) {
    const source = metadata[kind],
      box = document.createElement('div'),
      title = document.createElement('h3'),
      note = document.createElement('p');
    title.textContent = kind === 'channels' ? 'Channel metadata' : 'BIDS events';
    note.textContent = `${source.status} · ${source.message}${source.table?.duplicateIds.length ? ' · Duplicate channel names are not matched automatically.' : ''}`;
    if (kind === 'channels' && source.status === 'resolved' && snapshot) {
      const signals = snapshot.header.signals.filter((c) => !c.annotations);
      const matched = signals.filter(
        (c) =>
          channelRows.has(c.label) &&
          signals.filter((other) => other.label === c.label).length === 1,
      ).length;
      note.textContent += ` · ${matched} of ${signals.length} EDF signal channels have a unique name match`;
    }
    box.append(title, note);
    if (source.candidates.length) {
      const label = document.createElement('label'),
        select = document.createElement('select'),
        placeholder = document.createElement('option');
      select.id = kind + '-source';
      label.textContent = `${kind === 'channels' ? 'Channels' : 'Events'} source `;
      placeholder.value = '';
      placeholder.textContent = 'Choose a physical source';
      select.append(placeholder);
      source.candidates.forEach((candidate, index) => {
        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = `${candidate.relativePath} — ${candidate.archive?.sourceUri ?? candidate.uri}`;
        select.append(option);
      });
      select.value = source.selected === undefined ? '' : String(source.selected);
      select.disabled = tablesBusy || source.status === 'unknown';
      select.addEventListener('change', () => {
        if (select.value !== '') tableAction('chooseTable', kind, Number(select.value));
      });
      label.append(select);
      box.append(label);
      if (source.selected !== undefined) {
        const open = document.createElement('button');
        open.textContent = `Open ${kind} table`;
        open.id = `open-${kind}-table`;
        open.disabled = tablesBusy;
        open.addEventListener('click', () => tableAction('openTable', kind, source.selected!));
        box.append(open);
      }
    }
    node('table-sources').append(box);
  }
}
function jump(event: RecordingEvent): void {
  if (busy || event.onset === undefined || !snapshot) return;
  node<HTMLInputElement>('start').value = String(
    Math.max(
      0,
      Math.min(
        event.onset,
        Math.max(0, (snapshot.header.recordedSeconds ?? 0) - inputNumber('duration')),
      ),
    ),
  );
  load();
}
function eventNavigation(event: RecordingEvent): HTMLButtonElement {
  const button = document.createElement('button');
  button.textContent = 'Go to event';
  button.disabled =
    busy || event.onset === undefined || event.onset >= (snapshot?.header.recordedSeconds ?? 0);
  button.setAttribute(
    'aria-label',
    `Go to event: ${event.label.slice(0, 160)}, ${event.onset === undefined ? 'onset unavailable' : event.onset + ' seconds'}, source line ${event.line}`,
  );
  button.addEventListener('click', () => jump(event));
  return button;
}
function renderEvents(): void {
  node('event-timeline').replaceChildren();
  node('events-table').replaceChildren();
  const table = metadata?.events.table;
  const visible = windowData
    ? eventsInWindow(events, windowData.startSeconds, windowData.endSeconds)
    : [];
  node('event-count').textContent = `${events.length} rows`;
  const invalid = events.filter(
    (e) => e.onset === undefined || (e.duration !== undefined && e.duration < 0),
  ).length;
  const missing = events.filter((e) => e.duration === undefined).length;
  node('events-coverage').textContent =
    `${events.length} event rows checked · ${visible.length} overlap the loaded window · ${invalid} rows have unavailable/invalid timing · ${missing} have unknown duration. Unknown duration is shown as an onset marker, not a zero-length interval. Sample values remain source values, not timing conversions.`;
  if (windowData && visible.length) {
    const description = document.createElement('p'),
      timeline = document.createElement('div'),
      axis = document.createElement('div');
    description.textContent = `BIDS events · ${visible.length} overlap ${windowData.startSeconds}–${windowData.endSeconds} s${visible.length > 12 ? ' · First 12 intervals shown; use the event list for all rows' : ''}. Recorded timing is read-only.`;
    timeline.className = 'event-timeline';
    axis.className = 'event-axis';
    axis.setAttribute('aria-label', 'Event time axis in seconds');
    for (let tick = 0; tick <= 4; tick++) {
      const label = document.createElement('span');
      label.style.left = `${tick * 25}%`;
      label.textContent =
        (
          windowData.startSeconds +
          ((windowData.endSeconds - windowData.startSeconds) * tick) / 4
        ).toFixed(2) + ' s';
      axis.append(label);
    }
    timeline.append(axis);
    visible.slice(0, 12).forEach((event) => {
      const row = document.createElement('div'),
        header = document.createElement('div'),
        label = document.createElement('span'),
        track = document.createElement('div'),
        interval = document.createElement('span');
      row.className = 'event-row';
      header.className = 'event-heading';
      track.className = 'event-track';
      interval.className = 'event-interval';
      const endTime = event.duration === undefined ? undefined : event.onset! + event.duration;
      const timing =
        event.duration === undefined
          ? `${event.onset} s (duration unknown)`
          : event.duration === 0
            ? `${event.onset} s (instantaneous)`
            : `${event.onset}–${endTime} s`;
      label.textContent = `${event.label.slice(0, 160)} · ${timing}`;
      if (
        event.onset! < windowData!.startSeconds ||
        (endTime !== undefined && endTime > windowData!.endSeconds)
      )
        label.textContent += ' · Partly outside this window';
      const go = eventNavigation(event);
      go.id = 'goto-event-' + event.line;
      header.append(label, go);
      const start = Math.max(windowData!.startSeconds, event.onset!),
        end = Math.min(windowData!.endSeconds, endTime ?? event.onset!),
        span = windowData!.endSeconds - windowData!.startSeconds;
      interval.style.left = `${(100 * (start - windowData!.startSeconds)) / span}%`;
      interval.style.width = `${Math.max(0, (100 * (end - start)) / span)}%`;
      interval.title = `${label.textContent} · Source line ${event.line}`;
      interval.setAttribute('role', 'img');
      interval.setAttribute('aria-label', interval.title);
      track.append(interval);
      row.append(header, track);
      timeline.append(row);
    });
    node('event-timeline').append(description, timeline);
  }
  const filter = node<HTMLInputElement>('event-filter').value.toLowerCase();
  const rows = events.filter((event) =>
    event.values.some((value) => value.toLowerCase().includes(filter)),
  );
  eventPage = Math.max(0, Math.min(eventPage, Math.ceil(rows.length / 50) - 1));
  node('events-page').textContent =
    `${rows.length ? eventPage * 50 + 1 : 0}–${Math.min(rows.length, (eventPage + 1) * 50)} of ${rows.length} matching event rows`;
  node<HTMLButtonElement>('events-previous').disabled = eventPage === 0;
  node<HTMLButtonElement>('events-next').disabled = (eventPage + 1) * 50 >= rows.length;
  if (!table) {
    node('events-coverage').textContent =
      'Events are not resolved. An empty timeline does not establish that no events were recorded.';
    return;
  }
  const grid = document.createElement('table'),
    head = document.createElement('thead'),
    heading = document.createElement('tr'),
    body = document.createElement('tbody');
  const columns = table.columns.slice(0, 8);
  for (const name of ['Source line', ...columns, 'Navigate']) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = name === 'onset' || name === 'duration' ? name + ' (s)' : name;
    heading.append(th);
  }
  head.append(heading);
  for (const event of rows.slice(eventPage * 50, eventPage * 50 + 50)) {
    const tr = document.createElement('tr');
    for (const value of [String(event.line), ...event.values.slice(0, 8)]) {
      const td = document.createElement('td');
      td.textContent = value.length > 300 ? value.slice(0, 300) + '…' : value;
      tr.append(td);
    }
    const td = document.createElement('td'),
      button = eventNavigation(event);
    button.id = 'event-' + event.line;
    td.append(button);
    tr.append(td);
    body.append(tr);
  }
  grid.append(head, body);
  node('events-table').append(grid);
  if (table.columns.length > 8) {
    const note = document.createElement('p');
    note.textContent = `Showing 8 of ${table.columns.length} columns. Open the source table for all columns.`;
    node('events-table').append(note);
  }
}

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
  renderEvents();
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
    const detail = channelDetails(index);
    if (detail) {
      const info = document.createElement('small');
      info.textContent = detail;
      text.append(document.createElement('br'), info);
    }
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
    left = parseFloat(style.getPropertyValue('--recording-axis-left')),
    right = w - parseFloat(style.getPropertyValue('--recording-axis-right')),
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
    const detail = document.createElement('p');
    detail.className = 'channel-metadata';
    detail.textContent = channelDetails(trace.index);
    figure.append(title, detail, canvas, caption);
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
    tablesBusy,
    tablesStatus: node('tables-status').textContent,
    channelDetails: snapshot?.header.signals.map((_, index) => channelDetails(index)),
    eventRows: events.length,
    eventText: node('events-table').textContent,
    eventScriptCount: node('events-table').querySelectorAll('script').length,
    eventMarkers: node('event-timeline').querySelectorAll('.event-interval').length,
    eventTimelineText: node('event-timeline').textContent,
    eventAxisStart: node('event-timeline').querySelector('.event-axis')?.getBoundingClientRect()
      .left,
    eventAxisEnd: node('event-timeline').querySelector('.event-axis')?.getBoundingClientRect()
      .right,
    waveformAxisEnd: node('plots').querySelector('canvas')
      ? node('plots').querySelector('canvas')!.getBoundingClientRect().right -
        parseFloat(getComputedStyle(document.body).getPropertyValue('--recording-axis-right'))
      : undefined,
    waveformAxisStart: node('plots').querySelector('canvas')
      ? node('plots').querySelector('canvas')!.getBoundingClientRect().left +
        parseFloat(getComputedStyle(document.body).getPropertyValue('--recording-axis-left'))
      : undefined,
    eventPage: node('events-page').textContent,
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
    metadata = undefined;
    channelRows.clear();
    events = [];
    tablesToken = '';
    renderSources();
    renderEvents();
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
  if (message.type === 'tablesLoading') {
    tablesBusy = true;
    node('tables-status').textContent = 'Checking applicable channels and events tables…';
    node<HTMLButtonElement>('reload-tables').disabled = true;
    node<HTMLButtonElement>('cancel-tables').disabled = false;
    renderSources();
    report();
    return;
  }
  if (message.type === 'tables' && 'metadata' in message && 'tablesToken' in message) {
    metadata = message.metadata as RecordingMetadata;
    tablesToken = String(message.tablesToken);
    tablesBusy = false;
    eventPage = 0;
    channelRows = new Map(metadata.channels.channelRows?.map((row) => [row.values.name, row]));
    events = metadata.events.events ?? [];
    node('tables-status').textContent =
      'BIDS table snapshots checked independently of the EDF header. Recorded bad status does not hide a channel; EDF calibration and timing remain in use.';
    node<HTMLButtonElement>('reload-tables').disabled = false;
    node<HTMLButtonElement>('cancel-tables').disabled = true;
    renderSources();
    renderChannels();
    renderPlots();
    renderEvents();
    report();
    return;
  }
  if (message.type === 'tablesError' && 'message' in message) {
    tablesBusy = false;
    node('tables-status').textContent = String(message.message);
    node<HTMLButtonElement>('reload-tables').disabled = false;
    node<HTMLButtonElement>('cancel-tables').disabled = true;
    renderSources();
    report();
    return;
  }
  if (message.type === 'window' && 'window' in message) {
    windowData = message.window as RecordingWindow;
    node('status').textContent =
      `Showing ${windowData.startSeconds}–${windowData.endSeconds} s · ${windowData.channels.length} ${windowData.channels.length === 1 ? 'channel' : 'channels'}. Only this time window has been checked.`;
    node('error').hidden = true;
    setBusy(false);
    renderPlots();
    renderEvents();
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
node('reload-tables').addEventListener('click', () => send('reloadTables'));
node('cancel-tables').addEventListener('click', () => send('cancelTables'));
node('event-filter').addEventListener('input', () => {
  eventPage = 0;
  renderEvents();
});
node('events-previous').addEventListener('click', () => {
  eventPage--;
  renderEvents();
});
node('events-next').addEventListener('click', () => {
  eventPage++;
  renderEvents();
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
