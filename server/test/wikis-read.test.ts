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

describe('public read endpoints', () => {
  let tmpDir: string;
  let db: DB;
  let app: ReturnType<typeof createApp>;
  let adminSid: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(resolve(tmpdir(), 'cwread-'));
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
    // Upload sample
    const tarPath = resolve(tmpDir, 's.tar.gz');
    execSync(
      `node ${repoRoot}/tools/wikipkg/dist/cli.js pack ${repoRoot}/examples/sample-wikipkg ${tarPath}`,
      { stdio: 'pipe' },
    );
    const bytes = await readFile(tarPath);
    await app.request('/api/v1/admin/wikis', {
      method: 'POST',
      headers: { 'content-type': 'application/gzip', cookie: `cwsess=${adminSid}` },
      body: bytes,
    });
  });

  afterEach(async () => {
    db.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('GET /api/v1/wikis lists subjects', async () => {
    const res = await app.request('/api/v1/wikis');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subjects).toHaveLength(1);
    expect(body.subjects[0].slug).toBe('tiny-counter');
    expect(body.subjects[0].latest_version).toBe('v0.1.0');
  });

  it('GET /api/v1/wikis/:subject lists versions', async () => {
    const res = await app.request('/api/v1/wikis/tiny-counter');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.versions).toHaveLength(1);
    expect(body.versions[0].version_label).toBe('v0.1.0');
  });

  it('GET /api/v1/wikis/:unknown returns 404', async () => {
    const res = await app.request('/api/v1/wikis/no-such');
    expect(res.status).toBe(404);
  });

  it('GET /:subject/:version/manifest returns the manifest', async () => {
    const res = await app.request('/api/v1/wikis/tiny-counter/v0.1.0/manifest');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subject.slug).toBe('tiny-counter');
    expect(body.chapters).toHaveLength(3);
  });

  it('skips soft-deleted versions in list', async () => {
    await app.request('/api/v1/admin/wikis/tiny-counter/v0.1.0', {
      method: 'DELETE',
      headers: { cookie: `cwsess=${adminSid}` },
    });
    const res = await app.request('/api/v1/wikis/tiny-counter');
    const body = await res.json();
    expect(body.versions).toHaveLength(0);
  });

  it('PUBLIC_READ=false requires login', async () => {
    const dbPrivate = openDatabase(resolve(tmpDir, 'private.db'));
    runMigrations(dbPrivate);
    const appPrivate = createApp({
      db: dbPrivate,
      env: {
        GITHUB_CLIENT_ID: 'x', GITHUB_CLIENT_SECRET: 'x', OAUTH_REDIRECT_URI: 'http://x',
        ADMIN_GITHUB_LOGINS: '', DATA_DIR: tmpDir, PUBLIC_READ: 'false',
      },
    });
    const res = await appPrivate.request('/api/v1/wikis');
    expect(res.status).toBe(401);
    dbPrivate.close();
  });

  it('GET /chapters/:id returns markdown', async () => {
    const res = await app.request('/api/v1/wikis/tiny-counter/v0.1.0/chapters/intro');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe('Introduction');
    expect(body.markdown).toContain('Tiny Counter');
  });

  it('GET /chapters/:unknown returns 404', async () => {
    const res = await app.request('/api/v1/wikis/tiny-counter/v0.1.0/chapters/no-such');
    expect(res.status).toBe(404);
  });

  it('GET /tours/:id returns tour overview', async () => {
    const res = await app.request('/api/v1/wikis/tiny-counter/v0.1.0/tours/main');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.steps).toHaveLength(2);
  });

  it('GET /tours/:id/steps/:order returns step markdown', async () => {
    const res = await app.request('/api/v1/wikis/tiny-counter/v0.1.0/tours/main/steps/1');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe('HTTP entry');
    expect(body.markdown).toContain('Express');
  });

  it('GET /glossary returns terms', async () => {
    const res = await app.request('/api/v1/wikis/tiny-counter/v0.1.0/glossary');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.terms).toHaveLength(2);
  });

  it('GET /figures/:id returns SVG bytes with right content-type', async () => {
    const res = await app.request('/api/v1/wikis/tiny-counter/v0.1.0/figures/architecture');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/svg+xml');
    const txt = await res.text();
    expect(txt).toContain('<svg');
  });

  it('GET /quizzes/:chapter returns REDACTED (no answer)', async () => {
    const res = await app.request('/api/v1/wikis/tiny-counter/v0.1.0/quizzes/architecture');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.questions[0]).not.toHaveProperty('answer');
    expect(body.questions[0]).not.toHaveProperty('explanation');
    expect(body.questions[0].stem).toBeTypeOf('string');
  });
});
