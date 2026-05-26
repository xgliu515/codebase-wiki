import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../src/app.js';
import { openDatabase, type DB } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrations.js';
import { createSession } from '../src/auth/session.js';

describe('HTML shell', () => {
  let tmpDir: string;
  let db: DB;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    tmpDir = await mkdtemp(resolve(tmpdir(), 'cwshell-'));
    db = openDatabase(resolve(tmpDir, 'test.db'));
    runMigrations(db);
    app = createApp({
      db,
      env: {
        GITHUB_CLIENT_ID: 'x', GITHUB_CLIENT_SECRET: 'x', OAUTH_REDIRECT_URI: 'http://x',
        ADMIN_GITHUB_LOGINS: '', DATA_DIR: tmpDir, PUBLIC_READ: 'true',
      },
    });
  });

  afterEach(async () => {
    db.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('serves shell at /', async () => {
    const res = await app.request('/');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')?.toLowerCase()).toContain('html');
    const html = await res.text();
    expect(html).toContain('<div id="app">');
    expect(html).toContain('window.__INITIAL__');
    expect(html).toContain('"user":null');
  });

  it('serves shell at /wiki/anything/deep/path', async () => {
    const res = await app.request('/wiki/vllm/v0.22.0/chapter/architecture-overview');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<div id="app">');
  });

  it('injects user into __INITIAL__ when logged in', async () => {
    const u = db
      .prepare(
        `INSERT INTO users (github_id, github_login, display_name, created_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?) RETURNING id`,
      )
      .get(1, 'tester', 'Tester', Date.now(), Date.now()) as { id: number };
    const sid = createSession(db, u.id);
    const res = await app.request('/', { headers: { cookie: `cwsess=${sid}` } });
    const html = await res.text();
    expect(html).toContain('"login":"tester"');
    expect(html).toContain('"is_admin":false');
  });

  it('escapes </script> in injected user data (XSS guard)', async () => {
    const u = db
      .prepare(
        `INSERT INTO users (github_id, github_login, display_name, created_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?) RETURNING id`,
      )
      .get(99, 'attacker', '</script><script>alert(1)</script>', Date.now(), Date.now()) as { id: number };
    const sid = createSession(db, u.id);
    const res = await app.request('/', { headers: { cookie: `cwsess=${sid}` } });
    const html = await res.text();
    // The raw </script> must NOT appear in the injected JSON
    expect(html).not.toContain('</script><script>alert');
    // Must be escaped as <
    expect(html).toContain('\\u003c/script\\u003e');
  });
});
