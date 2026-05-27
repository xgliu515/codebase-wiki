import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import type { DB } from '../db/connection.js';
import { getSessionUser } from '../auth/session.js';

/**
 * Per-user dashboard endpoints. All require login.
 *
 * - GET /api/v1/me/recent-attempts?limit=N — newest-first quiz attempts
 *   across all subjects this user has touched.
 *
 * - GET /api/v1/me/addenda?limit=N — newest-first Q&A posts authored by
 *   this user.
 */
export function createMeRoutes(db: DB) {
  const r = new Hono();

  const requireUser = (sid: string | undefined) => sid ? getSessionUser(db, sid) : undefined;

  const parseLimit = (raw: string | undefined, def = 20, max = 100): number => {
    const n = parseInt(raw ?? '', 10);
    return Number.isFinite(n) ? Math.min(max, Math.max(1, n)) : def;
  };

  r.get('/recent-attempts', (c) => {
    const u = requireUser(getCookie(c, 'cwsess'));
    if (!u) return c.json({ error: 'unauthorized' }, 401);
    const limit = parseLimit(c.req.query('limit'));
    const rows = db
      .prepare(
        `SELECT id, subject_slug, version_label, chapter_id, attempted_at, score, question_count
         FROM attempts
         WHERE user_id = ?
         ORDER BY attempted_at DESC, id DESC
         LIMIT ?`,
      )
      .all(u.user_id, limit);
    return c.json({ attempts: rows });
  });

  r.get('/addenda', (c) => {
    const u = requireUser(getCookie(c, 'cwsess'));
    if (!u) return c.json({ error: 'unauthorized' }, 401);
    const limit = parseLimit(c.req.query('limit'));
    const rows = db
      .prepare(
        `SELECT id, subject_slug, version_label, chapter_id, question, answer, created_at
         FROM addenda
         WHERE author_user_id = ? AND hidden_at IS NULL
         ORDER BY created_at DESC, id DESC
         LIMIT ?`,
      )
      .all(u.user_id, limit);
    return c.json({ addenda: rows });
  });

  return r;
}
