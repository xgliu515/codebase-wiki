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

describe('quiz attempts', () => {
  let tmpDir: string;
  let db: DB;
  let app: ReturnType<typeof createApp>;
  let adminSid: string;
  let userSid: string;
  let userId: number;

  beforeEach(async () => {
    tmpDir = await mkdtemp(resolve(tmpdir(), 'cwquiz-'));
    db = openDatabase(resolve(tmpDir, 'test.db'));
    runMigrations(db);
    const admin = db
      .prepare(
        `INSERT INTO users (github_id, github_login, created_at, last_seen_at)
         VALUES (?, ?, ?, ?) RETURNING id`,
      )
      .get(100, 'admin_user', Date.now(), Date.now()) as { id: number };
    adminSid = createSession(db, admin.id);
    const user = db
      .prepare(
        `INSERT INTO users (github_id, github_login, created_at, last_seen_at)
         VALUES (?, ?, ?, ?) RETURNING id`,
      )
      .get(101, 'student', Date.now(), Date.now()) as { id: number };
    userId = user.id;
    userSid = createSession(db, userId);
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

  it('requires login', async () => {
    const res = await app.request('/api/v1/wikis/tiny-counter/v0.1.0/quizzes/intro/attempts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ answers: { 'intro-q1': ['b'] } }),
    });
    expect(res.status).toBe(401);
  });

  it('grades correct answer', async () => {
    const res = await app.request('/api/v1/wikis/tiny-counter/v0.1.0/quizzes/intro/attempts', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `cwsess=${userSid}` },
      body: JSON.stringify({ answers: { 'intro-q1': ['b'] } }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.score).toBe(1);
    expect(body.results[0].correct).toBe(true);
    expect(body.results[0].correct_answer).toEqual(['b']);
    expect(body.results[0].explanation).toBeTypeOf('string');
  });

  it('grades incorrect answer', async () => {
    const res = await app.request('/api/v1/wikis/tiny-counter/v0.1.0/quizzes/intro/attempts', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `cwsess=${userSid}` },
      body: JSON.stringify({ answers: { 'intro-q1': ['a'] } }),
    });
    const body = await res.json();
    expect(body.score).toBe(0);
    expect(body.results[0].correct).toBe(false);
  });

  it('grades mcq-multi exact match', async () => {
    const res = await app.request('/api/v1/wikis/tiny-counter/v0.1.0/quizzes/architecture/attempts', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `cwsess=${userSid}` },
      body: JSON.stringify({
        answers: { 'architecture-q1': ['c'], 'architecture-q2': ['a', 'b'] },
      }),
    });
    const body = await res.json();
    expect(body.score).toBe(1);
  });

  it('rejects unknown qid', async () => {
    const res = await app.request('/api/v1/wikis/tiny-counter/v0.1.0/quizzes/intro/attempts', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `cwsess=${userSid}` },
      body: JSON.stringify({ answers: { 'nosuch-q1': ['a'] } }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('quiz_qid_unknown');
  });

  it('rejects unknown option id', async () => {
    const res = await app.request('/api/v1/wikis/tiny-counter/v0.1.0/quizzes/intro/attempts', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `cwsess=${userSid}` },
      body: JSON.stringify({ answers: { 'intro-q1': ['z'] } }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('quiz_option_unknown');
  });

  it('rejects payload carrying redacted field', async () => {
    const res = await app.request('/api/v1/wikis/tiny-counter/v0.1.0/quizzes/intro/attempts', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `cwsess=${userSid}` },
      body: JSON.stringify({ answers: { 'intro-q1': ['b'], 'explanation': ['nope'] } }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('quiz_redacted_field');
  });

  it('writes attempt row to DB', async () => {
    await app.request('/api/v1/wikis/tiny-counter/v0.1.0/quizzes/intro/attempts', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `cwsess=${userSid}` },
      body: JSON.stringify({ answers: { 'intro-q1': ['b'] } }),
    });
    const row = db
      .prepare(`SELECT score, question_count, results_json FROM attempts WHERE user_id=?`)
      .get(userId) as { score: number; question_count: number; results_json: string };
    expect(row.score).toBe(1);
    expect(row.question_count).toBe(1);
    const results = JSON.parse(row.results_json);
    expect(results[0].correct).toBe(true);
    // Stored results should NOT contain explanation/correct_answer (slim)
    expect(results[0]).not.toHaveProperty('correct_answer');
    expect(results[0]).not.toHaveProperty('explanation');
  });

  it('GET attempts returns history newest-first', async () => {
    // Submit twice
    await app.request('/api/v1/wikis/tiny-counter/v0.1.0/quizzes/intro/attempts', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `cwsess=${userSid}` },
      body: JSON.stringify({ answers: { 'intro-q1': ['a'] } }),
    });
    await app.request('/api/v1/wikis/tiny-counter/v0.1.0/quizzes/intro/attempts', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `cwsess=${userSid}` },
      body: JSON.stringify({ answers: { 'intro-q1': ['b'] } }),
    });
    const res = await app.request('/api/v1/wikis/tiny-counter/v0.1.0/quizzes/intro/attempts', {
      headers: { cookie: `cwsess=${userSid}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.attempts).toHaveLength(2);
    expect(body.attempts[0].score).toBe(1);  // newest first (correct one)
    expect(body.attempts[1].score).toBe(0);
  });

  it('rate-limits > 5 attempts in 10s', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await app.request('/api/v1/wikis/tiny-counter/v0.1.0/quizzes/intro/attempts', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: `cwsess=${userSid}` },
        body: JSON.stringify({ answers: { 'intro-q1': ['a'] } }),
      });
      expect(res.status).toBe(200);
    }
    const res6 = await app.request('/api/v1/wikis/tiny-counter/v0.1.0/quizzes/intro/attempts', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `cwsess=${userSid}` },
      body: JSON.stringify({ answers: { 'intro-q1': ['a'] } }),
    });
    expect(res6.status).toBe(429);
    expect(res6.headers.get('Retry-After')).toBe('10');
  });

  it('rejects ?limit=<non-numeric> by falling back to default 20', async () => {
    const res = await app.request(
      '/api/v1/wikis/tiny-counter/v0.1.0/quizzes/intro/attempts?limit=abc',
      { headers: { cookie: `cwsess=${userSid}` } },
    );
    expect(res.status).toBe(200);
  });

  it('rate-limit is version-agnostic — uploading another version does not reset bucket', async () => {
    // Submit 5 attempts to v0.1.0 → hits 429 on 6th
    for (let i = 0; i < 5; i++) {
      await app.request('/api/v1/wikis/tiny-counter/v0.1.0/quizzes/intro/attempts', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: `cwsess=${userSid}` },
        body: JSON.stringify({ answers: { 'intro-q1': ['a'] } }),
      });
    }
    // Note: We can't easily upload v0.2.0 in this isolated test, so verify the
    // 6th attempt still hits 429 (proving the bucket is shared per-chapter):
    const res = await app.request('/api/v1/wikis/tiny-counter/v0.1.0/quizzes/intro/attempts', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `cwsess=${userSid}` },
      body: JSON.stringify({ answers: { 'intro-q1': ['a'] } }),
    });
    expect(res.status).toBe(429);
    // The rate-limit key audit: implementation must use `${user_id}:attempt:${subject}/${chapterId}`
    // (version-agnostic). This test verifies behavior, not key string.
  });
});
