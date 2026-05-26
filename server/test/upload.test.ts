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

describe('POST /api/v1/admin/wikis (upload staging)', () => {
  let tmpDir: string;
  let db: DB;
  let app: ReturnType<typeof createApp>;
  let adminSid: string;
  let userSid: string;
  let sampleTarball: Buffer;

  beforeEach(async () => {
    tmpDir = await mkdtemp(resolve(tmpdir(), 'cwupload-'));
    db = openDatabase(resolve(tmpDir, 'test.db'));
    runMigrations(db);

    // Insert an admin user + session
    const admin = db
      .prepare(
        `INSERT INTO users (github_id, github_login, created_at, last_seen_at)
         VALUES (?, ?, ?, ?) RETURNING id`,
      )
      .get(100, 'admin_user', Date.now(), Date.now()) as { id: number };
    adminSid = createSession(db, admin.id);

    // Non-admin user
    const user = db
      .prepare(
        `INSERT INTO users (github_id, github_login, created_at, last_seen_at)
         VALUES (?, ?, ?, ?) RETURNING id`,
      )
      .get(101, 'regular_user', Date.now(), Date.now()) as { id: number };
    userSid = createSession(db, user.id);

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

    // Pack sample-wikipkg into a tarball we can upload
    const tarPath = resolve(tmpDir, 'sample.wikipkg.tar.gz');
    execSync(
      `node ${repoRoot}/tools/wikipkg/dist/cli.js pack ${repoRoot}/examples/sample-wikipkg ${tarPath}`,
      { stdio: 'pipe' },
    );
    sampleTarball = await readFile(tarPath);
  });

  afterEach(async () => {
    db.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('rejects unauthenticated requests with 403', async () => {
    const res = await app.request('/api/v1/admin/wikis', {
      method: 'POST',
      headers: { 'content-type': 'application/gzip' },
      body: sampleTarball,
    });
    expect(res.status).toBe(403);
  });

  it('rejects non-admin authenticated requests with 403', async () => {
    const res = await app.request('/api/v1/admin/wikis', {
      method: 'POST',
      headers: { 'content-type': 'application/gzip', cookie: `cwsess=${userSid}` },
      body: sampleTarball,
    });
    expect(res.status).toBe(403);
  });

  it('accepts and stages a valid tarball', async () => {
    const res = await app.request('/api/v1/admin/wikis', {
      method: 'POST',
      headers: { 'content-type': 'application/gzip', cookie: `cwsess=${adminSid}` },
      body: sampleTarball,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.staged_files).toBeGreaterThan(0);
  });

  it('rejects oversized tarball', async () => {
    const big = Buffer.alloc(60 * 1024 * 1024);  // 60 MB > 50 MB default
    const res = await app.request('/api/v1/admin/wikis', {
      method: 'POST',
      headers: { 'content-type': 'application/gzip', cookie: `cwsess=${adminSid}` },
      body: big,
    });
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toBe('payload_too_large');
  });
});
