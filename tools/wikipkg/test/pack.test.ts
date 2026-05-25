import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as tar from 'tar';
import { packWikipkg } from '../src/pack.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = (n: string) => resolve(here, 'fixtures', n);

describe('packWikipkg', () => {
  let workDir: string;
  beforeAll(async () => {
    workDir = await mkdtemp(resolve(tmpdir(), 'wikipkg-'));
  });
  afterAll(async () => {
    if (workDir) await rm(workDir, { recursive: true, force: true });
  });

  it('packs the valid fixture and roundtrips', async () => {
    const out = resolve(workDir, 'out.wikipkg.tar.gz');
    const r = await packWikipkg(fixtures('valid'), out);
    expect(r.ok).toBe(true);

    const extractDir = resolve(workDir, 'extract');
    await import('node:fs/promises').then((fs) => fs.mkdir(extractDir, { recursive: true }));
    await tar.extract({ file: out, cwd: extractDir });
    const top = await readdir(extractDir);
    expect(top).toContain('manifest.json');
    expect(top).toContain('chapters');
    expect(top).toContain('quizzes');
    expect(top).toContain('glossary.json');
  });

  it('refuses to pack an invalid wikipkg dir', async () => {
    const out = resolve(workDir, 'bad.tar.gz');
    const r = await packWikipkg(fixtures('invalid-orphan-path'), out);
    expect(r.ok).toBe(false);
  });
});
