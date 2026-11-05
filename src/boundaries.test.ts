import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..');
const BANNED_TOKEN_HASHES = new Set(['747914346cf70cc2', '0668a9ba9eb0dc5d', 'a16a5aca4c302382', '43e2c4a51d9cec42', 'cb318823db4ecae5', 'a43522ca050afc34', '17e1cf781fb3f414']);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const sourceFiles = walk(join(ROOT, 'src'));
const productionFiles = sourceFiles.filter((file) => !file.endsWith('.test.ts') && !file.includes('testing'));

describe('package boundaries', () => {
  it('with production source, imports no node module', () => {
    const offenders = productionFiles.filter((file) => /from 'node:|require\(|from '(fs|path|os)'/.test(readFileSync(file, 'utf8')));

    expect(productionFiles.length).toBeGreaterThan(5);
    expect(offenders).toEqual([]);
  });

  it('with every package file, holds no real company or client data', () => {
    const files = [...sourceFiles, join(ROOT, 'README.md'), join(ROOT, 'package.json')];
    const tokens = (file: string): string[] => readFileSync(file, 'utf8').match(/[\p{L}\p{N}]+/gu) ?? [];

    const hits = files.filter((file) => tokens(file).some((token) => BANNED_TOKEN_HASHES.has(createHash('sha256').update(token.toUpperCase()).digest('hex').slice(0, 16))));

    expect(hits).toEqual([]);
  });
});
