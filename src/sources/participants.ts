import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseTable } from '../core/tables';
import { parseJsonMetadata } from '../core/metadata';
import type { ParticipantsPreview } from '../core/tableTypes';
import { readTextSnapshot } from './previewText';

/** Same-directory participant dictionary only; no recursive discovery or inferred defaults. */
export async function loadParticipants(
  uri: string,
  signal: AbortSignal,
  read = readTextSnapshot,
): Promise<ParticipantsPreview> {
  const path = fileURLToPath(uri);
  if (basename(path) !== 'participants.tsv') throw new Error('Choose a participants.tsv file.');
  const table = await parseTable(await read(uri, signal), signal);
  const sourceUri = pathToFileURL(join(dirname(path), 'participants.json')).href;
  let dictionary: ParticipantsPreview['dictionary'];
  try {
    const metadata = await parseJsonMetadata(await read(sourceUri, signal), signal);
    dictionary = Object.freeze({ sourceUri, status: 'loaded', metadata });
  } catch (error) {
    signal.throwIfAborted();
    dictionary = Object.freeze({
      sourceUri,
      status: (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'absent' : 'unavailable',
      error: String(error),
    });
  }
  signal.throwIfAborted();
  return Object.freeze({ table, dictionary });
}
