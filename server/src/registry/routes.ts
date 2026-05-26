import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import type { DB } from '../db/connection.js';
import { getSessionUser } from '../auth/session.js';
import { stageTarball } from './upload.js';
import { defaultLimits } from './safety.js';
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

    // Task 7-8 will continue from here (validate + install). For now: clean staging and return.
    await rm(result.stageDir, { recursive: true, force: true });
    return c.json({
      ok: true,
      staged_files: result.fileCount,
      note: 'staged successfully; validation + install in next tasks',
    });
  });

  return r;
}
