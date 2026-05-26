import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  ManifestSchema,
  QuizSchema,
  GlossarySchema,
  parseSchemaMajor,
  type Manifest,
} from '@codebase-wiki/shared';
import { isSafeRelative } from './safety.js';

export type ServiceValidationError = {
  code:
    | 'manifest_missing'
    | 'manifest_malformed'
    | 'manifest_invalid'
    | 'schema_unsupported'
    | 'content_type_unsupported'
    | 'referenced_file_missing'
    | 'quiz_empty'
    | 'quiz_answer_invalid'
    | 'quiz_malformed'
    | 'glossary_malformed'
    | 'svg_unsafe';
  message: string;
  path?: string;
};

export type ServiceValidationResult =
  | { ok: true; manifest: Manifest }
  | { ok: false; errors: ServiceValidationError[] };

const SUPPORTED_MAJORS = new Set(['1']);
const SUPPORTED_CONTENT_TYPES = new Set(['codebase']);

async function fileExists(p: string): Promise<boolean> {
  try {
    const s = await stat(p);
    return s.isFile();
  } catch {
    return false;
  }
}

export async function validateStagedContent(contentDir: string): Promise<ServiceValidationResult> {
  const errors: ServiceValidationError[] = [];
  const manifestPath = resolve(contentDir, 'manifest.json');
  if (!(await fileExists(manifestPath))) {
    return { ok: false, errors: [{ code: 'manifest_missing', message: 'no manifest.json' }] };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (e) {
    return { ok: false, errors: [{ code: 'manifest_malformed', message: String(e) }] };
  }

  // Schema_version + content_type gates BEFORE full zod parse
  const obj = raw as { schema_version?: string; content_type?: string };
  if (typeof obj.schema_version === 'string') {
    let major: number;
    try {
      major = parseSchemaMajor(obj.schema_version);
    } catch (e) {
      return { ok: false, errors: [{ code: 'manifest_invalid', message: `bad schema_version: ${e}` }] };
    }
    if (!SUPPORTED_MAJORS.has(String(major))) {
      return {
        ok: false,
        errors: [{ code: 'schema_unsupported', message: `MAJOR=${major} not in supported list` }],
      };
    }
  }
  if (typeof obj.content_type === 'string' && !SUPPORTED_CONTENT_TYPES.has(obj.content_type)) {
    return {
      ok: false,
      errors: [{ code: 'content_type_unsupported', message: `${obj.content_type}` }],
    };
  }

  const parsed = ManifestSchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push({ code: 'manifest_invalid', message: issue.message, path: issue.path.join('.') });
    }
    return { ok: false, errors };
  }
  const manifest = parsed.data;

  const checkPath = async (rel: string, label: string) => {
    if (!isSafeRelative(rel, contentDir)) {
      errors.push({ code: 'manifest_invalid', message: `path traversal: ${rel}`, path: label });
      return false;
    }
    if (!(await fileExists(resolve(contentDir, rel)))) {
      errors.push({ code: 'referenced_file_missing', message: `file missing: ${rel}`, path: label });
      return false;
    }
    return true;
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

  // Deep-validate quizzes
  for (const ch of manifest.chapters) {
    if (!ch.quiz_path) continue;
    const qPath = resolve(contentDir, ch.quiz_path);
    if (!(await fileExists(qPath))) continue;
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
        continue;
      }
      if (qParsed.data.questions.length === 0) {
        errors.push({ code: 'quiz_empty', message: `${ch.quiz_path}: 0 questions` });
      }
      if (qParsed.data.chapter_id !== ch.id) {
        errors.push({
          code: 'quiz_malformed',
          message: `${ch.quiz_path}: chapter_id ${qParsed.data.chapter_id} != ${ch.id}`,
        });
      }
    } catch (e) {
      errors.push({ code: 'quiz_malformed', message: `${ch.quiz_path}: ${e}` });
    }
  }

  // Deep-validate glossary
  const gPath = resolve(contentDir, manifest.glossary_path);
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

  // SVG safety: no <script>
  for (const f of manifest.figures) {
    const p = resolve(contentDir, f.path);
    if (await fileExists(p)) {
      const text = await readFile(p, 'utf8');
      if (/<script\b/i.test(text)) {
        errors.push({ code: 'svg_unsafe', message: `${f.path} contains <script>` });
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, manifest };
}
