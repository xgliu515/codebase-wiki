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

describe('addenda', () => {
  let tmpDir: string;
  let db: DB;
  let app: ReturnType<typeof createApp>;
  let userSid: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(resolve(tmpdir(), 'cwadd-'));
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

  it('POST requires login', async () => {
    const res = await app.request('/api/v1/wikis/tiny-counter/v0.1.0/chapters/intro/addenda', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: 'q?' }),
    });
    expect(res.status).toBe(401);
  });

  it('POST creates addendum + FTS row', async () => {
    const res = await app.request('/api/v1/wikis/tiny-counter/v0.1.0/chapters/intro/addenda', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `cwsess=${userSid}` },
      body: JSON.stringify({ question: 'Why is the counter in-memory only?' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBeTypeOf('number');
    // Verify FTS got it
    const ftsRow = db
      .prepare(
        `SELECT body FROM content_fts WHERE subject_slug=? AND doc_type='addendum'`,
      )
      .get('tiny-counter');
    expect(ftsRow).toBeDefined();
    // Search finds it
    const sres = await app.request('/api/v1/wikis/tiny-counter/v0.1.0/search?q=memory');
    const sbody = await sres.json();
    expect(sbody.results.some((r: any) => r.doc_type === 'addendum')).toBe(true);
  });

  it('rejects empty question', async () => {
    const res = await app.request('/api/v1/wikis/tiny-counter/v0.1.0/chapters/intro/addenda', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `cwsess=${userSid}` },
      body: JSON.stringify({ question: '' }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects question > 2000 chars', async () => {
    const res = await app.request('/api/v1/wikis/tiny-counter/v0.1.0/chapters/intro/addenda', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `cwsess=${userSid}` },
      body: JSON.stringify({ question: 'q'.repeat(2001) }),
    });
    expect(res.status).toBe(400);
  });

  it('GET lists addenda newest-first', async () => {
    await app.request('/api/v1/wikis/tiny-counter/v0.1.0/chapters/intro/addenda', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `cwsess=${userSid}` },
      body: JSON.stringify({ question: 'first' }),
    });
    await app.request('/api/v1/wikis/tiny-counter/v0.1.0/chapters/intro/addenda', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `cwsess=${userSid}` },
      body: JSON.stringify({ question: 'second' }),
    });
    const res = await app.request('/api/v1/wikis/tiny-counter/v0.1.0/chapters/intro/addenda');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.addenda).toHaveLength(2);
    expect(body.addenda[0].question).toBe('second');
    expect(body.addenda[1].question).toBe('first');
    expect(body.addenda[0].author_login).toBe('student');
  });
});
