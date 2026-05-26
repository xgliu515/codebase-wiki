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

describe('search', () => {
  let tmpDir: string;
  let db: DB;
  let app: ReturnType<typeof createApp>;
  let adminSid: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(resolve(tmpdir(), 'cwsearch-'));
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
        GITHUB_CLIENT_ID: 'x', GITHUB_CLIENT_SECRET: 'x', OAUTH_REDIRECT_URI: 'http://x',
        ADMIN_GITHUB_LOGINS: 'admin_user', DATA_DIR: tmpDir, PUBLIC_READ: 'true',
      },
    });
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

  it('finds "mutex" in glossary + architecture chapter', async () => {
    const res = await app.request('/api/v1/wikis/tiny-counter/v0.1.0/search?q=mutex');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results.length).toBeGreaterThanOrEqual(1);
    const types = new Set(body.results.map((r: any) => r.doc_type));
    expect(types.has('glossary_term') || types.has('chapter')).toBe(true);
  });

  it('returns empty array for no-match', async () => {
    const res = await app.request('/api/v1/wikis/tiny-counter/v0.1.0/search?q=xyzqqqqqq');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toEqual([]);
  });

  it('rejects q over 200 chars', async () => {
    const longQ = 'a'.repeat(201);
    const res = await app.request(`/api/v1/wikis/tiny-counter/v0.1.0/search?q=${longQ}`);
    expect(res.status).toBe(400);
  });

  it('does not return results from soft-deleted versions', async () => {
    await app.request('/api/v1/admin/wikis/tiny-counter/v0.1.0', {
      method: 'DELETE',
      headers: { cookie: `cwsess=${adminSid}` },
    });
    const res = await app.request('/api/v1/wikis/tiny-counter/v0.1.0/search?q=mutex');
    // Fix 5: deleted/non-existent version now returns 404 version_not_found
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('version_not_found');
  });
});
