import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import type { DB } from '../db/connection.js';
import { getSessionUser } from '../auth/session.js';
import { stageTarball } from './upload.js';
import { defaultLimits } from './safety.js';
import { validateStagedContent } from './validate.js';
import { installWiki } from './install.js';
import { deleteVersionIndex } from './fts.js';
import { rm } from 'node:fs/promises';

export type RegistryEnv = {
  DATA_DIR: string;
  ADMIN_GITHUB_LOGINS: string;
  MAX_TARBALL_BYTES?: string;
  MAX_FILES_PER_TARBALL?: string;
  MAX_FILE_SIZE_BYTES?: string;
};

export function createAdminRegistryRoutes(db: DB, env: RegistryEnv) {
  const r = new Hono();
  const adminLogins = new Set(env.ADMIN_GITHUB_LOGINS.split(',').map((s) => s.trim()).filter(Boolean));
  const limits = defaultLimits(env);

  const requireAdmin = (sid: string | undefined) => {
    if (!sid) return null;
    const u = getSessionUser(db, sid);
    if (!u || !adminLogins.has(u.github_login)) return null;
    return u;
  };

  r.post('/wikis', async (c) => {
    const sid = getCookie(c, 'cwsess');
    const u = requireAdmin(sid);
    if (!u) return c.json({ error: 'forbidden', message: 'admin only' }, 403);

    const ct = c.req.header('content-type') ?? '';
    let bytes: Uint8Array;
    if (ct.includes('multipart/form-data')) {
      const form = await c.req.parseBody();
      const file = form['file'];
      if (!file || typeof file === 'string') {
        return c.json({ error: 'invalid_archive', message: 'missing file part' }, 400);
      }
      bytes = new Uint8Array(await (file as File).arrayBuffer());
    } else if (ct.includes('application/gzip') || ct.includes('application/octet-stream')) {
      const buf = await c.req.arrayBuffer();
      bytes = new Uint8Array(buf);
    } else {
      return c.json({ error: 'invalid_archive', message: `unsupported content-type: ${ct}` }, 400);
    }

    const result = await stageTarball(bytes, env.DATA_DIR, limits);
    if (!result.ok) {
      const status = result.code === 'payload_too_large' ? 413 : 400;
      return c.json({ error: result.code, message: result.error }, status);
    }

    const validation = await validateStagedContent(result.contentDir);
    if (!validation.ok) {
      await rm(result.stageDir, { recursive: true, force: true });
      const errorCodes = new Set(validation.errors.map((e) => e.code));
      const status = errorCodes.has('schema_unsupported') || errorCodes.has('content_type_unsupported')
        ? 400
        : 400;
      return c.json({
        error: validation.errors[0]!.code,
        message: validation.errors[0]!.message,
        all_errors: validation.errors,
      }, status);
    }

    const force = c.req.query('force') === 'true';
    const install = await installWiki(
      db,
      result.contentDir,
      validation.manifest,
      u.user_id,
      env.DATA_DIR,
      { force },
    );

    // Clean staging regardless (contentDir was either renamed away or we should delete it)
    await rm(result.stageDir, { recursive: true, force: true });

    if (!install.ok) {
      const status = install.error === 'wiki_version_exists' ? 409 : 500;
      return c.json({ error: install.error, message: install.message }, status);
    }

    return c.json({
      ok: true,
      subject: install.subject,
      version: install.version,
    }, 201);
  });

  r.delete('/wikis/:subject/:version', (c) => {
    const sid = getCookie(c, 'cwsess');
    const u = requireAdmin(sid);
    if (!u) return c.json({ error: 'forbidden', message: 'admin only' }, 403);

    const subject = c.req.param('subject');
    const version = c.req.param('version');
    const row = db
      .prepare(`SELECT deleted_at FROM wiki_versions WHERE subject_slug=? AND version_label=?`)
      .get(subject, version) as { deleted_at: number | null } | undefined;
    if (!row) return c.json({ error: 'not_found', message: 'version not found' }, 404);
    if (row.deleted_at !== null) return c.json({ ok: true, already_deleted: true });

    db.prepare(
      `UPDATE wiki_versions SET deleted_at=? WHERE subject_slug=? AND version_label=?`,
    ).run(Date.now(), subject, version);
    deleteVersionIndex(db, subject, version);
    return c.json({ ok: true });
  });

  r.post('/wikis/:subject/:version/latest', (c) => {
    const sid = getCookie(c, 'cwsess');
    const u = requireAdmin(sid);
    if (!u) return c.json({ error: 'forbidden', message: 'admin only' }, 403);

    const subject = c.req.param('subject');
    const version = c.req.param('version');
    const row = db
      .prepare(
        `SELECT deleted_at FROM wiki_versions WHERE subject_slug=? AND version_label=?`,
      )
      .get(subject, version) as { deleted_at: number | null } | undefined;
    if (!row) return c.json({ error: 'not_found', message: 'version not found' }, 404);
    if (row.deleted_at !== null) {
      return c.json({ error: 'not_found', message: 'version is deleted' }, 404);
    }

    db.prepare(`UPDATE subjects SET latest_version=?, updated_at=? WHERE slug=?`).run(
      version,
      Date.now(),
      subject,
    );
    return c.json({ ok: true, subject, latest_version: version });
  });

  return r;
}
