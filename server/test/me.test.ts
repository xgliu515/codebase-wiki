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

describe('GET /api/v1/me/*', () => {
  let tmpDir: string;
  let db: DB;
  let app: ReturnType<typeof createApp>;
  let userSid: string;
  let userId: number;

  beforeEach(async () => {
    tmpDir = await mkdtemp(resolve(tmpdir(), 'cwme-'));
    db = openDatabase(resolve(tmpDir, 'test.db'));
    runMigrations(db);
    const admin = db
      .prepare(
        `INSERT INTO users (github_id, github_login, created_at, last_seen_at)
         VALUES (?, ?, ?, ?) RETURNING id`,
      )
      .get(100, 'admin_user', Date.now(), Date.now()) as { id: number };
    const adminSid = createSession(db, admin.id);
    const u = db
      .prepare(
        `INSERT INTO users (github_id, github_login, created_at, last_seen_at)
         VALUES (?, ?, ?, ?) RETURNING id`,
      )
      .get(200, 'student', Date.now(), Date.now()) as { id: number };
    userId = u.id;
    userSid = createSession(db, userId);
    app = createApp({
      db,
      env: {
        GITHUB_CLIENT_ID: 'x',
        GITHUB_CLIENT_SECRET: 'x',
        OAUTH_REDIRECT_URI: 'http://x',
        ADMIN_GITHUB_LOGINS: 'admin_user',
        DATA_DIR: tmpDir,
        PUBLIC_READ: 'true',
      },
    });
    // Seed sample wiki + a few attempts + addenda for the student user
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
    // 2 attempts
    await app.request('/api/v1/wikis/tiny-counter/v0.1.0/quizzes/intro/attempts', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `cwsess=${userSid}` },
      body: JSON.stringify({ answers: { 'intro-q1': ['b'] } }),
    });
    await app.request('/api/v1/wikis/tiny-counter/v0.1.0/quizzes/architecture/attempts', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `cwsess=${userSid}` },
      body: JSON.stringify({ answers: { 'architecture-q1': ['c'], 'architecture-q2': ['a', 'b'] } }),
    });
    // 1 addendum
    await app.request('/api/v1/wikis/tiny-counter/v0.1.0/chapters/intro/addenda', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `cwsess=${userSid}` },
      body: JSON.stringify({ question: 'why memory only?' }),
    });
  });

  afterEach(async () => {
    db.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe('GET /me/recent-attempts', () => {
    it('requires login', async () => {
      const res = await app.request('/api/v1/me/recent-attempts');
      expect(res.status).toBe(401);
    });

    it('returns newest-first attempts for the logged-in user', async () => {
      const res = await app.request('/api/v1/me/recent-attempts', {
        headers: { cookie: `cwsess=${userSid}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.attempts).toHaveLength(2);
      expect(body.attempts[0].chapter_id).toBe('architecture');  // newest first
      expect(body.attempts[1].chapter_id).toBe('intro');
      expect(body.attempts[0].score).toBe(1);
    });

    it('honors ?limit=', async () => {
      const res = await app.request('/api/v1/me/recent-attempts?limit=1', {
        headers: { cookie: `cwsess=${userSid}` },
      });
      const body = await res.json();
      expect(body.attempts).toHaveLength(1);
    });
  });

  describe('GET /me/addenda', () => {
    it('requires login', async () => {
      const res = await app.request('/api/v1/me/addenda');
      expect(res.status).toBe(401);
    });

    it('returns user-authored addenda newest-first', async () => {
      const res = await app.request('/api/v1/me/addenda', {
        headers: { cookie: `cwsess=${userSid}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.addenda).toHaveLength(1);
      expect(body.addenda[0].question).toContain('memory only');
      expect(body.addenda[0].chapter_id).toBe('intro');
    });

    it('excludes hidden addenda', async () => {
      db.prepare(`UPDATE addenda SET hidden_at = ? WHERE author_user_id = ?`).run(Date.now(), userId);
      const res = await app.request('/api/v1/me/addenda', {
        headers: { cookie: `cwsess=${userSid}` },
      });
      const body = await res.json();
      expect(body.addenda).toHaveLength(0);
    });
  });
});
