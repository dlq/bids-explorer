import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { open, type ZipFile, type Entry } from 'yauzl';

const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as {
  name: string;
  version: string;
  publisher: string;
  main: string;
  icon: string;
  license: string;
  capabilities: Record<string, { supported: boolean; description: string }>;
};
const path =
  process.env.BIDS_EXPLORER_VSIX ?? join('dist', `${manifest.name}-${manifest.version}.vsix`);
const selected = new Set([
  'extension/package.json',
  'extension/package.nls.json',
  'extension/' + manifest.icon,
]);

async function inspectPackage() {
  const zip = await new Promise<ZipFile>((resolve, reject) =>
    open(path, { lazyEntries: true }, (error, file) => {
      if (error) reject(error);
      else resolve(file);
    }),
  );
  const files = new Set<string>();
  const contents = new Map<string, Buffer>();
  return new Promise<{ files: Set<string>; contents: Map<string, Buffer> }>((resolve, reject) => {
    const fail = (error: unknown) => {
      zip.close();
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    const read = async (entry: Entry) => {
      files.add(entry.fileName);
      if (!selected.has(entry.fileName)) return;
      assert.ok(entry.uncompressedSize <= 1024 * 1024, 'Package metadata/icon must be bounded');
      const stream = await new Promise<Readable>((resolve, reject) =>
        zip.openReadStream(entry, (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }),
      );
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(chunk as Buffer);
      contents.set(entry.fileName, Buffer.concat(chunks));
    };
    zip.on('error', fail);
    zip.on('entry', (entry: Entry) => void read(entry).then(() => zip.readEntry(), fail));
    zip.on('end', () => resolve({ files, contents }));
    zip.readEntry();
  });
}
const inspected = inspectPackage();

void test('the portable VSIX excludes native build bindings and development sources', async () => {
  const { files } = await inspected;
  assert.deepEqual(
    [...files].filter(
      (name) =>
        name.endsWith('.node') ||
        name.startsWith('extension/node_modules/@rollup/') ||
        /^extension\/(src|test|\.local|\.github|out\/test)\//.test(name),
    ),
    [],
  );
});

void test('the VSIX contains its declared entry, approved icon and every preview client', async () => {
  const { files, contents } = await inspected;
  const packaged = JSON.parse(
    contents.get('extension/package.json')!.toString(),
  ) as typeof manifest;
  for (const key of ['name', 'version', 'publisher', 'main', 'icon', 'license'] as const)
    assert.equal(packaged[key], manifest[key], `Packaged ${key} must match the manifest`);
  assert.ok(files.has('extension/' + manifest.main.replace(/^\.\//, '')));
  assert.ok(files.has('extension/readme.md'));
  assert.ok(files.has('extension/LICENSE.txt'));
  const localized = JSON.parse(contents.get('extension/package.nls.json')!.toString()) as Record<
    string,
    string
  >;
  for (const key of ['untrustedWorkspaces', 'virtualWorkspaces']) {
    const capability = packaged.capabilities[key];
    assert.equal(capability.supported, false);
    assert.match(capability.description, /^%[^%]+%$/);
    assert.ok(
      localized[capability.description.slice(1, -1)]?.length > 20,
      `Missing explanation for ${key}`,
    );
  }
  const png = contents.get('extension/' + manifest.icon)!;
  assert.deepEqual(png, readFileSync(manifest.icon));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.ok(png.readUInt32BE(16) >= 128 && png.readUInt32BE(20) >= 128);
  for (const client of readdirSync('src/webview').filter((name) => name.endsWith('Client.ts')))
    assert.ok(
      files.has('extension/out/browser/webview/' + client.replace(/\.ts$/, '.js')),
      `Missing packaged preview client: ${client}`,
    );
});
