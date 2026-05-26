import { readFileSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import type { DB } from './db/connection.js';
import { createAuthRoutes, type AuthEnv } from './auth/routes.js';
import { createAdminRegistryRoutes } from './registry/routes.js';
import { createWikisRoutes } from './wikis/routes.js';
import { createQuizRoutes } from './quiz/routes.js';
import { getSessionUser } from './auth/session.js';

const __here = dirname(fileURLToPath(import.meta.url));
const SHELL_HTML = readFileSync(resolvePath(__here, 'static/shell.html'), 'utf8');

export type ServerEnv = AuthEnv & {
  DATA_DIR: string;
  PUBLIC_READ: string;
};

export type AppOptions = {
  db: DB;
  env: ServerEnv;
};

export function createApp(opts?: AppOptions) {
  const app = new Hono();

  app.get('/healthz', (c) =>
    c.json({
      ok: true,
      server_version: '0.0.0',
      supported_schema_majors: ['1'],
    }),
  );

  if (opts) {
    app.route('/api/v1/auth', createAuthRoutes(opts.db, opts.env));
    app.route('/api/v1/admin', createAdminRegistryRoutes(opts.db, opts.env));
    app.route('/api/v1/wikis', createWikisRoutes(opts.db, opts.env));
    app.route('/api/v1/wikis', createQuizRoutes(opts.db, opts.env));

    const { db, env } = opts;
    const adminLogins = new Set(env.ADMIN_GITHUB_LOGINS.split(',').map((s) => s.trim()).filter(Boolean));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const renderShell = (c: any) => {
      const sid = getCookie(c, 'cwsess');
      const u = sid ? getSessionUser(db, sid) : undefined;
      const initial = {
        user: u
          ? {
              id: u.user_id,
              login: u.github_login,
              display_name: u.display_name,
              avatar_url: u.avatar_url,
              is_admin: adminLogins.has(u.github_login),
            }
          : null,
        build: { version: '0.0.0' },
      };
      // Escape `</` to prevent script-tag breakout, `<!--` for HTML comment injection,
      // and ` / ` for legacy JS engine issues. Standard inline-JSON pattern.
      const safeJson = JSON.stringify(initial)
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
      const html = SHELL_HTML.replace('__INITIAL_JSON__', safeJson);
      return c.html(html);
    };

    app.get('/', renderShell);
    app.get('/wiki/*', renderShell);
    app.get('/admin', renderShell);
    app.get('/admin/*', renderShell);
    app.get('/me', renderShell);
  }

  return app;
}

export type App = ReturnType<typeof createApp>;
