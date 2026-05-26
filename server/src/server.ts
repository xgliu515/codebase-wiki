import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { openDatabase } from './db/connection.js';
import { runMigrations } from './db/migrations.js';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

function reqEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env: ${name}`);
    process.exit(1);
  }
  return v;
}

const DATA_DIR = process.env.DATA_DIR ?? './data';
mkdirSync(DATA_DIR, { recursive: true });

const db = openDatabase(resolve(DATA_DIR, 'wiki-server.db'));
runMigrations(db);

const DEV_ADMIN_LOGIN = process.env.DEV_ADMIN_LOGIN?.trim() || undefined;

const app = createApp({
  db,
  env: {
    GITHUB_CLIENT_ID: reqEnv('GITHUB_CLIENT_ID'),
    GITHUB_CLIENT_SECRET: reqEnv('GITHUB_CLIENT_SECRET'),
    OAUTH_REDIRECT_URI: reqEnv('OAUTH_REDIRECT_URI'),
    ADMIN_GITHUB_LOGINS: process.env.ADMIN_GITHUB_LOGINS ?? '',
    DATA_DIR,
    PUBLIC_READ: process.env.PUBLIC_READ ?? 'true',
    COOKIE_SECURE: process.env.COOKIE_SECURE ?? 'false',
    ...(DEV_ADMIN_LOGIN ? { DEV_ADMIN_LOGIN } : {}),
  },
});

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`codebase-wiki server listening on http://localhost:${info.port}`);
  if (DEV_ADMIN_LOGIN) {
    const adminSet = new Set(
      (process.env.ADMIN_GITHUB_LOGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    );
    const isAdmin = adminSet.has(DEV_ADMIN_LOGIN);
    console.log(`[dev] DEV_ADMIN_LOGIN=${DEV_ADMIN_LOGIN} — "Sign in with GitHub" bypasses OAuth and grants this login (is_admin=${isAdmin}).`);
    console.log(`[dev] WARNING: do NOT set DEV_ADMIN_LOGIN in production.`);
  }
});
