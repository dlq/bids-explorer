export {};

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };
const api = acquireVsCodeApi();
const revision = Number(document.body.dataset.revision);
const scanning = document.body.dataset.scanning === 'true';

document.getElementById('filters')?.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!(event.target instanceof HTMLFormElement)) return;
  const form = new FormData(event.target);
  api.postMessage({
    filter: {
      participant: form.get('participant'),
      raw: form.getAll('raw'),
      requireOutput: form.has('requireOutput'),
      pipeline: form.get('pipeline') || '',
      session: form.get('session') || '',
      modality: form.get('modality') || '',
    },
    revision,
  });
});
document.getElementById('browse-focus')?.addEventListener('change', (event) => {
  if (event.target instanceof HTMLSelectElement)
    api.postMessage({ focus: event.target.value, revision });
});
document.addEventListener('click', (event) => {
  const button = event.target instanceof Element ? event.target.closest('button') : null;
  if (button?.dataset.view) api.postMessage({ view: button.dataset.view, revision });
  if (button?.id === 'scan') api.postMessage({ scan: true, revision });
  if (button?.dataset.page !== undefined)
    api.postMessage({ page: Number(button.dataset.page), revision });
  if (button?.dataset.participant !== undefined)
    api.postMessage({ index: Number(button.dataset.participant), revision });
});
window.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (event.origin !== window.location.origin) return;
  const data = event.data;
  if (
    scanning &&
    data &&
    typeof data === 'object' &&
    'revision' in data &&
    data.revision === revision &&
    'progress' in data &&
    typeof data.progress === 'string'
  ) {
    const progress = document.getElementById('scan-progress');
    if (progress) progress.textContent = data.progress;
  }
});
api.postMessage({ type: 'ready', revision });
