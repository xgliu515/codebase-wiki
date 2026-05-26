import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
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

  return r;
}
