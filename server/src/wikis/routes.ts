import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { readFile } from 'node:fs/promises';
import { resolve as resolvePath } from 'node:path';
import {
  ManifestSchema,
  QuizSchema,
  redactQuiz,
  type Manifest,
} from '@codebase-wiki/shared';
import type { DB } from '../db/connection.js';
import { getSessionUser } from '../auth/session.js';

export type ReadEnv = {
  PUBLIC_READ: string;
};

export function createWikisRoutes(db: DB, env: ReadEnv) {
  const r = new Hono();
  const publicRead = env.PUBLIC_READ === 'true';

  const requireAuth = (sid: string | undefined) => {
    if (publicRead) return true;
    if (!sid) return false;
    return Boolean(getSessionUser(db, sid));
  };

  r.get('/', (c) => {
    if (!requireAuth(getCookie(c, 'cwsess'))) {
      return c.json({ error: 'unauthorized', message: 'login required' }, 401);
    }
    const rows = db
      .prepare(
        `SELECT slug, name, language, description, latest_version, content_type
         FROM subjects ORDER BY name`,
      )
      .all();
    return c.json({ subjects: rows });
  });

  r.get('/:subject', (c) => {
    if (!requireAuth(getCookie(c, 'cwsess'))) {
      return c.json({ error: 'unauthorized', message: 'login required' }, 401);
    }
    const subject = c.req.param('subject');
    const subj = db.prepare(`SELECT * FROM subjects WHERE slug=?`).get(subject);
    if (!subj) return c.json({ error: 'subject_not_found', message: subject }, 404);
    const versions = db
      .prepare(
        `SELECT version_label, schema_version, uploaded_at, deleted_at
         FROM wiki_versions
         WHERE subject_slug=? AND deleted_at IS NULL
         ORDER BY uploaded_at DESC`,
      )
      .all(subject);
    return c.json({ subject: subj, versions });
  });

  r.get('/:subject/:version/manifest', (c) => {
    if (!requireAuth(getCookie(c, 'cwsess'))) {
      return c.json({ error: 'unauthorized', message: 'login required' }, 401);
    }
    const subject = c.req.param('subject');
    const version = c.req.param('version');
    const row = db
      .prepare(
        `SELECT manifest_json FROM wiki_versions
         WHERE subject_slug=? AND version_label=? AND deleted_at IS NULL`,
      )
      .get(subject, version) as { manifest_json: string } | undefined;
    if (!row) return c.json({ error: 'version_not_found', message: `${subject}/${version}` }, 404);
    return c.json(JSON.parse(row.manifest_json));
  });

  const loadActiveVersion = (subject: string, version: string): { dataDir: string; manifest: Manifest } | null => {
    const row = db
      .prepare(
        `SELECT data_dir, manifest_json FROM wiki_versions
         WHERE subject_slug=? AND version_label=? AND deleted_at IS NULL`,
      )
      .get(subject, version) as { data_dir: string; manifest_json: string } | undefined;
    if (!row) return null;
    try {
      const manifest = ManifestSchema.parse(JSON.parse(row.manifest_json));
      return { dataDir: row.data_dir, manifest };
    } catch (e) {
      console.error('[wikis] corrupt manifest_json for', subject, version, e);
      return null;  // Treated as version_not_found by callers
    }
  };

  const cacheHeaders = { 'Cache-Control': 'public, max-age=31536000, immutable' };

  r.get('/:subject/:version/chapters/:chapterId', async (c) => {
    if (!requireAuth(getCookie(c, 'cwsess'))) {
      return c.json({ error: 'unauthorized', message: 'login required' }, 401);
    }
    const subject = c.req.param('subject');
    const version = c.req.param('version');
    const chapterId = c.req.param('chapterId');
    const v = loadActiveVersion(subject, version);
    if (!v) return c.json({ error: 'version_not_found' }, 404);
    const ch = v.manifest.chapters.find((x) => x.id === chapterId);
    if (!ch) return c.json({ error: 'chapter_not_found' }, 404);
    try {
      const md = await readFile(resolvePath(v.dataDir, ch.path), 'utf8');
      return c.json({ id: ch.id, title: ch.title, order: ch.order, markdown: md }, 200, cacheHeaders);
    } catch (e) {
      return c.json({ error: 'storage_inconsistent', message: String(e) }, 500);
    }
  });

  r.get('/:subject/:version/tours/:tourId', (c) => {
    if (!requireAuth(getCookie(c, 'cwsess'))) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    const v = loadActiveVersion(c.req.param('subject'), c.req.param('version'));
    if (!v) return c.json({ error: 'version_not_found' }, 404);
    const t = v.manifest.tours.find((x) => x.id === c.req.param('tourId'));
    if (!t) return c.json({ error: 'tour_not_found' }, 404);
    return c.json({ id: t.id, title: t.title, steps: t.steps }, 200, cacheHeaders);
  });

  r.get('/:subject/:version/tours/:tourId/steps/:order', async (c) => {
    if (!requireAuth(getCookie(c, 'cwsess'))) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    const v = loadActiveVersion(c.req.param('subject'), c.req.param('version'));
    if (!v) return c.json({ error: 'version_not_found' }, 404);
    const t = v.manifest.tours.find((x) => x.id === c.req.param('tourId'));
    if (!t) return c.json({ error: 'tour_not_found' }, 404);
    const order = Number(c.req.param('order'));
    const step = t.steps.find((s) => s.order === order);
    if (!step) return c.json({ error: 'step_not_found' }, 404);
    try {
      const md = await readFile(resolvePath(v.dataDir, step.path), 'utf8');
      return c.json({ order: step.order, title: step.title, markdown: md }, 200, cacheHeaders);
    } catch (e) {
      return c.json({ error: 'storage_inconsistent', message: String(e) }, 500);
    }
  });

  r.get('/:subject/:version/glossary', async (c) => {
    if (!requireAuth(getCookie(c, 'cwsess'))) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    const v = loadActiveVersion(c.req.param('subject'), c.req.param('version'));
    if (!v) return c.json({ error: 'version_not_found' }, 404);
    try {
      const raw = await readFile(resolvePath(v.dataDir, v.manifest.glossary_path), 'utf8');
      return c.json(JSON.parse(raw), 200, cacheHeaders);
    } catch (e) {
      return c.json({ error: 'storage_inconsistent', message: String(e) }, 500);
    }
  });

  r.get('/:subject/:version/figures/:figureId', async (c) => {
    if (!requireAuth(getCookie(c, 'cwsess'))) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    const v = loadActiveVersion(c.req.param('subject'), c.req.param('version'));
    if (!v) return c.json({ error: 'version_not_found' }, 404);
    const fig = v.manifest.figures.find((f) => f.id === c.req.param('figureId'));
    if (!fig) return c.json({ error: 'figure_not_found' }, 404);
    try {
      const svg = await readFile(resolvePath(v.dataDir, fig.path));
      return new Response(svg, {
        status: 200,
        headers: { 'Content-Type': 'image/svg+xml', ...cacheHeaders },
      });
    } catch (e) {
      return c.json({ error: 'storage_inconsistent', message: String(e) }, 500);
    }
  });

  r.get('/:subject/:version/quizzes/:chapterId', async (c) => {
    if (!requireAuth(getCookie(c, 'cwsess'))) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    const v = loadActiveVersion(c.req.param('subject'), c.req.param('version'));
    if (!v) return c.json({ error: 'version_not_found' }, 404);
    const ch = v.manifest.chapters.find((x) => x.id === c.req.param('chapterId'));
    if (!ch) return c.json({ error: 'chapter_not_found' }, 404);
    if (!ch.quiz_path) return c.json({ error: 'quiz_not_found' }, 404);
    try {
      const raw = await readFile(resolvePath(v.dataDir, ch.quiz_path), 'utf8');
      const quiz = QuizSchema.parse(JSON.parse(raw));
      return c.json(redactQuiz(quiz), 200, cacheHeaders);
    } catch (e) {
      return c.json({ error: 'storage_inconsistent', message: String(e) }, 500);
    }
  });

  r.get('/:subject/:version/search', (c) => {
    if (!requireAuth(getCookie(c, 'cwsess'))) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    const q = c.req.query('q');
    if (!q || q.length < 1 || q.length > 200) {
      return c.json({ error: 'invalid_query', message: 'q must be 1-200 chars' }, 400);
    }
    const subject = c.req.param('subject');
    const version = c.req.param('version');
    if (!loadActiveVersion(subject, version)) {
      return c.json({ error: 'version_not_found' }, 404);
    }
    // Escape FTS5 syntax — wrap each token in quotes to avoid operator interpretation
    const ftsQ = q
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => '"' + t.replace(/"/g, '""') + '"')
      .join(' ');
    const rows = db
      .prepare(
        `SELECT doc_type, doc_id,
                snippet(content_fts, 5, '<mark>', '</mark>', '…', 12) AS snippet
         FROM content_fts
         WHERE content_fts MATCH ?
           AND subject_slug = ?
           AND version_label = ?
         LIMIT 30`,
      )
      .all(ftsQ, subject, version);
    return c.json({ results: rows });
  });

  return r;
}
