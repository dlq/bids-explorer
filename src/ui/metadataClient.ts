import type { RecordedMetadataField, DatasetDescription } from '../core/metadataTypes';
import type { TextSnapshot } from '../core/textSnapshot';

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };
const api = acquireVsCodeApi();
function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing metadata control: ${id}`);
  return node as T;
}
let fields: readonly RecordedMetadataField[] = [],
  filtered: readonly RecordedMetadataField[] = [];
let page = 0,
  sourceUri = '',
  duplicateCount = 0;
function report(): void {
  if (!sourceUri) return;
  api.postMessage({
    type: 'rendered',
    title: element('name').textContent,
    fileName: element('file-name').textContent,
    sourceUri,
    fieldCount: fields.length,
    visibleCount: Math.min(20, filtered.length - page * 20),
    page,
    duplicateCount,
    firstKey: filtered[page * 20]?.key.slice(0, 200),
  });
}
function render(): void {
  const target = element('fields');
  target.replaceChildren();
  filtered = fields.filter((field) =>
    field.key.toLowerCase().includes(element<HTMLInputElement>('filter').value.toLowerCase()),
  );
  page = Math.max(0, Math.min(page, Math.ceil(filtered.length / 20) - 1));
  for (const field of filtered.slice(page * 20, page * 20 + 20)) {
    const card = document.createElement('article'),
      heading = document.createElement('h3'),
      type = document.createElement('span'),
      pre = document.createElement('pre'),
      provenance = document.createElement('p');
    card.className = 'metadata-field';
    heading.textContent = field.key.length > 200 ? field.key.slice(0, 200) + '…' : field.key;
    type.className = 'field-type';
    type.textContent =
      field.type + (field.duplicated ? ` · duplicate occurrence ${field.occurrence}` : '');
    pre.textContent = field.valueText.slice(0, 16000);
    provenance.className = 'note';
    provenance.textContent = `Recorded · JSON pointer ${field.pointer.slice(0, 512)}${field.pointer.length > 512 ? '… (shortened)' : ''}${field.duplicated ? ' (ambiguous duplicate name)' : ''}`;
    card.append(heading, type, pre, provenance);
    if (field.key.length > 200) {
      const more = document.createElement('p');
      more.className = 'note';
      more.textContent = 'Long field name shortened here. Open the original for the complete key.';
      card.append(more);
    }
    if (field.valueText.length > 16000) {
      const more = document.createElement('p');
      more.className = 'note';
      more.textContent =
        'Value shortened after 16,000 characters. Open the original for the full JSON value.';
      card.append(more);
    }
    target.append(card);
  }
  if (!filtered.length) {
    const empty = document.createElement('p');
    empty.textContent = fields.length
      ? 'No matching fields.'
      : 'This JSON object contains no fields.';
    target.append(empty);
  }
  element('page').textContent =
    `${filtered.length ? page * 20 + 1 : 0}–${Math.min(filtered.length, (page + 1) * 20)} of ${filtered.length} fields`;
  element<HTMLButtonElement>('previous').disabled = page === 0;
  element<HTMLButtonElement>('next').disabled = (page + 1) * 20 >= filtered.length;
  report();
}
function isField(value: unknown): value is RecordedMetadataField {
  return (
    !!value &&
    typeof value === 'object' &&
    'key' in value &&
    typeof value.key === 'string' &&
    'valueText' in value &&
    typeof value.valueText === 'string' &&
    'type' in value &&
    typeof value.type === 'string' &&
    'pointer' in value &&
    typeof value.pointer === 'string' &&
    'sourceUri' in value &&
    typeof value.sourceUri === 'string' &&
    'occurrence' in value &&
    typeof value.occurrence === 'number' &&
    'duplicated' in value &&
    typeof value.duplicated === 'boolean'
  );
}
window.addEventListener('message', (event: MessageEvent<unknown>) => {
  const message = event.data;
  if (!message || typeof message !== 'object' || !('type' in message)) return;
  if (message.type === 'inspect') {
    report();
    return;
  }
  if (message.type === 'error' && 'message' in message && typeof message.message === 'string') {
    element('error').textContent = message.message;
    element('error').hidden = false;
    element<HTMLButtonElement>('reload').disabled = false;
  }
  if (
    message.type !== 'snapshot' ||
    !('source' in message) ||
    !message.source ||
    typeof message.source !== 'object' ||
    !('sourceUri' in message.source) ||
    typeof message.source.sourceUri !== 'string' ||
    !('capturedAt' in message.source) ||
    typeof message.source.capturedAt !== 'string' ||
    !('fields' in message) ||
    !Array.isArray(message.fields) ||
    message.fields.length > 1000 ||
    !message.fields.every(isField) ||
    !('summary' in message) ||
    !message.summary ||
    typeof message.summary !== 'object'
  )
    return;
  const source = message.source as Omit<TextSnapshot, 'text'>,
    summary = message.summary as DatasetDescription['summary'];
  sourceUri = source.sourceUri;
  fields = message.fields;
  duplicateCount = new Set(fields.filter((field) => field.duplicated).map((field) => field.key))
    .size;
  element('name').textContent =
    typeof summary.name === 'string'
      ? summary.name.slice(0, 200)
      : 'documentKind' in message &&
          message.documentKind === 'json-sidecar' &&
          'fileName' in message &&
          typeof message.fileName === 'string'
        ? message.fileName.slice(0, 200)
        : 'Dataset description';
  element('file-name').textContent =
    'fileName' in message && typeof message.fileName === 'string'
      ? message.fileName
      : 'dataset_description.json';
  const labels = [`${fields.length} recorded fields`];
  if (typeof summary.bidsVersion === 'string')
    labels.push('BIDS specification: ' + summary.bidsVersion.slice(0, 200));
  if (typeof summary.datasetType === 'string')
    labels.push('Recorded dataset type: ' + summary.datasetType.slice(0, 200));
  element('summary').textContent = labels.join(' · ');
  element('source').textContent = sourceUri;
  element('revision').textContent =
    `Read-only snapshot · ${source.capturedAt}. Reload explicitly after source changes.`;
  element('duplicates').hidden = duplicateCount === 0;
  element('duplicates').textContent =
    `Duplicate field names: ${duplicateCount}. All occurrences are shown; no winning value is inferred.`;
  element('error').hidden = true;
  element<HTMLButtonElement>('reload').disabled = false;
  render();
});
element('filter').addEventListener('input', () => {
  page = 0;
  render();
});
element('previous').addEventListener('click', () => {
  page--;
  render();
});
element('next').addEventListener('click', () => {
  page++;
  render();
});
element('raw').addEventListener('click', () => api.postMessage({ type: 'openRaw' }));
element('reload').addEventListener('click', () => {
  element<HTMLButtonElement>('reload').disabled = true;
  api.postMessage({ type: 'reload' });
});
api.postMessage({ type: 'ready' });
