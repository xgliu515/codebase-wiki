import { mkdir, writeFile, rm } from 'node:fs/promises';
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
  let violation: { code: 'path_traversal' | 'archive_bombsuspect'; message: string } | null = null;

  try {
    await tar.extract({
      file: tarPath,
      cwd: contentDir,
      strict: true,
      filter: (path, entry: any) => {
        if (violation) return false;
        if (!isSafeRelative(path, contentDir)) {
          violation = { code: 'path_traversal' as const, message: `path_traversal: ${path}` };
          return false;
        }
        if (entry.size && entry.size > limits.maxFileSizeBytes) {
          violation = {
            code: 'archive_bombsuspect' as const,
            message: `file > ${limits.maxFileSizeBytes} bytes: ${path}`,
          };
          return false;
        }
        fileCount += 1;
        if (fileCount > limits.maxFilesPerTarball) {
          violation = { code: 'archive_bombsuspect' as const, message: `> ${limits.maxFilesPerTarball} files` };
          return false;
        }
        return true;
      },
    });
  } catch (e) {
    await rm(stageDir, { recursive: true, force: true }).catch(() => {});
    return { ok: false, error: String(e), code: 'invalid_archive' };
  }

  if (violation) {
    const v = violation as { code: 'path_traversal' | 'archive_bombsuspect'; message: string };
    await rm(stageDir, { recursive: true, force: true }).catch(() => {});
    return { ok: false, error: v.message, code: v.code };
  }

  return { ok: true, stageDir, contentDir, fileCount };
}
