import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import {
  availabilityBrowseMatches,
  availabilityMatches,
  availabilityModalities,
  availabilityPage,
  availabilityPageSize,
  type AvailabilityFilter,
  type AvailabilityIndex,
} from '../core/availability';
import type { DirectoryEntry } from '../core/directory';

export function openAvailabilityView(
  extensionUri: vscode.Uri,
  load: (
    controller: AbortController,
    progress: (completed: number, total: number) => void,
    retryIncomplete: boolean,
  ) => Promise<AvailabilityIndex>,
  reveal: (participant: DirectoryEntry) => Promise<void>,
): vscode.WebviewPanel {
  const mediaUri = vscode.Uri.joinPath(extensionUri, 'media');
  const panel = vscode.window.createWebviewPanel(
    'bidsExplorer.availability',
    'BIDS Availability',
    vscode.ViewColumn.Active,
    { enableScripts: true, localResourceRoots: [mediaUri] },
  );
  const styles = panel.webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'gradients.css'));
  const nonce = randomBytes(16).toString('hex');
  const escape = (text: string) =>
    text
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  let snapshot: AvailabilityIndex | undefined;
  let filter: AvailabilityFilter = {
    participant: '',
    raw: [],
    requireOutput: false,
    pipeline: '',
    session: '',
    modality: '',
  };
  let matches: number[] = [];
  let modalities: readonly string[] = [];
  let view: 'sessions' | 'modality' | 'pipeline' = 'sessions';
  let focus = '';
  const browseChoices = () =>
    view === 'modality' ? modalities : (snapshot?.sources.slice(1) ?? []);
  const updateMatches = (index: AvailabilityIndex) => {
    matches = availabilityMatches(index, filter);
    if (view !== 'sessions')
      matches = availabilityBrowseMatches(index, matches, { mode: view, value: focus });
    page = 0;
  };
  let page = 0;
  let active: AbortController | undefined;
  let status = '';
  let revision = 0;
  const render = () => {
    revision++;
    const report = snapshot;
    const controls = `<p><button id="scan">${active ? 'Cancel scan' : 'Refresh snapshot'}</button> <span id="scan-progress" role="status">${status}</span></p>`;
    if (!report) {
      panel.webview.html = renderDocument(controls);
      return;
    }
    const hasPipelines = report.sources.length > 1 && report.columns.length > 0;
    const derivativeSource =
      view === 'pipeline' ? focus : view === 'sessions' ? filter.pipeline : '';
    const headers = [
      ...(view === 'pipeline' ? [] : report.columns.map((name) => `Raw · ${name}`)),
      ...(hasPipelines
        ? report.columns.map((name) => `${view === 'pipeline' ? focus : 'Derivatives'} · ${name}`)
        : []),
    ];
    const rows = availabilityPage(report, matches, page)
      .map(({ participant, position, sources }) => {
        const [raw, ...outputs] = sources;
        const pipelines = outputs.filter(
          ({ sourceIndex }) =>
            !derivativeSource || report.sources[sourceIndex] === derivativeSource,
        );
        const findings = ({ modalities, complete }: (typeof raw.cells)[number]) => {
          if (view === 'modality')
            return modalities.includes(focus)
              ? `<strong>${escape(focus)}</strong>`
              : complete
                ? 'Missing'
                : 'Not checked';
          if (!modalities.length) return complete ? 'Missing' : 'Not checked';
          const remainder = complete ? '' : ' · More not checked';
          return `<strong>${escape(modalities.join(', '))}</strong>${remainder}`;
        };
        const rawCells =
          view === 'pipeline' ? '' : raw.cells.map((cell) => `<td>${findings(cell)}</td>`).join('');
        const derivativeCells = hasPipelines
          ? report.columns
              .map(
                (_, column) =>
                  `<td>${pipelines
                    .map(
                      ({ sourceIndex, cells }) =>
                        `<div data-source="${sourceIndex}">${view === 'pipeline' ? '' : escape(report.sources[sourceIndex]) + ' · '}${findings(cells[column])}</div>`,
                    )
                    .join('')}</td>`,
              )
              .join('')
          : '';
        return `<tr><th scope="row"><button data-participant="${position}">${escape(participant.name)}</button></th>${rawCells}${derivativeCells}</tr>`;
      })
      .join('');
    const option = (name: string, selected: string) =>
      `<option value="${escape(name)}"${name === selected ? ' selected' : ''}>${escape(name)}</option>`;
    const choices = (names: readonly string[], selected: string) =>
      [...new Set(selected ? [...names, selected] : names)]
        .map((name) => option(name, selected))
        .join('');
    const rawFilters = [...new Set([...report.columns, ...filter.raw])]
      .map(
        (name) =>
          `<label><input type="checkbox" name="raw" value="${escape(name)}"${filter.raw.includes(name) ? ' checked' : ''}> ${escape(name)}</label> `,
      )
      .join('');
    const totalPages = Math.max(1, Math.ceil(matches.length / availabilityPageSize));
    const pagination =
      totalPages > 1
        ? `<p><button data-page="${page - 1}" ${page === 0 ? 'disabled' : ''}>Previous</button>
         Page ${page + 1} of ${totalPages}
         <button data-page="${page + 1}" ${page + 1 === totalPages ? 'disabled' : ''}>Next</button></p>`
        : '';
    const viewButtons = (
      [
        ['sessions', 'By session', true],
        ['modality', 'By modality', modalities.length > 0],
        ['pipeline', 'By pipeline', hasPipelines],
      ] as const
    )
      .map(
        ([mode, label, enabled]) =>
          `<button data-view="${mode}" aria-pressed="${view === mode}"${enabled ? '' : ' disabled'}>${label}</button>`,
      )
      .join(' ');
    panel.webview.html = renderDocument(`${controls}
<p>Find participants with data in the sessions, modalities or processing pipelines you need.</p>
${report.partial ? '<p><strong>Partial coverage.</strong> Some sources or branches could not be fully checked. More participants may match.</p>' : ''}
${report.issues?.length ? `<ul>${report.issues.map((issue) => `<li>${escape(issue)}</li>`).join('')}</ul>` : ''}
<form id="filters">
<p><label>Participant <input name="participant" value="${escape(filter.participant)}"></label></p>
<fieldset><legend>Require raw data in every selected session</legend>${rawFilters || 'No sessions indexed.'}</fieldset>
${
  hasPipelines || filter.requireOutput
    ? `<fieldset><legend>Require derivative output</legend>
<label>Pipeline <select name="pipeline"><option value="">Any pipeline</option>${choices(report.sources.slice(1), filter.pipeline)}</select></label>
<label>Session <select name="session"><option value="">Any session</option>${choices(report.columns, filter.session)}</select></label>
<label>Modality <select name="modality"><option value="">Any modality</option>${choices(report.outputModalities, filter.modality)}</select></label>
<label><input type="checkbox" name="requireOutput"${filter.requireOutput ? ' checked' : ''}> Require output</label>
</fieldset>`
    : ''
}
<p><button type="submit">Apply filters</button></p>
</form>
<div role="group" aria-label="Availability view">${viewButtons}</div>
${view === 'sessions' ? '' : `<p><label>${view === 'modality' ? 'Browse modality' : 'Browse pipeline'} <select id="browse-focus">${choices(browseChoices(), focus)}</select></label></p>`}
<p role="status">${matches.length.toLocaleString()} confirmed ${matches.length === 1 ? 'match' : 'matches'} among ${report.participants.length.toLocaleString()} indexed ${report.participants.length === 1 ? 'participant' : 'participants'}.</p>
${pagination}
${rows ? `<div class="grid" tabindex="0" role="region" aria-label="Participant availability table. Use arrow keys to scroll."><table aria-label="Participant availability"><thead><tr><th scope="col">Participant</th>${headers.map((name) => `<th scope="col">${escape(name)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>` : ''}
<p>Missing means the inspected branch had no matching data. Not checked marks incomplete coverage.</p>`);
  };
  const renderDocument = (
    content: string,
  ) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${panel.webview.cspSource} 'nonce-${nonce}';">
<link rel="stylesheet" href="${styles.toString()}">
<style nonce="${nonce}">table{border-collapse:collapse} th,td{padding:.5rem;border:1px solid var(--vscode-panel-border);text-align:left;vertical-align:top;white-space:nowrap} input[name="participant"]{width:min(240px, 100%)} input[type="checkbox"]{width:auto} fieldset{border:1px solid var(--vscode-panel-border);margin-block:8px} .grid{overflow:auto} td div+div{margin-top:.25rem} button[data-participant]{color:var(--vscode-textLink-foreground);background:none;text-decoration:underline;padding:0} button[aria-pressed="true"], button[type="submit"]{color:var(--vscode-button-foreground);background:var(--vscode-button-background)}</style></head>
<body><main><h1>Participant availability</h1>${content}</main>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
document.getElementById('filters')?.addEventListener('submit', event => {
  event.preventDefault();
  const form = new FormData(event.target);
  vscode.postMessage({
    filter: {
      participant: form.get('participant'),
      raw: form.getAll('raw'),
      requireOutput: form.has('requireOutput'),
      pipeline: form.get('pipeline') || '',
      session: form.get('session') || '',
      modality: form.get('modality') || '',
    },
    revision: ${revision},
  });
});
document.getElementById('browse-focus')?.addEventListener('change', event => {
  vscode.postMessage({ focus: event.target.value, revision: ${revision} });
});
document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (button?.dataset.view) vscode.postMessage({ view: button.dataset.view, revision: ${revision} });
  if (button?.id === 'scan') vscode.postMessage({ scan: true, revision: ${revision} });
  if (button?.dataset.page !== undefined) vscode.postMessage({ page: Number(button.dataset.page), revision: ${revision} });
  if (button?.dataset.participant !== undefined) vscode.postMessage({ index: Number(button.dataset.participant), revision: ${revision} });
});
window.addEventListener('message', ({ data }) => {
  const progress = document.getElementById('scan-progress');
  if (${!!active} && data.revision === ${revision} && progress) progress.textContent = data.progress;
});
</script></body></html>`;

  const scan = async (retryIncomplete = false) => {
    const controller = new AbortController();
    active = controller;
    status = snapshot ? 'Scanning. Showing the previous snapshot.' : 'Scanning availability…';
    render();
    try {
      const next = await load(
        controller,
        (completed, total) => {
          status = `Indexed ${completed.toLocaleString()} of ${total.toLocaleString()} participants.`;
          if (snapshot) status += ' Showing the previous snapshot.';
          if (!disposed) void panel.webview.postMessage({ progress: status, revision });
        },
        retryIncomplete,
      );
      controller.signal.throwIfAborted();
      snapshot = next;
      modalities = availabilityModalities(next);
      const available = browseChoices();
      if (view !== 'sessions' && !available.length) view = 'sessions';
      if (!available.includes(focus)) focus = available[0] ?? '';
      updateMatches(next);
      status = `Snapshot ready. ${next.participants.length.toLocaleString()} ${next.participants.length === 1 ? 'participant' : 'participants'} indexed.`;
    } catch {
      status = controller.signal.aborted ? 'Scan cancelled.' : 'Scan failed. Try refreshing.';
      if (snapshot) status += ' Showing the previous snapshot.';
    } finally {
      active = undefined;
      if (!disposed) render();
    }
  };
  let disposed = false;
  const listener = panel.webview.onDidReceiveMessage(async (message: unknown) => {
    if (
      !message ||
      typeof message !== 'object' ||
      !('revision' in message) ||
      message.revision !== revision
    )
      return;
    if ('scan' in message && message.scan === true) {
      if (active) active.abort();
      else void scan(true);
      return;
    }
    if ('filter' in message && snapshot) {
      const input = message.filter;
      if (!input || typeof input !== 'object') return;
      const { participant, raw, pipeline, session, modality, requireOutput } =
        input as Partial<AvailabilityFilter>;
      if (
        typeof participant !== 'string' ||
        typeof pipeline !== 'string' ||
        typeof session !== 'string' ||
        typeof modality !== 'string' ||
        !Array.isArray(raw) ||
        !raw.every((item) => typeof item === 'string')
      )
        return;
      filter = {
        participant,
        raw,
        pipeline,
        session,
        modality,
        requireOutput: requireOutput === true || !!(pipeline || session || modality),
      };
      updateMatches(snapshot);
      render();
      return;
    }
    if (snapshot && 'view' in message) {
      const mode = message.view;
      if (
        mode === 'sessions' ||
        (mode === 'modality' && modalities.length) ||
        (mode === 'pipeline' && snapshot.sources.length > 1)
      ) {
        view = mode;
        focus =
          view === 'pipeline' && snapshot.sources.slice(1).includes(filter.pipeline)
            ? filter.pipeline
            : (browseChoices()[0] ?? '');
        updateMatches(snapshot);
        render();
      }
      return;
    }
    if (snapshot && 'focus' in message && typeof message.focus === 'string') {
      if (view !== 'sessions' && browseChoices().includes(message.focus)) {
        focus = message.focus;
        updateMatches(snapshot);
        render();
      }
      return;
    }
    if (
      'page' in message &&
      typeof message.page === 'number' &&
      Number.isSafeInteger(message.page)
    ) {
      if (message.page >= 0 && message.page * availabilityPageSize < matches.length) {
        page = message.page;
        render();
      }
      return;
    }
    if (
      !('index' in message) ||
      typeof message.index !== 'number' ||
      !Number.isSafeInteger(message.index)
    )
      return;
    const participant = snapshot?.participants[message.index];
    if (participant) await reveal(participant);
  });
  panel.onDidDispose(() => {
    disposed = true;
    active?.abort();
    listener.dispose();
  });
  void scan();
  return panel;
}
