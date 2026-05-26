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

describe('admin registry endpoints', () => {
  let tmpDir: string;
  let db: DB;
  let app: ReturnType<typeof createApp>;
  let adminSid: string;
  let sampleTarball: Buffer;

  beforeEach(async () => {
    tmpDir = await mkdtemp(resolve(tmpdir(), 'cwadm-'));
    db = openDatabase(resolve(tmpDir, 'test.db'));
    runMigrations(db);
    const admin = db
      .prepare(
        `INSERT INTO users (github_id, github_login, created_at, last_seen_at)
         VALUES (?, ?, ?, ?) RETURNING id`,
      )
      .get(100, 'admin_user', Date.now(), Date.now()) as { id: number };
    adminSid = createSession(db, admin.id);
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
    const tarPath = resolve(tmpDir, 's.tar.gz');
    execSync(
      `node ${repoRoot}/tools/wikipkg/dist/cli.js pack ${repoRoot}/examples/sample-wikipkg ${tarPath}`,
      { stdio: 'pipe' },
    );
    sampleTarball = await readFile(tarPath);
    // Upload it
    await app.request('/api/v1/admin/wikis', {
      method: 'POST',
      headers: { 'content-type': 'application/gzip', cookie: `cwsess=${adminSid}` },
      body: sampleTarball,
    });
  });

  afterEach(async () => {
    db.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe('GET /api/v1/admin/wikis (admin console list)', () => {
    it('requires admin role', async () => {
      const userRow = db
        .prepare(
          `INSERT INTO users (github_id, github_login, created_at, last_seen_at)
           VALUES (?, ?, ?, ?) RETURNING id`,
        )
        .get(101, 'regular', Date.now(), Date.now()) as { id: number };
      const userSid = createSession(db, userRow.id);
      const res = await app.request('/api/v1/admin/wikis', {
        headers: { cookie: `cwsess=${userSid}` },
      });
      expect(res.status).toBe(403);
    });

    it('lists subjects with all versions including soft-deleted', async () => {
      // Soft delete the uploaded version
      await app.request('/api/v1/admin/wikis/tiny-counter/v0.1.0', {
        method: 'DELETE',
        headers: { cookie: `cwsess=${adminSid}` },
      });
      const res = await app.request('/api/v1/admin/wikis', {
        headers: { cookie: `cwsess=${adminSid}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.subjects).toHaveLength(1);
      const subj = body.subjects[0];
      expect(subj.slug).toBe('tiny-counter');
      expect(subj.versions).toHaveLength(1);
      expect(subj.versions[0].version_label).toBe('v0.1.0');
      expect(subj.versions[0].deleted_at).not.toBeNull();
      expect(subj.latest_version).toBe('v0.1.0');
    });
  });

  describe('DELETE /api/v1/admin/wikis/:subject/:version', () => {
    it('soft-deletes a version', async () => {
      const res = await app.request('/api/v1/admin/wikis/tiny-counter/v0.1.0', {
        method: 'DELETE',
        headers: { cookie: `cwsess=${adminSid}` },
      });
      expect(res.status).toBe(200);
      const row = db
        .prepare(`SELECT deleted_at FROM wiki_versions WHERE subject_slug=? AND version_label=?`)
        .get('tiny-counter', 'v0.1.0') as { deleted_at: number | null };
      expect(row.deleted_at).not.toBeNull();
    });

    it('returns 404 for unknown version', async () => {
      const res = await app.request('/api/v1/admin/wikis/tiny-counter/v9.9.9', {
        method: 'DELETE',
        headers: { cookie: `cwsess=${adminSid}` },
      });
      expect(res.status).toBe(404);
    });

    it('idempotent on already-deleted', async () => {
      await app.request('/api/v1/admin/wikis/tiny-counter/v0.1.0', {
        method: 'DELETE',
        headers: { cookie: `cwsess=${adminSid}` },
      });
      const res = await app.request('/api/v1/admin/wikis/tiny-counter/v0.1.0', {
        method: 'DELETE',
        headers: { cookie: `cwsess=${adminSid}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.already_deleted).toBe(true);
    });
  });

  describe('POST /api/v1/admin/wikis/:subject/:version/latest', () => {
    it('updates latest_version', async () => {
      // flip back to itself proves the endpoint works
      const res = await app.request('/api/v1/admin/wikis/tiny-counter/v0.1.0/latest', {
        method: 'POST',
        headers: { cookie: `cwsess=${adminSid}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.latest_version).toBe('v0.1.0');
    });

    it('refuses to flip latest to a soft-deleted version', async () => {
      await app.request('/api/v1/admin/wikis/tiny-counter/v0.1.0', {
        method: 'DELETE',
        headers: { cookie: `cwsess=${adminSid}` },
      });
      const res = await app.request('/api/v1/admin/wikis/tiny-counter/v0.1.0/latest', {
        method: 'POST',
        headers: { cookie: `cwsess=${adminSid}` },
      });
      expect(res.status).toBe(404);
    });
  });
});
