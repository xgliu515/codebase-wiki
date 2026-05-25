import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../src/app.js';
import { openDatabase, type DB } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrations.js';
import { createSession, getSessionUser } from '../src/auth/session.js';

describe('auth', () => {
  let tmpDir: string;
  let db: DB;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    tmpDir = await mkdtemp(resolve(tmpdir(), 'cwauth-'));
    db = openDatabase(resolve(tmpDir, 'test.db'));
    runMigrations(db);
    app = createApp({
      db,
      env: {
        GITHUB_CLIENT_ID: 'test_client_id',
        GITHUB_CLIENT_SECRET: 'test_client_secret',
        OAUTH_REDIRECT_URI: 'http://localhost:3000/api/v1/auth/github/callback',
        ADMIN_GITHUB_LOGINS: 'admin_user',
        DATA_DIR: tmpDir,
        PUBLIC_READ: 'true',
      },
    });
  });

  afterEach(async () => {
    db.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe('GET /api/v1/auth/me', () => {
    it('returns 401 when no session', async () => {
      const res = await app.request('/api/v1/auth/me');
      expect(res.status).toBe(401);
    });

    it('returns user when session valid', async () => {
      const userId = db
        .prepare(
          `INSERT INTO users (github_id, github_login, display_name, avatar_url, email, created_at, last_seen_at)
           VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        )
        .get(1, 'tester', 'Tester', 'http://x/avatar.png', 't@x', Date.now(), Date.now()) as { id: number };
      const sessionId = createSession(db, userId.id);

      const res = await app.request('/api/v1/auth/me', {
        headers: { cookie: `cwsess=${sessionId}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.login).toBe('tester');
      expect(body.is_admin).toBe(false);
    });

    it('returns is_admin=true for ADMIN_GITHUB_LOGINS users', async () => {
      const userId = db
        .prepare(
          `INSERT INTO users (github_id, github_login, display_name, avatar_url, email, created_at, last_seen_at)
           VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        )
        .get(2, 'admin_user', 'Admin', null, null, Date.now(), Date.now()) as { id: number };
      const sessionId = createSession(db, userId.id);

      const res = await app.request('/api/v1/auth/me', {
        headers: { cookie: `cwsess=${sessionId}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.is_admin).toBe(true);
    });
  });

  describe('GET /api/v1/auth/github/start', () => {
    it('redirects to GitHub with state in cookie', async () => {
      const res = await app.request('/api/v1/auth/github/start');
      expect(res.status).toBe(302);
      const loc = res.headers.get('location') ?? '';
      expect(loc).toMatch(/^https:\/\/github\.com\/login\/oauth\/authorize\?/);
      expect(loc).toContain('client_id=test_client_id');
      expect(loc).toContain('state=');
      const setCookie = res.headers.get('set-cookie') ?? '';
      expect(setCookie).toMatch(/cwoauth=/);
    });
  });

  describe('GET /api/v1/auth/github/callback', () => {
    it('rejects state mismatch with 400 oauth_state_invalid', async () => {
      const res = await app.request(
        '/api/v1/auth/github/callback?code=fakecode&state=wrongstate',
        { headers: { cookie: 'cwoauth=correctstate' } },
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('oauth_state_invalid');
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('clears session and cookie', async () => {
      const userId = db
        .prepare(
          `INSERT INTO users (github_id, github_login, created_at, last_seen_at)
           VALUES (?, ?, ?, ?) RETURNING id`,
        )
        .get(3, 'logout_user', Date.now(), Date.now()) as { id: number };
      const sessionId = createSession(db, userId.id);

      const res = await app.request('/api/v1/auth/logout', {
        method: 'POST',
        headers: { cookie: `cwsess=${sessionId}` },
      });
      expect(res.status).toBe(200);
      const row = db.prepare('SELECT id FROM sessions WHERE id=?').get(sessionId);
      expect(row).toBeUndefined();
    });
  });

  describe('createSession + getSessionUser', () => {
    it('round-trips a session', () => {
      const userId = db
        .prepare(
          `INSERT INTO users (github_id, github_login, created_at, last_seen_at)
           VALUES (?, ?, ?, ?) RETURNING id`,
        )
        .get(4, 'roundtrip', Date.now(), Date.now()) as { id: number };
      const sid = createSession(db, userId.id);
      const u = getSessionUser(db, sid);
      expect(u?.github_login).toBe('roundtrip');
    });

    it('returns undefined for expired session', () => {
      const userId = db
        .prepare(
          `INSERT INTO users (github_id, github_login, created_at, last_seen_at)
           VALUES (?, ?, ?, ?) RETURNING id`,
        )
        .get(5, 'expired', Date.now(), Date.now()) as { id: number };
      const sid = createSession(db, userId.id, { ttlMs: -1000 });
      const u = getSessionUser(db, sid);
      expect(u).toBeUndefined();
    });
  });

  describe('admin role edge cases', () => {
    it('treats empty ADMIN_GITHUB_LOGINS as no admins', async () => {
      // Recreate app with empty admin list
      const appEmpty = createApp({
        db,
        env: {
          GITHUB_CLIENT_ID: 'x',
          GITHUB_CLIENT_SECRET: 'x',
          OAUTH_REDIRECT_URI: 'http://x',
          ADMIN_GITHUB_LOGINS: '',
          DATA_DIR: tmpDir,
          PUBLIC_READ: 'true',
        },
      });
      const userId = db
        .prepare(
          `INSERT INTO users (github_id, github_login, created_at, last_seen_at)
           VALUES (?, ?, ?, ?) RETURNING id`,
        )
        .get(99, 'anyone', Date.now(), Date.now()) as { id: number };
      const sid = createSession(db, userId.id);
      const res = await appEmpty.request('/api/v1/auth/me', { headers: { cookie: `cwsess=${sid}` } });
      const body = await res.json();
      expect(body.is_admin).toBe(false);
    });

    it('treats multi-value ADMIN_GITHUB_LOGINS correctly', async () => {
      const appMulti = createApp({
        db,
        env: {
          GITHUB_CLIENT_ID: 'x',
          GITHUB_CLIENT_SECRET: 'x',
          OAUTH_REDIRECT_URI: 'http://x',
          ADMIN_GITHUB_LOGINS: 'alice, bob , carol',
          DATA_DIR: tmpDir,
          PUBLIC_READ: 'true',
        },
      });
      const bobId = db
        .prepare(
          `INSERT INTO users (github_id, github_login, created_at, last_seen_at)
           VALUES (?, ?, ?, ?) RETURNING id`,
        )
        .get(98, 'bob', Date.now(), Date.now()) as { id: number };
      const sid = createSession(db, bobId.id);
      const res = await appMulti.request('/api/v1/auth/me', { headers: { cookie: `cwsess=${sid}` } });
      const body = await res.json();
      expect(body.is_admin).toBe(true);
    });
  });
});
