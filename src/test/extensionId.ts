import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const manifest = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8')) as {
  publisher: string;
  name: string;
};

export const extensionId = `${manifest.publisher}.${manifest.name}`;
