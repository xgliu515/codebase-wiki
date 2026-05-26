import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import type { DB } from '../db/connection.js';
import { getSessionUser } from '../auth/session.js';
import { ManifestSchema } from '@codebase-wiki/shared';

export function createProgressRoutes(db: DB) {
  const r = new Hono();

  const requireUser = (sid: string | undefined) => sid ? getSessionUser(db, sid) : undefined;

  r.put('/:subject/:version/progress/:chapterId', async (c) => {
    const sid = getCookie(c, 'cwsess');
    const u = requireUser(sid);
    if (!u) return c.json({ error: 'unauthorized' }, 401);

    const subject = c.req.param('subject');
    const version = c.req.param('version');
    const chapterId = c.req.param('chapterId');

    let body: { status?: string };
    try { body = await c.req.json(); } catch { return c.json({ error: 'invalid_body' }, 400); }
    if (body.status !== 'read' && body.status !== 'unread') {
      return c.json({ error: 'progress_invalid', message: 'status must be read|unread' }, 400);
    }

    // Verify version exists + chapter exists in manifest
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

    db.prepare(
      `INSERT INTO progress (user_id, subject_slug, chapter_id, status, last_version_label, marked_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, subject_slug, chapter_id) DO UPDATE SET
         status = excluded.status,
         last_version_label = excluded.last_version_label,
         marked_at = excluded.marked_at`,
    ).run(u.user_id, subject, chapterId, body.status, version, Date.now());

    return c.json({ ok: true });
  });

  r.get('/:subject/progress', (c) => {
    const sid = getCookie(c, 'cwsess');
    const u = requireUser(sid);
    if (!u) return c.json({ error: 'unauthorized' }, 401);

    const subject = c.req.param('subject');
    const rows = db
      .prepare(
        `SELECT chapter_id, status, last_version_label, marked_at
         FROM progress WHERE user_id=? AND subject_slug=?
         ORDER BY chapter_id`,
      )
      .all(u.user_id, subject);
    return c.json({ progress: rows });
  });

  return r;
}
