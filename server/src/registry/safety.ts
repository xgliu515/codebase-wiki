import { isAbsolute, resolve } from 'node:path';

export type SafetyLimits = {
  maxTarballBytes: number;
  maxFilesPerTarball: number;
  maxFileSizeBytes: number;
};

export function defaultLimits(env: Record<string, string | undefined>): SafetyLimits {
  return {
    maxTarballBytes: Number(env.MAX_TARBALL_BYTES ?? 52428800),
    maxFilesPerTarball: Number(env.MAX_FILES_PER_TARBALL ?? 10000),
    maxFileSizeBytes: Number(env.MAX_FILE_SIZE_BYTES ?? 10485760),
  };
}

export function isSafeRelative(rel: string, baseDir: string): boolean {
  if (isAbsolute(rel)) return false;
  if (rel.includes('\\')) return false;
  if (rel.split('/').includes('..')) return false;
  const base = resolve(baseDir);
  const resolved = resolve(baseDir, rel);
  return resolved === base || resolved.startsWith(base + '/');
}
