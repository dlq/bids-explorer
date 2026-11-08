// A separate extension-host stand-in. Gate the real stream after its header so
// tests can observe an in-flight reservation without relying on image size/timing.
import { ArchiveImageCache, type ImageCacheLimits } from '../sources/archiveImageCache';
import * as members from '../sources/archiveMember';

const [root, uri, encodedLimits] = process.argv.slice(2);
const controller = new AbortController();
let release!: () => void;
const gate = new Promise<void>((resolve) => (release = resolve));
const original = members.streamArchiveMember;
Object.assign(members, {
  streamArchiveMember: (...args: Parameters<typeof original>) => {
    const start = args[5];
    args[5] = async (header) => {
      await start?.(header);
      process.send!({ type: 'holding' });
      await gate;
      controller.signal.throwIfAborted();
    };
    return original(...args);
  },
});
process.on('message', (message: string) => {
  if (message === 'release') release();
  if (message === 'abort') {
    controller.abort();
    release();
  }
  if (message !== 'go') return;
  void (async () => {
    let retain: (() => Promise<void>) | undefined;
    try {
      const cache = new ArchiveImageCache(root, JSON.parse(encodedLimits) as ImageCacheLimits);
      retain = await cache.retain();
      const result = await cache.materialize(uri, controller.signal);
      process.send!({ type: 'result', result });
    } catch (error) {
      process.send!({
        type: 'result',
        error: (error as Error).message,
        name: (error as Error).name,
      });
    } finally {
      if (retain) await retain();
      process.disconnect();
    }
  })();
});
process.send!({ type: 'ready' });
