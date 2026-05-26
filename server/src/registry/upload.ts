import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import * as tar from 'tar';
import { isSafeRelative, type SafetyLimits } from './safety.js';

export type StageResult =
  | { ok: true; stageDir: string; contentDir: string; fileCount: number }
  | { ok: false; error: string; code: 'payload_too_large' | 'invalid_archive' | 'path_traversal' | 'archive_bombsuspect' };

export async function stageTarball(
  bytes: Uint8Array,
  dataDir: string,
  limits: SafetyLimits,
): Promise<StageResult> {
  if (bytes.byteLength > limits.maxTarballBytes) {
    return { ok: false, error: `payload exceeds ${limits.maxTarballBytes} bytes`, code: 'payload_too_large' };
  }

  const id = randomBytes(8).toString('hex');
  const stageDir = resolve(dataDir, '_staging', id);
  const contentDir = resolve(stageDir, 'content');
  await mkdir(contentDir, { recursive: true });

  const tarPath = resolve(stageDir, 'upload.tar.gz');
  await writeFile(tarPath, bytes);

  let fileCount = 0;
  try {
    await tar.extract({
      file: tarPath,
      cwd: contentDir,
      strict: true,
      filter: (path) => {
        fileCount += 1;
        if (fileCount > limits.maxFilesPerTarball) {
          throw new Error(`archive_bombsuspect: > ${limits.maxFilesPerTarball} files`);
        }
        if (!isSafeRelative(path, contentDir)) {
          throw new Error(`path_traversal: ${path}`);
        }
        return true;
      },
      onentry: (entry) => {
        if (entry.size && entry.size > limits.maxFileSizeBytes) {
          throw new Error(`archive_bombsuspect: file > ${limits.maxFileSizeBytes} bytes: ${entry.path}`);
        }
      },
    });
  } catch (e) {
    const msg = String(e);
    if (msg.includes('path_traversal')) return { ok: false, error: msg, code: 'path_traversal' };
    if (msg.includes('archive_bombsuspect')) return { ok: false, error: msg, code: 'archive_bombsuspect' };
    return { ok: false, error: msg, code: 'invalid_archive' };
  }

  return { ok: true, stageDir, contentDir, fileCount };
}
