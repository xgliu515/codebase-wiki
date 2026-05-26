import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { createApp } from '../src/app.js';
import { openDatabase, type DB } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrations.js';
import { createSession } from '../src/auth/session.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');

describe('progress', () => {
  let tmpDir: string;
  let db: DB;
  let app: ReturnType<typeof createApp>;
  let userSid: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(resolve(tmpdir(), 'cwprog-'));
    db = openDatabase(resolve(tmpDir, 'test.db'));
    runMigrations(db);
    const admin = db
      .prepare(
        `INSERT INTO users (github_id, github_login, created_at, last_seen_at)
         VALUES (?, ?, ?, ?) RETURNING id`,
      )
      .get(100, 'admin_user', Date.now(), Date.now()) as { id: number };
    const adminSid = createSession(db, admin.id);
    const user = db
      .prepare(
        `INSERT INTO users (github_id, github_login, created_at, last_seen_at)
         VALUES (?, ?, ?, ?) RETURNING id`,
      )
      .get(101, 'student', Date.now(), Date.now()) as { id: number };
    userSid = createSession(db, user.id);
    app = createApp({
      db,
      env: {
        GITHUB_CLIENT_ID: 'x', GITHUB_CLIENT_SECRET: 'x', OAUTH_REDIRECT_URI: 'http://x',
        ADMIN_GITHUB_LOGINS: 'admin_user', DATA_DIR: tmpDir, PUBLIC_READ: 'true',
      },
    });
    const tarPath = resolve(tmpDir, 's.tar.gz');
    execSync(
      `node ${repoRoot}/tools/wikipkg/dist/cli.js pack ${repoRoot}/examples/sample-wikipkg ${tarPath}`,
      { stdio: 'pipe' },
    );
    await app.request('/api/v1/admin/wikis', {
      method: 'POST',
      headers: { 'content-type': 'application/gzip', cookie: `cwsess=${adminSid}` },
      body: await readFile(tarPath),
    });
  });

  afterEach(async () => {
    db.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('PUT requires login', async () => {
    const res = await app.request('/api/v1/wikis/tiny-counter/v0.1.0/progress/intro', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'read' }),
    });
    expect(res.status).toBe(401);
  });

  it('PUT marks chapter read', async () => {
    const res = await app.request('/api/v1/wikis/tiny-counter/v0.1.0/progress/intro', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: `cwsess=${userSid}` },
      body: JSON.stringify({ status: 'read' }),
    });
    expect(res.status).toBe(200);
  });

  it('PUT idempotent (upsert)', async () => {
    await app.request('/api/v1/wikis/tiny-counter/v0.1.0/progress/intro', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: `cwsess=${userSid}` },
      body: JSON.stringify({ status: 'read' }),
    });
    const res = await app.request('/api/v1/wikis/tiny-counter/v0.1.0/progress/intro', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: `cwsess=${userSid}` },
      body: JSON.stringify({ status: 'unread' }),
    });
    expect(res.status).toBe(200);
    const row = db
      .prepare(`SELECT status FROM progress WHERE subject_slug=? AND chapter_id=?`)
      .get('tiny-counter', 'intro') as { status: string };
    expect(row.status).toBe('unread');
  });

  it('rejects invalid status', async () => {
    const res = await app.request('/api/v1/wikis/tiny-counter/v0.1.0/progress/intro', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: `cwsess=${userSid}` },
      body: JSON.stringify({ status: 'done' }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects unknown chapter', async () => {
    const res = await app.request('/api/v1/wikis/tiny-counter/v0.1.0/progress/nosuch', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: `cwsess=${userSid}` },
      body: JSON.stringify({ status: 'read' }),
    });
    expect(res.status).toBe(404);
  });

  it('GET returns all progress for subject', async () => {
    await app.request('/api/v1/wikis/tiny-counter/v0.1.0/progress/intro', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: `cwsess=${userSid}` },
      body: JSON.stringify({ status: 'read' }),
    });
    await app.request('/api/v1/wikis/tiny-counter/v0.1.0/progress/architecture', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: `cwsess=${userSid}` },
      body: JSON.stringify({ status: 'read' }),
    });
    const res = await app.request('/api/v1/wikis/tiny-counter/progress', {
      headers: { cookie: `cwsess=${userSid}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.progress).toHaveLength(2);
  });
});
