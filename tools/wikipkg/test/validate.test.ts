import { describe, it, expect } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateWikipkgDir } from '../src/validate.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = (n: string) => resolve(here, 'fixtures', n);

describe('validateWikipkgDir', () => {
  it('passes on the valid fixture', async () => {
    const r = await validateWikipkgDir(fixtures('valid'));
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('should not reach');
    expect(r.manifest.subject.slug).toBe('demo');
  });

  it('fails on missing manifest.json', async () => {
    const r = await validateWikipkgDir(fixtures('invalid-missing-manifest'));
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('should not reach');
    expect(r.errors[0].code).toBe('manifest_missing');
  });

  it('fails on path traversal in chapters[].path', async () => {
    const r = await validateWikipkgDir(fixtures('invalid-path-traversal'));
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('should not reach');
    expect(r.errors.some((e) => e.code === 'manifest_invalid')).toBe(true);
  });

  it('fails on orphan path (manifest references missing file)', async () => {
    const r = await validateWikipkgDir(fixtures('invalid-orphan-path'));
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('should not reach');
    expect(r.errors.some((e) => e.code === 'referenced_file_missing')).toBe(true);
  });
});
