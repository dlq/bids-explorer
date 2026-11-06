import type { CancellationToken } from 'vscode';

/** Keep VS Code cancellation wired up for the lifetime of a host read. */
export async function withCancellation<T>(
  token: CancellationToken,
  controller: AbortController,
  read: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const listener = token.onCancellationRequested(() => controller.abort());
  try {
    if (token.isCancellationRequested) controller.abort();
    return await read(controller.signal);
  } finally {
    listener.dispose();
  }
}
