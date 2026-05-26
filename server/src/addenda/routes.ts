import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import type { DB } from '../db/connection.js';
import { getSessionUser } from '../auth/session.js';
import { ManifestSchema } from '@codebase-wiki/shared';
import { RateLimiter } from '../util/rate-limit.js';

export function createAddendaRoutes(
  db: DB,
  env: { PUBLIC_READ: string; MAX_ADDENDA_PER_HOUR_PER_USER?: string },
) {
  const r = new Hono();
  const rl = new RateLimiter();
  const publicRead = env.PUBLIC_READ === 'true';
  const addLimit = Number(env.MAX_ADDENDA_PER_HOUR_PER_USER ?? 30);

  const requireAuth = (sid: string | undefined) => {
    if (publicRead) return true;
    if (!sid) return false;
    return Boolean(getSessionUser(db, sid));
  };

  const requireUser = (sid: string | undefined) => sid ? getSessionUser(db, sid) : undefined;

  r.get('/:subject/:version/chapters/:chapterId/addenda', (c) => {
    if (!requireAuth(getCookie(c, 'cwsess'))) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    const subject = c.req.param('subject');
    const version = c.req.param('version');
    const chapterId = c.req.param('chapterId');
    const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') ?? 20)));
    const before = c.req.query('before');
    const params: (string | number)[] = [subject, version, chapterId];
    let sql = `SELECT a.id, a.question, a.answer, a.created_at, u.github_login AS author_login
               FROM addenda a JOIN users u ON u.id = a.author_user_id
               WHERE a.subject_slug=? AND a.version_label=? AND a.chapter_id=?
                 AND a.hidden_at IS NULL`;
    if (before) {
      sql += ` AND a.created_at < ?`;
      params.push(Number(before));
    }
    sql += ` ORDER BY a.created_at DESC LIMIT ?`;
    params.push(limit);
    const rows = db.prepare(sql).all(...params);
    return c.json({ addenda: rows });
  });

  r.post('/:subject/:version/chapters/:chapterId/addenda', async (c) => {
    const sid = getCookie(c, 'cwsess');
    const u = requireUser(sid);
    if (!u) return c.json({ error: 'unauthorized', message: 'login required' }, 401);

    const subject = c.req.param('subject');
    const version = c.req.param('version');
    const chapterId = c.req.param('chapterId');

    const rlKey = `${u.user_id}:addenda:${subject}/${chapterId}`;
    if (!rl.allow(rlKey, 60 * 60 * 1000, addLimit)) {
      c.header('Retry-After', '3600');
      return c.json({ error: 'rate_limited' }, 429);
    }

    let body: { question?: string; answer?: string | null };
    try { body = await c.req.json(); } catch { return c.json({ error: 'invalid_body' }, 400); }
    const q = (body.question ?? '').trim();
    if (!q || q.length > 2000) {
      return c.json({ error: 'addendum_invalid', message: 'question must be 1..2000 chars' }, 400);
    }
    const a = typeof body.answer === 'string' ? body.answer.trim() || null : null;
    if (a !== null && a.length > 4000) {
      return c.json({ error: 'addendum_invalid', message: 'answer must be ≤4000 chars' }, 400);
    }

    // Verify version exists and chapter exists
    const row = db
      .prepare(
        `SELECT manifest_json FROM wiki_versions
         WHERE subject_slug=? AND version_label=? AND deleted_at IS NULL`,
      )
      .get(subject, version) as { manifest_json: string } | undefined;
    if (!row) return c.json({ error: 'version_not_found' }, 404);
    const manifest = ManifestSchema.parse(JSON.parse(row.manifest_json));
    if (!manifest.chapters.find((ch) => ch.id === chapterId)) {
      return c.json({ error: 'chapter_not_found' }, 404);
    }

    const insertAddendum = db.prepare(
      `INSERT INTO addenda
       (subject_slug, version_label, chapter_id, author_user_id, question, answer, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    );
    const insertFts = db.prepare(
      `INSERT INTO content_fts (subject_slug, version_label, doc_type, doc_id, title, body)
       VALUES (?, ?, 'addendum', ?, ?, ?)`,
    );
    const now = Date.now();
    const txn = db.transaction(() => {
      const ins = insertAddendum.get(subject, version, chapterId, u.user_id, q, a, now) as { id: number };
      insertFts.run(subject, version, `addendum/${ins.id}`, q, a ?? '');
      return ins.id;
    });
    const newId = txn();

    return c.json({ id: newId, ok: true }, 201);
  });

  return r;
}
