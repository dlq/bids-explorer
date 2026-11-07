import type { PreviewDocument } from '../core/documentTypes';
declare function acquireVsCodeApi(): { postMessage(message: unknown): void };
const api = acquireVsCodeApi();
const node = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
let data: PreviewDocument | undefined,
  page = 0;
function render(): void {
  if (!data) return;
  node('title').textContent = data.title;
  node('subtitle').textContent = data.subtitle;
  node('notice').textContent = data.notice;
  const filter = node<HTMLInputElement>('filter').value.toLowerCase();
  const rows = data.records.filter((record) =>
    (record.title + '\n' + record.text).toLowerCase().includes(filter),
  );
  page = Math.max(0, Math.min(page, Math.ceil(rows.length / 20) - 1));
  node('records').replaceChildren();
  for (const record of rows.slice(page * 20, page * 20 + 20)) {
    const card = document.createElement('article'),
      title = document.createElement('h2'),
      pre = document.createElement('pre'),
      detail = document.createElement('p');
    card.className = 'metadata-field';
    title.textContent = record.title.slice(0, 512);
    pre.textContent = record.text;
    detail.textContent = record.detail ?? '';
    detail.className = 'source-path';
    card.append(title, pre);
    if (record.detail) {
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = 'Source details';
      details.append(summary, detail);
      card.append(details);
    }
    node('records').append(card);
  }
  if (!rows.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No matching records.';
    node('records').append(empty);
  }
  node('previous').hidden = rows.length <= 20;
  node('next').hidden = rows.length <= 20;
  node('page').textContent =
    `${rows.length ? page * 20 + 1 : 0}–${Math.min(rows.length, (page + 1) * 20)} of ${rows.length}`;
  node<HTMLButtonElement>('previous').disabled = page === 0;
  node<HTMLButtonElement>('next').disabled = (page + 1) * 20 >= rows.length;
  node('sources').replaceChildren();
  data.sources.forEach((source, index) => {
    const button = document.createElement('button');
    button.textContent = source.label;
    button.title = source.uri;
    button.addEventListener('click', () => api.postMessage({ type: 'source', index }));
    node('sources').append(button);
  });
  node('actions').replaceChildren();
  for (const action of data.actions) {
    const button = document.createElement('button');
    button.id = 'action-' + action.id;
    button.textContent = action.label;
    button.addEventListener('click', () => api.postMessage({ type: 'action', id: action.id }));
    node('actions').append(button);
  }
  report();
}
function report(): void {
  if (data)
    api.postMessage({
      type: 'rendered',
      title: data.title,
      recordCount: data.records.length,
      page,
      firstTitle: node('records').querySelector('h2')?.textContent,
      firstText: node('records').querySelector('pre')?.textContent,
      sourceCount: data.sources.length,
      sourceDetailsCount: node('records').querySelectorAll('details').length,
      expandedSourceDetails: node('records').querySelectorAll('details[open]').length,
      actions: data.actions.map((action) => action.id),
      error: node('error').hidden ? '' : node('error').textContent,
    });
}
window.addEventListener('message', (event: MessageEvent<unknown>) => {
  const message = event.data;
  if (!message || typeof message !== 'object' || !('type' in message)) return;
  if (message.type === 'inspect') {
    report();
    return;
  }
  if (message.type === 'error' && 'message' in message && typeof message.message === 'string') {
    node('error').textContent = message.message;
    node('error').hidden = false;
    node<HTMLButtonElement>('reload').disabled = false;
    return;
  }
  if (message.type !== 'snapshot' || !('document' in message)) return;
  data = message.document as PreviewDocument;
  node('error').hidden = true;
  node<HTMLButtonElement>('reload').disabled = false;
  render();
});
node('filter').addEventListener('input', () => {
  page = 0;
  render();
});
node('previous').addEventListener('click', () => {
  page--;
  render();
});
node('next').addEventListener('click', () => {
  page++;
  render();
});
node('reload').addEventListener('click', () => {
  node<HTMLButtonElement>('reload').disabled = true;
  api.postMessage({ type: 'reload' });
});
api.postMessage({ type: 'ready' });
