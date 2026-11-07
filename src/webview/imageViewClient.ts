import type { ImageState, ImageControl } from './imageViewTypes';
declare function acquireVsCodeApi(): { postMessage(message: unknown): void };
const api = acquireVsCodeApi();
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let target = '';
function send(type: string, extra: object = {}) {
  api.postMessage({ type, target, ...extra });
}
function control(action: ImageControl['action'], value?: unknown) {
  send('control', { control: { action, value } });
}
for (const id of ['layout', 'colormap'] as const)
  element<HTMLSelectElement>(id).onchange = () => control(id, element<HTMLSelectElement>(id).value);
element<HTMLInputElement>('crosshair').onchange = () =>
  control('crosshair', element<HTMLInputElement>('crosshair').checked);
element<HTMLInputElement>('frame').oninput = () =>
  control('frame', element<HTMLInputElement>('frame').valueAsNumber);
element('window').onclick = () => {
  const min = element<HTMLInputElement>('minimum').valueAsNumber,
    max = element<HTMLInputElement>('maximum').valueAsNumber;
  element('control-error').textContent =
    Number.isFinite(min) && Number.isFinite(max) && min < max
      ? ''
      : 'Enter a finite minimum smaller than the maximum.';
  if (!element('control-error').textContent) control('window', [min, max]);
};
for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>('button[data-axis]')))
  button.onclick = () =>
    control('move', { axis: button.dataset.axis, step: Number(button.dataset.step) });
for (const id of ['reset', 'cancel'] as const) element(id).onclick = () => control(id);
element('inspect').onclick = () => send('inspect');
function fields(id: string, rows: readonly { label: string; value: string }[]) {
  const list = element(id);
  const signature = JSON.stringify(rows);
  if (list.dataset.signature === signature) return;
  list.dataset.signature = signature;
  list.replaceChildren();
  for (const row of rows) {
    const key = document.createElement('dt'),
      value = document.createElement('dd');
    key.textContent = row.label;
    value.textContent = row.value;
    list.append(key, value);
  }
}
window.addEventListener(
  'message',
  (
    event: MessageEvent<{
      type: string;
      image?: {
        target: string;
        name: string;
        details: string;
        context: string;
        source: string;
        state?: ImageState;
        metadata: { label: string; value: string; source?: string }[];
        metadataStatus: string;
        related: { index: number; name: string }[];
      } | null;
    }>,
  ) => {
    if (event.data.type === 'inspect') {
      api.postMessage({
        type: 'rendered',
        text: document.body.innerText,
        frameDisabled: element<HTMLInputElement>('frame').disabled,
        controlsEnabled: !element<HTMLFieldSetElement>('controls').disabled,
      });
      return;
    }
    if (event.data.type !== 'image') return;
    const image = event.data.image;
    element('empty').hidden = !!image;
    document.querySelector('main')!.hidden = !image;
    if (!image) {
      target = '';
      element<HTMLFieldSetElement>('controls').disabled = true;
      return;
    }
    const changed = target !== image.target;
    target = image.target;
    if (changed) element('control-error').textContent = '';
    element('acquisition').textContent = [image.name, image.details].filter(Boolean).join(' · ');
    element('context').textContent = image.context;
    element('source').textContent = image.source;
    if (element('metadata-status').textContent !== image.metadataStatus)
      element('metadata-status').textContent = image.metadataStatus;
    fields('metadata', image.metadata);
    fields(
      'provenance',
      image.metadata
        .filter((row) => row.source)
        .map((row) => ({ label: row.label, value: row.source! })),
    );
    const relatedSignature = JSON.stringify([target, image.related]);
    if (element('related').dataset.signature !== relatedSignature) {
      element('related').dataset.signature = relatedSignature;
      element('related').replaceChildren();
      for (const row of image.related) {
        const button = document.createElement('button');
        button.textContent = row.name;
        button.onclick = () => send('source', { index: row.index });
        element('related').append(button, document.createElement('br'));
      }
    }
    const state = image.state;
    const status = state?.status ?? 'Waiting for image data…';
    if (element('status').textContent !== status) element('status').textContent = status;
    element<HTMLFieldSetElement>('controls').disabled = !state?.navigationEnabled;
    element<HTMLButtonElement>('cancel').disabled =
      !state ||
      state.status.startsWith('No image') ||
      state.status.startsWith('Unable') ||
      state.status === 'Loading cancelled.' ||
      state.loadedFrames > 0;
    fields('information', state?.information ?? []);
    element('position').textContent = state?.position ?? 'Position available after loading.';
    if (!state) return;
    element<HTMLSelectElement>('layout').value = state.display.layout;
    element<HTMLSelectElement>('colormap').value = state.display.colormap;
    for (const [id, value] of [
      ['minimum', state.display.minimum],
      ['maximum', state.display.maximum],
    ] as const)
      if (document.activeElement !== element(id))
        element<HTMLInputElement>(id).value = String(value);
    element<HTMLInputElement>('crosshair').checked = state.display.crosshair;
    const frame = element<HTMLInputElement>('frame');
    frame.disabled = state.loadedFrames < 2;
    frame.max = String(Math.max(1, state.loadedFrames));
    frame.value = String(state.display.frame);
    element('frame-value').textContent =
      `${state.display.frame} / ${state.loadedFrames || state.previewFrames || 1}`;
  },
);
api.postMessage({ type: 'ready' });
