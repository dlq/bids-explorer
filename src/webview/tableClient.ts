import type { TableSnapshot, SummaryTablePreview } from '../core/tableTypes';
declare function acquireVsCodeApi(): { postMessage(message: unknown): void };
const api = acquireVsCodeApi();
const element = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
let table: TableSnapshot | undefined, dictionary: SummaryTablePreview['dictionary'] | undefined;
let isEventsTable = false;
let page = 0,
  columnPage = 0,
  visibleCount = 0;
const short = (value: string): string => (value.length > 2000 ? value.slice(0, 2000) + '…' : value);
function report(): void {
  if (!table) return;
  api.postMessage({
    type: 'rendered',
    sourceUri: table.snapshot.sourceUri,
    rowCount: table.rows.length,
    visibleCount,
    page,
    columnPage,
    firstCell: table.rows[0]?.cells[0],
    dictionaryStatus: dictionary?.status,
    title: element('title').textContent,
    identifierColumn: table.identifierColumn,
    dictionarySourceCount: element<HTMLSelectElement>('dictionary-source').options.length,
    dictionaryText: element('dictionary').textContent?.slice(0, 2000),
    issuesText: element('issues').textContent,
    errorText: element('error').hidden ? '' : element('error').textContent,
    displayedCells: Array.from(element('rows').querySelectorAll('tr:first-child td')).map(
      (cell) => cell.textContent,
    ),
    displayedColumns: element('head').querySelectorAll('th').length - 1,
    columnLabels: Array.from(element('head').querySelectorAll('th')).map(
      (header) => header.textContent,
    ),
    tableRegionTabIndex: document.querySelector<HTMLElement>('.table-scroll')?.tabIndex,
    hasColumnPaging: !element('column-paging').hidden,
    hasRowPaging: !element('next').hidden,
    dictionaryLabels: Array.from(element('dictionary').querySelectorAll('dt')).map(
      (term) => term.textContent,
    ),
  });
}
function dictionaryDescription(valueText: string): HTMLElement | undefined {
  let value: unknown;
  try {
    value = JSON.parse(valueText);
  } catch {
    return;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const fields = value as Record<string, unknown>;
  const description = document.createElement('dl');
  const add = (label: string, text: string) => {
    const term = document.createElement('dt');
    const definition = document.createElement('dd');
    term.textContent = short(label);
    definition.textContent = short(text);
    description.append(term, definition);
  };
  for (const [key, label] of [
    ['LongName', 'Name'],
    ['Description', 'Description'],
    ['Units', 'Units'],
  ]) {
    const text = fields[key];
    if (typeof text === 'string') add(label, text);
  }
  const levels = fields.Levels;
  if (levels && typeof levels === 'object' && !Array.isArray(levels)) {
    for (const [code, meaning] of Object.entries(levels).slice(0, 100)) {
      if (typeof meaning === 'string') add(code, meaning);
    }
  }
  return description.childElementCount ? description : undefined;
}

function render(): void {
  if (!table) return;
  const filter = element<HTMLInputElement>('filter').value.toLowerCase();
  const rows = table.rows.filter((row) =>
    row.cells.some((cell) => cell.toLowerCase().includes(filter)),
  );
  page = Math.max(0, Math.min(page, Math.ceil(rows.length / 50) - 1));
  const width = table.rows.reduce(
    (max, row) => Math.max(max, row.cells.length),
    table.columns.length,
  );
  const columns = Array.from({ length: width }, (_, i) => i).slice(
    columnPage * 12,
    columnPage * 12 + 12,
  );
  const head = element('head'),
    body = element('rows');
  head.replaceChildren();
  body.replaceChildren();
  const heading = document.createElement('tr'),
    line = document.createElement('th');
  line.textContent = 'Source line';
  line.scope = 'col';
  line.className = 'source-line';
  heading.append(line);
  for (const i of columns) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = short(table.columns[i] ?? `Extra cell ${i + 1} (no header)`);
    if (th.textContent === '') th.textContent = `(empty header ${i + 1})`;
    if (isEventsTable && (table.columns[i] === 'onset' || table.columns[i] === 'duration')) {
      const units = document.createElement('span');
      units.className = 'column-units';
      units.textContent = ' (s)';
      th.append(units);
    }
    heading.append(th);
  }
  head.append(heading);
  const shown = rows.slice(page * 50, page * 50 + 50);
  visibleCount = shown.length;
  for (const row of shown) {
    const tr = document.createElement('tr'),
      index = document.createElement('th');
    index.scope = 'row';
    index.className = 'source-line';
    index.textContent = String(row.line);
    tr.append(index);
    for (const i of columns) {
      const td = document.createElement('td'),
        cell = row.cells[i];
      td.textContent = cell === undefined ? '(no cell)' : cell === '' ? '(empty)' : short(cell);
      if (cell === 'n/a' || cell === undefined || cell === '') td.className = 'missing';
      td.title =
        cell === 'n/a'
          ? 'Recorded missing value: n/a'
          : short('Source token: ' + (row.tokens[i] ?? '(no cell)'));
      tr.append(td);
    }
    body.append(tr);
  }
  element('page').textContent =
    `${rows.length ? page * 50 + 1 : 0}–${Math.min(rows.length, (page + 1) * 50)} of ${rows.length} matching rows`;
  element('columns').textContent =
    `${columnPage * 12 + 1}–${Math.min(width, (columnPage + 1) * 12)} of ${width} columns`;
  element('column-paging').hidden = width <= 12;
  element('previous').hidden = rows.length <= 50;
  element('next').hidden = rows.length <= 50;
  element<HTMLButtonElement>('previous').disabled = page === 0;
  element<HTMLButtonElement>('next').disabled = (page + 1) * 50 >= rows.length;
  element<HTMLButtonElement>('left').disabled = columnPage === 0;
  element<HTMLButtonElement>('right').disabled = (columnPage + 1) * 12 >= width;
  element('summary').textContent =
    `${table.rows.length} recorded rows · ${table.columns.length} columns`;
  element('issues').textContent = [
    table.duplicateHeaders.length ? `${table.duplicateHeaders.length} duplicate header names` : '',
    table.duplicateIds.length
      ? `${table.duplicateIds.length} repeated ${table.identifierColumn} values (rows retained)`
      : '',
    table.unevenRows
      ? `${table.unevenRows} rows differ from the header width (extra/absent cells retained)`
      : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const definitions = element('dictionary');
  definitions.replaceChildren();
  element('dictionary-status').textContent =
    dictionary?.status === 'loaded'
      ? 'Expand a column to see its recorded definition. Values in the table are shown as recorded.'
      : `Dictionary ${dictionary?.status ?? 'unavailable'}${dictionary?.error ? ': ' + short(dictionary.error) : ''}`;
  for (const i of columns) {
    const name = table.columns[i];
    const fields =
      (dictionary?.fields ?? dictionary?.metadata?.fields)?.filter((field) => field.key === name) ??
      [];
    const details = document.createElement('details'),
      summary = document.createElement('summary');
    summary.textContent =
      short(name ?? `Extra cell ${i + 1}`) +
      (fields.length > 1 ? ` · ${fields.length} recorded definitions` : '');
    if (!fields.length) continue;
    details.append(summary);
    for (const field of fields) {
      const pre = document.createElement('pre'),
        provenance = document.createElement('p');
      pre.textContent =
        field.valueText.slice(0, 16000) +
        (field.valueText.length > 16000
          ? '\n… Value shortened; open dictionary for full text.'
          : '');
      provenance.textContent = short(
        `${field.sourceUri} · ${field.pointer}${field.duplicated ? ' · ambiguous duplicate name' : ''}`,
      );
      const description =
        !field.duplicated && field.valueText.length <= 16000
          ? dictionaryDescription(field.valueText)
          : undefined;
      if (description) {
        const sourceDetails = document.createElement('details');
        const sourceSummary = document.createElement('summary');
        sourceSummary.textContent = 'Recorded JSON and source';
        sourceDetails.append(sourceSummary, pre, provenance);
        details.append(description, sourceDetails);
      } else {
        details.append(pre, provenance);
      }
    }
    definitions.append(details);
  }
  if (!definitions.childElementCount && dictionary?.status === 'loaded')
    element('dictionary-status').textContent = 'No recorded definitions for these columns.';
  report();
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
    return;
  }
  if (
    message.type !== 'snapshot' ||
    !('table' in message) ||
    !message.table ||
    typeof message.table !== 'object' ||
    !('columns' in message.table) ||
    !Array.isArray(message.table.columns) ||
    !('rows' in message.table) ||
    !Array.isArray(message.table.rows) ||
    message.table.rows.length > 10000 ||
    !('dictionary' in message)
  )
    return;
  element('title').textContent =
    'kind' in message && message.kind === 'sessions'
      ? 'Sessions'
      : 'kind' in message && message.kind === 'scans'
        ? 'Scans'
        : 'kind' in message && message.kind === 'events'
          ? 'Events'
          : 'kind' in message && message.kind === 'table'
            ? 'Table'
            : 'Participants';
  table = message.table as TableSnapshot;
  isEventsTable = 'kind' in message && message.kind === 'events';
  if (isEventsTable)
    element('table-note').textContent =
      'Events are shown in file order. BIDS defines onset and duration in seconds. n/a marks missing data.';
  element('filename').textContent = decodeURIComponent(
    new URL(table.snapshot.sourceUri).pathname.split('/').at(-1)!,
  );
  if (table.snapshot.archiveSource)
    element('table-note').textContent =
      (element('table-note').textContent ?? '') +
      ' This preview uses the dictionary next to the table inside the archive, when available.';
  dictionary = message.dictionary as SummaryTablePreview['dictionary'];
  columnPage = Math.min(columnPage, Math.max(0, Math.ceil(table.columns.length / 12) - 1));
  const origin = table.snapshot.archiveSource;
  element('source').textContent = origin
    ? `${origin.sourceUri} :: ${origin.memberPath} (member ${origin.memberIndex})`
    : table.snapshot.sourceUri;
  element('revision').textContent =
    `Table snapshot: ${table.snapshot.capturedAt} · ${table.snapshot.revision.size} bytes. Dictionary: ${dictionary.sourceUri}${dictionary.metadata ? ' · snapshot ' + dictionary.metadata.snapshot.capturedAt : ''}. Snapshots are separate explicit reads, not an atomic dataset snapshot.`;
  const sources = dictionary.sources ?? (dictionary.metadata ? [dictionary.metadata.snapshot] : []);
  const select = element<HTMLSelectElement>('dictionary-source');
  select.replaceChildren();
  for (const [index, source] of sources.entries()) {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = source.sourceUri;
    select.append(option);
  }
  element('dictionary-source-label').hidden = sources.length === 0;
  element<HTMLButtonElement>('dictionary-raw').hidden = sources.length === 0;
  element('revision').textContent += sources
    .map((source) => `\n${source.sourceUri} · ${source.capturedAt ?? 'unreadable source'}`)
    .join('');
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
element('left').addEventListener('click', () => {
  columnPage--;
  render();
});
element('right').addEventListener('click', () => {
  columnPage++;
  render();
});
element('raw').addEventListener('click', () => api.postMessage({ type: 'openRaw' }));
element('dictionary-raw').addEventListener('click', () =>
  api.postMessage({
    type: 'openDictionary',
    index: Number(element<HTMLSelectElement>('dictionary-source').value),
  }),
);
element('reload').addEventListener('click', () => {
  element<HTMLButtonElement>('reload').disabled = true;
  api.postMessage({ type: 'reload' });
});
api.postMessage({ type: 'ready' });
