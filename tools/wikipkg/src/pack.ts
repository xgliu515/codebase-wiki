import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as tar from 'tar';
import { validateWikipkgDir, type ValidationError } from './validate.js';

export type PackResult =
  | { ok: true; outPath: string; entries: number }
  | { ok: false; errors: ValidationError[] };

export async function packWikipkg(dir: string, outPath: string): Promise<PackResult> {
  const v = await validateWikipkgDir(dir);
  if (!v.ok) return { ok: false, errors: v.errors };

  // Collect top-level entries to pack (excludes nothing — wikipkg dir is already clean)
  const entries = await readdir(dir);

  await tar.create(
    {
      gzip: true,
      file: outPath,
      cwd: dir,
      portable: true,
    },
    entries,
  );

  return { ok: true, outPath: resolve(outPath), entries: entries.length };
}
