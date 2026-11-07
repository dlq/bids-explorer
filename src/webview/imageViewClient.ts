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
  const limit = (id: string) => {
    const input = element<HTMLInputElement>(id);
    return input.value === input.dataset.display
      ? Number(input.dataset.exact)
      : input.valueAsNumber;
  };
  const min = limit('minimum'),
    max = limit('maximum');
  element('control-error').textContent =
    Number.isFinite(min) && Number.isFinite(max) && min < max
      ? ''
      : 'Enter a finite minimum smaller than the maximum.';
  if (!element('control-error').textContent) control('window', [min, max]);
};
for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>('button[data-axis]')))
  button.onclick = () =>
    control('move', { axis: button.dataset.axis, step: Number(button.dataset.step) });
element('reset').onclick = () => control('reset');
element('inspect').onclick = () => send('inspect');
function fields(id: string, rows: readonly { label: string; value: string }[]) {
  const list = element(id);
  const signature = JSON.stringify(rows);
  if (list.dataset.signature === signature) return;
  list.dataset.signature = signature;
  list.replaceChildren();
  for (const row of rows) {
    const cell = document.createElement('div');
    const key = document.createElement('dt'),
      value = document.createElement('dd');
    key.textContent = row.label;
    value.textContent = row.value;
    cell.append(key, value);
    list.append(cell);
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
        metadata: {
          label: string;
          value: string;
          sourceUri: string;
          pointer: string;
          rawValue: string;
        }[];
        metadataStatus: string;
        related: { index: number; name: string; uri: string }[];
      } | null;
    }>,
  ) => {
    if (event.data.type === 'inspect') {
      api.postMessage({
        type: 'rendered',
        text: document.body.innerText,
        frameDisabled: element<HTMLInputElement>('frame').disabled,
        controlsEnabled: !element<HTMLFieldSetElement>('controls').disabled,
        volumeVisible: !element('volume-control').hidden,
        positionExpanded: element<HTMLDetailsElement>('position-details').open,
        sourceGroups: element('provenance').children.length,
        metadataBeforeControls: !!(
          element('metadata').compareDocumentPosition(element('controls')) &
          Node.DOCUMENT_POSITION_FOLLOWING
        ),
        minimum: element<HTMLInputElement>('minimum').value,
        maximum: element<HTMLInputElement>('maximum').value,
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
    const provenance = element('provenance');
    const provenanceSignature = JSON.stringify([target, image.metadata, image.related]);
    if (provenance.dataset.signature !== provenanceSignature) {
      provenance.dataset.signature = provenanceSignature;
      provenance.replaceChildren();
      const sources = new Map<string, typeof image.metadata>();
      for (const field of image.metadata) {
        const fields = sources.get(field.sourceUri) ?? [];
        fields.push(field);
        sources.set(field.sourceUri, fields);
      }
      for (const [uri, rows] of sources) {
        const source = image.related.find((row) => row.uri === uri);
        const group = document.createElement('section'),
          title = document.createElement('h3');
        title.textContent = source?.name ?? uri.split('/').pop() ?? 'JSON source';
        group.append(title);
        if (source) {
          const open = document.createElement('button');
          open.textContent = 'Open original JSON';
          open.onclick = () => send('source', { index: source.index });
          group.append(open);
        }
        const details = document.createElement('details'),
          summary = document.createElement('summary'),
          location = document.createElement('p');
        summary.textContent = 'Exact location';
        location.textContent = uri;
        details.append(summary, location);
        group.append(details);
        const values = document.createElement('dl');
        for (const row of rows) {
          const label = document.createElement('dt'),
            value = document.createElement('dd');
          label.textContent = row.pointer;
          value.textContent = row.rawValue;
          values.append(label, value);
        }
        group.append(values);
        provenance.append(group);
      }
    }
    const relatedSignature = JSON.stringify([target, image.related]);
    if (element('related').dataset.signature !== relatedSignature) {
      element('related').dataset.signature = relatedSignature;
      element('related').replaceChildren();
      for (const row of image.related) {
        const button = document.createElement('button');
        button.textContent = row.name;
        button.title = row.uri;
        button.onclick = () => send('source', { index: row.index });
        element('related').append(button, document.createElement('br'));
      }
    }
    const state = image.state;
    const status = state?.status ?? 'Waiting for image data…';
    if (element('status').textContent !== status) element('status').textContent = status;
    element<HTMLFieldSetElement>('controls').disabled = !state?.navigationEnabled;
    element('status').hidden = !!state?.loadedFrames;
    fields(
      'scan-information',
      (state?.information ?? []).filter((row) =>
        ['Dimensions', 'Voxel spacing'].includes(row.label),
      ),
    );
    fields(
      'information',
      (state?.information ?? []).filter(
        (row) => !['Dimensions', 'Voxel spacing'].includes(row.label),
      ),
    );
    element('volume-control').hidden =
      Math.max(state?.loadedFrames ?? 0, state?.previewFrames ?? 0) < 2;
    element('position').textContent = state?.position ?? 'Position available after loading.';
    if (!state) return;
    element<HTMLSelectElement>('layout').value = state.display.layout;
    element<HTMLSelectElement>('colormap').value = state.display.colormap;
    for (const [id, value] of [
      ['minimum', state.display.minimum],
      ['maximum', state.display.maximum],
    ] as const)
      if (document.activeElement !== element(id)) {
        const input = element<HTMLInputElement>(id);
        input.value = String(Number(value.toPrecision(6)));
        input.dataset.display = input.value;
        input.dataset.exact = String(value);
        input.title = `Exact display limit: ${value}`;
      }
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
