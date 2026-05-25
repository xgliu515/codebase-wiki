import { readFile, stat } from 'node:fs/promises';
import { resolve, isAbsolute } from 'node:path';
import { ManifestSchema, type Manifest, QuizSchema, GlossarySchema } from '@codebase-wiki/shared';

export type ValidationError = {
  code:
    | 'manifest_missing'
    | 'manifest_malformed'
    | 'manifest_invalid'
    | 'referenced_file_missing'
    | 'quiz_malformed'
    | 'glossary_malformed';
  message: string;
  path?: string;
};

export type ValidationResult =
  | { ok: true; manifest: Manifest }
  | { ok: false; errors: ValidationError[] };

async function fileExists(p: string): Promise<boolean> {
  try {
    const s = await stat(p);
    return s.isFile();
  } catch {
    return false;
  }
}

export function isSafeRelative(rel: string, baseDir: string): boolean {
  if (isAbsolute(rel)) return false;
  const base = resolve(baseDir);
  const resolved = resolve(baseDir, rel);
  return resolved === base || resolved.startsWith(base + '/');
}

export async function validateWikipkgDir(dir: string): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const manifestPath = resolve(dir, 'manifest.json');

  if (!(await fileExists(manifestPath))) {
    return { ok: false, errors: [{ code: 'manifest_missing', message: `no manifest.json in ${dir}` }] };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (e) {
    return { ok: false, errors: [{ code: 'manifest_malformed', message: String(e) }] };
  }

  const parsed = ManifestSchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push({
        code: 'manifest_invalid',
        message: issue.message,
        path: issue.path.join('.'),
      });
    }
    return { ok: false, errors };
  }
  const manifest = parsed.data;

  // Cross-check: every declared path exists and is inside dir
  const checkPath = async (rel: string, label: string) => {
    if (!isSafeRelative(rel, dir)) {
      errors.push({ code: 'manifest_invalid', message: `path traversal: ${rel}`, path: label });
      return;
    }
    if (!(await fileExists(resolve(dir, rel)))) {
      errors.push({ code: 'referenced_file_missing', message: `file missing: ${rel}`, path: label });
    }
  };

  for (const ch of manifest.chapters) {
    await checkPath(ch.path, `chapters[${ch.id}].path`);
    if (ch.quiz_path) await checkPath(ch.quiz_path, `chapters[${ch.id}].quiz_path`);
  }
  for (const t of manifest.tours) {
    await checkPath(t.overview_path, `tours[${t.id}].overview_path`);
    for (const s of t.steps) await checkPath(s.path, `tours[${t.id}].steps[${s.order}].path`);
  }
  for (const f of manifest.figures) {
    await checkPath(f.path, `figures[${f.id}].path`);
  }
  await checkPath(manifest.glossary_path, 'glossary_path');

  // Deep-validate quiz / glossary JSONs (manifest schema only ensures paths exist)
  for (const ch of manifest.chapters) {
    if (!ch.quiz_path) continue;
    const qPath = resolve(dir, ch.quiz_path);
    if (await fileExists(qPath)) {
      try {
        const qRaw = JSON.parse(await readFile(qPath, 'utf8'));
        const qParsed = QuizSchema.safeParse(qRaw);
        if (!qParsed.success) {
          for (const issue of qParsed.error.issues) {
            errors.push({
              code: 'quiz_malformed',
              message: `${ch.quiz_path}: ${issue.message}`,
              path: issue.path.join('.'),
            });
          }
        } else if (qParsed.data.chapter_id !== ch.id) {
          errors.push({
            code: 'quiz_malformed',
            message: `${ch.quiz_path}: chapter_id ${qParsed.data.chapter_id} != ${ch.id}`,
          });
        }
      } catch (e) {
        errors.push({ code: 'quiz_malformed', message: `${ch.quiz_path}: ${e}` });
      }
    }
  }

  const gPath = resolve(dir, manifest.glossary_path);
  if (await fileExists(gPath)) {
    try {
      const gRaw = JSON.parse(await readFile(gPath, 'utf8'));
      const gParsed = GlossarySchema.safeParse(gRaw);
      if (!gParsed.success) {
        for (const issue of gParsed.error.issues) {
          errors.push({
            code: 'glossary_malformed',
            message: issue.message,
            path: issue.path.join('.'),
          });
        }
      }
    } catch (e) {
      errors.push({ code: 'glossary_malformed', message: String(e) });
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, manifest };
}
