import { Hono } from 'hono';
import { setCookie, deleteCookie, getCookie } from 'hono/cookie';
import type { DB } from '../db/connection.js';
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchGitHubUser,
  generateState,
} from './oauth.js';
import { createSession, deleteSession, getSessionUser } from './session.js';

export type AuthEnv = {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  OAUTH_REDIRECT_URI: string;
  ADMIN_GITHUB_LOGINS: string;
  COOKIE_SECURE?: string;
};

export function createAuthRoutes(db: DB, env: AuthEnv) {
  const r = new Hono();
  const adminLogins = new Set(env.ADMIN_GITHUB_LOGINS.split(',').map((s) => s.trim()).filter(Boolean));
  const cookieSecure = env.COOKIE_SECURE === 'true';

  r.get('/me', (c) => {
    const sid = getCookie(c, 'cwsess');
    if (!sid) return c.json({ error: 'unauthorized', message: 'not logged in' }, 401);
    const u = getSessionUser(db, sid);
    if (!u) return c.json({ error: 'unauthorized', message: 'session invalid' }, 401);
    return c.json({
      id: u.user_id,
      login: u.github_login,
      display_name: u.display_name,
      avatar_url: u.avatar_url,
      is_admin: adminLogins.has(u.github_login),
    });
  });

  r.get('/github/start', (c) => {
    const state = generateState();
    setCookie(c, 'cwoauth', state, {
      httpOnly: true,
      sameSite: 'Lax',
      secure: cookieSecure,
      maxAge: 600,
    });
    const url = buildAuthorizeUrl(env.GITHUB_CLIENT_ID, env.OAUTH_REDIRECT_URI, state);
    return c.redirect(url, 302);
  });

  r.get('/github/callback', async (c) => {
    const code = c.req.query('code');
    const state = c.req.query('state');
    const cookieState = getCookie(c, 'cwoauth');
    if (!code || !state || state !== cookieState) {
      return c.json({ error: 'oauth_state_invalid', message: 'state mismatch' }, 400);
    }
    deleteCookie(c, 'cwoauth');

    let token: string;
    let ghUser: Awaited<ReturnType<typeof fetchGitHubUser>>;
    try {
      token = await exchangeCodeForToken(
        env.GITHUB_CLIENT_ID,
        env.GITHUB_CLIENT_SECRET,
        env.OAUTH_REDIRECT_URI,
        code,
      );
      ghUser = await fetchGitHubUser(token);
    } catch (e) {
      return c.json({ error: 'oauth_upstream_failed', message: String(e) }, 502);
    }

    const now = Date.now();
    const row = db
      .prepare(
        `INSERT INTO users (github_id, github_login, display_name, avatar_url, email, created_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(github_id) DO UPDATE SET
           github_login = excluded.github_login,
           display_name = excluded.display_name,
           avatar_url   = excluded.avatar_url,
           email        = excluded.email,
           last_seen_at = excluded.last_seen_at
         RETURNING id`,
      )
      .get(ghUser.id, ghUser.login, ghUser.name, ghUser.avatar_url, ghUser.email, now, now) as { id: number };

    const sid = createSession(db, row.id);
    setCookie(c, 'cwsess', sid, {
      httpOnly: true,
      sameSite: 'Lax',
      secure: cookieSecure,
      maxAge: 30 * 24 * 3600,
      path: '/',
    });
    return c.redirect('/', 302);
  });

  r.post('/logout', (c) => {
    const sid = getCookie(c, 'cwsess');
    if (sid) deleteSession(db, sid);
    deleteCookie(c, 'cwsess', { path: '/' });
    return c.json({ ok: true });
  });

  return r;
}
