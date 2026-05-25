# Plan C: 服务交互功能(quiz 答题 + 进度 + addenda)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Plan B 服务基础上加 3 类用户写入接口:章节测验答题(服务端判分)、进度标记、addenda 提交。所有写入都需要登录;所有写入都有 rate limit。

**Architecture:** 三组新接口,各自有一张 SQLite 表(`attempts` / `progress` / `addenda`)。Rate limit 用一个轻量 in-memory token bucket(自部署单进程足够;多实例时换 Redis)。Addenda 提交后追加 FTS 索引行。

**Tech Stack:** 同 Plan B(Node + Hono + better-sqlite3 + vitest)。新增:无新依赖。

**Spec:** `docs/specs/2026-05-25-codebase-wiki-service-design.md` §§3, 4, 7

**Predecessor:** Plan B(server scaffold + DB infra + auth + content delivery)。需要 wiki_versions / users / sessions 已经存在。

**Path conventions:** 单行 commit message,Edit/Write tools,no Co-Authored-By。

---

## Task 1: Migration 0003 — attempts / progress / addenda tables

**Files:**
- Create: `server/src/db/migrations/0003-attempts-progress-addenda.sql`
- Modify: `server/test/migrations.test.ts` (add table presence assertion)

- [ ] **Step 1: 写迁移**

`server/src/db/migrations/0003-attempts-progress-addenda.sql`:

```sql
CREATE TABLE progress (
  user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_slug        TEXT NOT NULL,
  chapter_id          TEXT NOT NULL,
  status              TEXT NOT NULL CHECK (status IN ('read', 'unread')),
  last_version_label  TEXT NOT NULL,
  marked_at           INTEGER NOT NULL,
  PRIMARY KEY (user_id, subject_slug, chapter_id)
);

CREATE TABLE attempts (
  id              INTEGER PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_slug    TEXT NOT NULL,
  version_label   TEXT NOT NULL,
  chapter_id      TEXT NOT NULL,
  attempted_at    INTEGER NOT NULL,
  results_json    TEXT NOT NULL,
  score           REAL NOT NULL,
  question_count  INTEGER NOT NULL
);
CREATE INDEX idx_attempts_user_chapter
  ON attempts(user_id, subject_slug, chapter_id, attempted_at);
CREATE INDEX idx_attempts_user_subject
  ON attempts(user_id, subject_slug);

CREATE TABLE addenda (
  id              INTEGER PRIMARY KEY,
  subject_slug    TEXT NOT NULL,
  version_label   TEXT NOT NULL,
  chapter_id      TEXT NOT NULL,
  author_user_id  INTEGER NOT NULL REFERENCES users(id),
  question        TEXT NOT NULL,
  answer          TEXT,
  created_at      INTEGER NOT NULL,
  hidden_at       INTEGER
);
CREATE INDEX idx_addenda_chapter
  ON addenda(subject_slug, version_label, chapter_id, created_at);
```

- [ ] **Step 2: 改 `server/test/migrations.test.ts`** — add assertion for new tables

In the existing test "creates users + sessions + ...", extend the expected names list:

```ts
      expect(names).toContain('users');
      expect(names).toContain('sessions');
      expect(names).toContain('subjects');
      expect(names).toContain('wiki_versions');
      expect(names).toContain('schema_migrations');
      expect(names).toContain('attempts');
      expect(names).toContain('progress');
      expect(names).toContain('addenda');
```

- [ ] **Step 3: build + test**

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && npm run build --workspace @codebase-wiki/server && cd server && npx vitest run test/migrations.test.ts
```
Expected: 4 tests pass.

- [ ] **Step 4: commit**

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && git add server/ && git commit -m "server/db: migration 0003 — attempts + progress + addenda"
```

---

## Task 2: Rate limiter (in-memory token bucket)

**Files:**
- Create: `server/src/util/rate-limit.ts`
- Create: `server/test/rate-limit.test.ts`

**Context:** Simple sliding window per (user, action, resource). 实例内 Map<key, number[]>,each entry stores timestamps of recent operations. On request: drop entries older than window, count remaining, allow or reject.

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from 'vitest';
import { RateLimiter } from '../src/util/rate-limit.js';

describe('RateLimiter', () => {
  it('allows under-limit operations', () => {
    const rl = new RateLimiter();
    for (let i = 0; i < 5; i++) {
      expect(rl.allow('user1:quiz', 10000, 5)).toBe(true);
    }
  });

  it('rejects over-limit', () => {
    const rl = new RateLimiter();
    for (let i = 0; i < 5; i++) rl.allow('user2:quiz', 10000, 5);
    expect(rl.allow('user2:quiz', 10000, 5)).toBe(false);
  });

  it('expires old entries', () => {
    const rl = new RateLimiter();
    // Fake clock: inject Date.now substitute
    const t0 = Date.now();
    let now = t0;
    rl.nowFn = () => now;
    for (let i = 0; i < 5; i++) rl.allow('user3:quiz', 1000, 5);
    expect(rl.allow('user3:quiz', 1000, 5)).toBe(false);
    now = t0 + 2000;  // 2 seconds later, all entries expired
    expect(rl.allow('user3:quiz', 1000, 5)).toBe(true);
  });

  it('isolates keys', () => {
    const rl = new RateLimiter();
    for (let i = 0; i < 5; i++) rl.allow('user4:quiz', 10000, 5);
    expect(rl.allow('user4:quiz', 10000, 5)).toBe(false);
    expect(rl.allow('user4:addenda', 10000, 5)).toBe(true);
  });
});
```

- [ ] **Step 2: 实现**

```ts
export class RateLimiter {
  private store = new Map<string, number[]>();
  nowFn: () => number = () => Date.now();

  allow(key: string, windowMs: number, limit: number): boolean {
    const now = this.nowFn();
    const cutoff = now - windowMs;
    let arr = this.store.get(key);
    if (!arr) {
      arr = [];
      this.store.set(key, arr);
    }
    // Drop expired
    let i = 0;
    while (i < arr.length && arr[i]! < cutoff) i++;
    if (i > 0) arr.splice(0, i);
    if (arr.length >= limit) return false;
    arr.push(now);
    return true;
  }
}
```

- [ ] **Step 3: build + test**

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && npm run build --workspace @codebase-wiki/server && cd server && npx vitest run test/rate-limit.test.ts
```
Expected: 4 tests pass.

- [ ] **Step 4: commit**

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && git add server/ && git commit -m "server/util: in-memory sliding-window rate limiter"
```

---

## Task 3: Quiz attempts — POST /attempts (with grading) + GET history

**Files:**
- Create: `server/src/quiz/grading.ts`
- Create: `server/src/quiz/routes.ts`
- Modify: `server/src/app.ts`
- Create: `server/test/quiz-attempts.test.ts`

**Context:** Server reads the full quiz JSON from disk (using manifest path), compares against user's submission, returns full result including correct answers + explanations.

- [ ] **Step 1: 写 `server/src/quiz/grading.ts`**

```ts
import type { Quiz, Question } from '@codebase-wiki/shared';

export type UserAnswers = Record<string, string[]>;

export type QuestionResult = {
  qid: string;
  user_answer: string[];
  correct: boolean;
  correct_answer: string[];
  explanation?: string;
  references?: Question['references'];
};

export type GradedAttempt = {
  results: QuestionResult[];
  score: number;        // 0.0 - 1.0
  question_count: number;
};

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  for (const x of b) if (!s.has(x)) return false;
  return true;
}

export function grade(quiz: Quiz, answers: UserAnswers): GradedAttempt {
  const results: QuestionResult[] = quiz.questions.map((q) => {
    const user = answers[q.id] ?? [];
    const correct = sameSet(user, q.answer);
    return {
      qid: q.id,
      user_answer: user,
      correct,
      correct_answer: q.answer,
      explanation: q.explanation,
      references: q.references,
    };
  });
  const score = results.length === 0
    ? 0
    : results.filter((r) => r.correct).length / results.length;
  return { results, score, question_count: results.length };
}

export function validateAnswerKeys(quiz: Quiz, answers: UserAnswers): { ok: true } | { ok: false; error: string; code: 'quiz_qid_unknown' | 'quiz_option_unknown' | 'quiz_redacted_field' } {
  const reserved = new Set(['correct', 'correct_answer', 'explanation', 'references']);
  for (const k of Object.keys(answers)) {
    if (reserved.has(k)) return { ok: false, error: `forbidden field: ${k}`, code: 'quiz_redacted_field' };
  }
  const qIds = new Set(quiz.questions.map((q) => q.id));
  const qById = new Map(quiz.questions.map((q) => [q.id, q]));
  for (const qid of Object.keys(answers)) {
    if (!qIds.has(qid)) return { ok: false, error: `unknown qid: ${qid}`, code: 'quiz_qid_unknown' };
    const q = qById.get(qid)!;
    const optionIds = new Set(q.options.map((o) => o.id));
    for (const a of answers[qid]!) {
      if (!optionIds.has(a)) return { ok: false, error: `unknown option ${a} for ${qid}`, code: 'quiz_option_unknown' };
    }
  }
  return { ok: true };
}
```

- [ ] **Step 2: 写 `server/src/quiz/routes.ts`**

```ts
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { readFile } from 'node:fs/promises';
import { resolve as resolvePath } from 'node:path';
import { ManifestSchema, QuizSchema } from '@codebase-wiki/shared';
import type { DB } from '../db/connection.js';
import { getSessionUser } from '../auth/session.js';
import { grade, validateAnswerKeys, type UserAnswers } from './grading.js';
import { RateLimiter } from '../util/rate-limit.js';

const rl = new RateLimiter();

export function createQuizRoutes(db: DB, env: { MAX_ATTEMPTS_PER_10S_PER_CHAPTER?: string }) {
  const r = new Hono();
  const attemptLimit = Number(env.MAX_ATTEMPTS_PER_10S_PER_CHAPTER ?? 5);

  const requireUser = (sid: string | undefined) => sid ? getSessionUser(db, sid) : undefined;

  const loadVersion = (subject: string, version: string) => {
    const row = db
      .prepare(
        `SELECT data_dir, manifest_json FROM wiki_versions
         WHERE subject_slug=? AND version_label=? AND deleted_at IS NULL`,
      )
      .get(subject, version) as { data_dir: string; manifest_json: string } | undefined;
    if (!row) return null;
    return { dataDir: row.data_dir, manifest: ManifestSchema.parse(JSON.parse(row.manifest_json)) };
  };

  r.post('/:subject/:version/quizzes/:chapterId/attempts', async (c) => {
    const sid = getCookie(c, 'cwsess');
    const u = requireUser(sid);
    if (!u) return c.json({ error: 'unauthorized', message: 'login required' }, 401);

    const subject = c.req.param('subject');
    const version = c.req.param('version');
    const chapterId = c.req.param('chapterId');

    const rlKey = `${u.user_id}:attempt:${subject}/${version}/${chapterId}`;
    if (!rl.allow(rlKey, 10000, attemptLimit)) {
      c.header('Retry-After', '10');
      return c.json({ error: 'rate_limited', message: 'too many attempts' }, 429);
    }

    const v = loadVersion(subject, version);
    if (!v) return c.json({ error: 'version_not_found' }, 404);
    const ch = v.manifest.chapters.find((x) => x.id === chapterId);
    if (!ch) return c.json({ error: 'chapter_not_found' }, 404);
    if (!ch.quiz_path) return c.json({ error: 'quiz_not_found' }, 404);

    let body: { answers?: UserAnswers };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'invalid_body', message: 'JSON body required' }, 400);
    }
    if (!body || typeof body.answers !== 'object' || body.answers === null) {
      return c.json({ error: 'invalid_body', message: 'answers object required' }, 400);
    }

    let quiz;
    try {
      const raw = await readFile(resolvePath(v.dataDir, ch.quiz_path), 'utf8');
      quiz = QuizSchema.parse(JSON.parse(raw));
    } catch (e) {
      console.error('[quiz] storage_failed:', e);
      return c.json({ error: 'storage_failed', message: 'could not load quiz' }, 500);
    }

    const validation = validateAnswerKeys(quiz, body.answers);
    if (!validation.ok) {
      return c.json({ error: validation.code, message: validation.error }, 400);
    }

    const graded = grade(quiz, body.answers);

    const slimResults = graded.results.map((rr) => ({
      qid: rr.qid,
      user_answer: rr.user_answer,
      correct: rr.correct,
    }));
    const insert = db
      .prepare(
        `INSERT INTO attempts
         (user_id, subject_slug, version_label, chapter_id, attempted_at, results_json, score, question_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      )
      .get(
        u.user_id,
        subject,
        version,
        chapterId,
        Date.now(),
        JSON.stringify(slimResults),
        graded.score,
        graded.question_count,
      ) as { id: number };

    return c.json({
      attempt_id: insert.id,
      score: graded.score,
      question_count: graded.question_count,
      results: graded.results,
    });
  });

  r.get('/:subject/:version/quizzes/:chapterId/attempts', (c) => {
    const sid = getCookie(c, 'cwsess');
    const u = requireUser(sid);
    if (!u) return c.json({ error: 'unauthorized' }, 401);

    const subject = c.req.param('subject');
    const version = c.req.param('version');
    const chapterId = c.req.param('chapterId');
    const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') ?? 20)));

    const rows = db
      .prepare(
        `SELECT id, attempted_at, score, question_count, results_json
         FROM attempts
         WHERE user_id=? AND subject_slug=? AND version_label=? AND chapter_id=?
         ORDER BY attempted_at DESC LIMIT ?`,
      )
      .all(u.user_id, subject, version, chapterId, limit) as Array<{
        id: number; attempted_at: number; score: number; question_count: number; results_json: string;
      }>;

    return c.json({
      attempts: rows.map((row) => ({
        id: row.id,
        attempted_at: row.attempted_at,
        score: row.score,
        question_count: row.question_count,
        results: JSON.parse(row.results_json),
      })),
    });
  });

  return r;
}
```

- [ ] **Step 3: 改 `server/src/app.ts`** — mount under `/api/v1/wikis`

In `createApp`, AFTER the wikis routes mount, add:

```ts
    app.route('/api/v1/wikis', createQuizRoutes(opts.db, opts.env));
```

Wait — both `createWikisRoutes` and `createQuizRoutes` mount at the same prefix. That's fine — Hono merges them, BUT route paths must not collide. `createQuizRoutes` adds `/:subject/:version/quizzes/:chapterId/attempts` which doesn't collide with anything in `createWikisRoutes`. Good.

Add `import { createQuizRoutes } from './quiz/routes.js';` at top.

- [ ] **Step 4: 写测试 `server/test/quiz-attempts.test.ts`**

```ts
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
});
```

- [ ] **Step 5: build + test**

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && npm run build --workspaces --if-present && cd server && npx vitest run test/quiz-attempts.test.ts
```
Expected: 10 tests pass.

- [ ] **Step 6: commit**

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && git add server/ && git commit -m "server/quiz: POST attempts (server-side grading) + GET history + rate limit"
```

---

## Task 4: Progress endpoints

**Files:**
- Create: `server/src/progress/routes.ts`
- Modify: `server/src/app.ts`
- Create: `server/test/progress.test.ts`

**Context:** Progress is per (user, subject, chapter) — **NOT per version** (spec §4 rule). `last_version_label` captures audit trail only.

Two endpoints (both require auth):
- `PUT /api/v1/wikis/:subject/:version/progress/:chapterId` body `{status: "read"|"unread"}` → upsert
- `GET /api/v1/wikis/:subject/progress` → all progress rows for this user+subject (no version in URL)

- [ ] **Step 1: 写 `server/src/progress/routes.ts`**

```ts
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import type { DB } from '../db/connection.js';
import { getSessionUser } from '../auth/session.js';
import { ManifestSchema } from '@codebase-wiki/shared';

export function createProgressRoutes(db: DB) {
  const r = new Hono();

  const requireUser = (sid: string | undefined) => sid ? getSessionUser(db, sid) : undefined;

  r.put('/:subject/:version/progress/:chapterId', async (c) => {
    const sid = getCookie(c, 'cwsess');
    const u = requireUser(sid);
    if (!u) return c.json({ error: 'unauthorized' }, 401);

    const subject = c.req.param('subject');
    const version = c.req.param('version');
    const chapterId = c.req.param('chapterId');

    let body: { status?: string };
    try { body = await c.req.json(); } catch { return c.json({ error: 'invalid_body' }, 400); }
    if (body.status !== 'read' && body.status !== 'unread') {
      return c.json({ error: 'progress_invalid', message: 'status must be read|unread' }, 400);
    }

    // Verify version exists + chapter exists in manifest
    const row = db
      .prepare(
        `SELECT manifest_json FROM wiki_versions
         WHERE subject_slug=? AND version_label=? AND deleted_at IS NULL`,
      )
      .get(subject, version) as { manifest_json: string } | undefined;
    if (!row) return c.json({ error: 'version_not_found' }, 404);
    const manifest = ManifestSchema.parse(JSON.parse(row.manifest_json));
    if (!manifest.chapters.find((ch) => ch.id === chapterId)) {
      return c.json({ error: 'chapter_not_found' }, 404);
    }

    db.prepare(
      `INSERT INTO progress (user_id, subject_slug, chapter_id, status, last_version_label, marked_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, subject_slug, chapter_id) DO UPDATE SET
         status = excluded.status,
         last_version_label = excluded.last_version_label,
         marked_at = excluded.marked_at`,
    ).run(u.user_id, subject, chapterId, body.status, version, Date.now());

    return c.json({ ok: true });
  });

  r.get('/:subject/progress', (c) => {
    const sid = getCookie(c, 'cwsess');
    const u = requireUser(sid);
    if (!u) return c.json({ error: 'unauthorized' }, 401);

    const subject = c.req.param('subject');
    const rows = db
      .prepare(
        `SELECT chapter_id, status, last_version_label, marked_at
         FROM progress WHERE user_id=? AND subject_slug=?
         ORDER BY chapter_id`,
      )
      .all(u.user_id, subject);
    return c.json({ progress: rows });
  });

  return r;
}
```

- [ ] **Step 2: 改 `server/src/app.ts`** — mount

```ts
    app.route('/api/v1/wikis', createProgressRoutes(opts.db));
```

(Order doesn't matter — Hono merges; route patterns don't collide with existing.)

Add import at top.

- [ ] **Step 3: 写测试 `server/test/progress.test.ts`**

```ts
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
```

- [ ] **Step 4: build + test**

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && npm run build --workspaces --if-present && cd server && npx vitest run test/progress.test.ts
```
Expected: 6 tests pass.

- [ ] **Step 5: commit**

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && git add server/ && git commit -m "server/progress: PUT/GET endpoints (per-user-per-subject-per-chapter, version-agnostic)"
```

---

## Task 5: Addenda endpoints + FTS integration

**Files:**
- Create: `server/src/addenda/routes.ts`
- Modify: `server/src/app.ts`
- Create: `server/test/addenda.test.ts`

**Context:** Per (subject, version, chapter). Append-only. Public GET if `PUBLIC_READ`. POST requires login. Rate-limited at 30 per hour per user per chapter (env `MAX_ADDENDA_PER_HOUR_PER_USER`). Each new addendum gets an FTS row.

- [ ] **Step 1: 写 `server/src/addenda/routes.ts`**

```ts
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import type { DB } from '../db/connection.js';
import { getSessionUser } from '../auth/session.js';
import { ManifestSchema } from '@codebase-wiki/shared';
import { RateLimiter } from '../util/rate-limit.js';

const rl = new RateLimiter();

export function createAddendaRoutes(
  db: DB,
  env: { PUBLIC_READ: string; MAX_ADDENDA_PER_HOUR_PER_USER?: string },
) {
  const r = new Hono();
  const publicRead = env.PUBLIC_READ === 'true';
  const addLimit = Number(env.MAX_ADDENDA_PER_HOUR_PER_USER ?? 30);

  const requireAuth = (sid: string | undefined) => {
    if (publicRead) return true;
    if (!sid) return false;
    return Boolean(getSessionUser(db, sid));
  };

  const requireUser = (sid: string | undefined) => sid ? getSessionUser(db, sid) : undefined;

  r.get('/:subject/:version/chapters/:chapterId/addenda', (c) => {
    if (!requireAuth(getCookie(c, 'cwsess'))) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    const subject = c.req.param('subject');
    const version = c.req.param('version');
    const chapterId = c.req.param('chapterId');
    const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') ?? 20)));
    const before = c.req.query('before');
    const params: (string | number)[] = [subject, version, chapterId];
    let sql = `SELECT a.id, a.question, a.answer, a.created_at, u.github_login AS author_login
               FROM addenda a JOIN users u ON u.id = a.author_user_id
               WHERE a.subject_slug=? AND a.version_label=? AND a.chapter_id=?
                 AND a.hidden_at IS NULL`;
    if (before) {
      sql += ` AND a.created_at < ?`;
      params.push(Number(before));
    }
    sql += ` ORDER BY a.created_at DESC LIMIT ?`;
    params.push(limit);
    const rows = db.prepare(sql).all(...params);
    return c.json({ addenda: rows });
  });

  r.post('/:subject/:version/chapters/:chapterId/addenda', async (c) => {
    const sid = getCookie(c, 'cwsess');
    const u = requireUser(sid);
    if (!u) return c.json({ error: 'unauthorized', message: 'login required' }, 401);

    const subject = c.req.param('subject');
    const version = c.req.param('version');
    const chapterId = c.req.param('chapterId');

    const rlKey = `${u.user_id}:addenda:${subject}/${chapterId}`;
    if (!rl.allow(rlKey, 60 * 60 * 1000, addLimit)) {
      c.header('Retry-After', '3600');
      return c.json({ error: 'rate_limited' }, 429);
    }

    let body: { question?: string; answer?: string | null };
    try { body = await c.req.json(); } catch { return c.json({ error: 'invalid_body' }, 400); }
    const q = (body.question ?? '').trim();
    if (!q || q.length > 2000) {
      return c.json({ error: 'addendum_invalid', message: 'question must be 1..2000 chars' }, 400);
    }
    const a = typeof body.answer === 'string' ? body.answer.trim() || null : null;
    if (a !== null && a.length > 4000) {
      return c.json({ error: 'addendum_invalid', message: 'answer must be ≤4000 chars' }, 400);
    }

    // Verify version exists and chapter exists
    const row = db
      .prepare(
        `SELECT manifest_json FROM wiki_versions
         WHERE subject_slug=? AND version_label=? AND deleted_at IS NULL`,
      )
      .get(subject, version) as { manifest_json: string } | undefined;
    if (!row) return c.json({ error: 'version_not_found' }, 404);
    const manifest = ManifestSchema.parse(JSON.parse(row.manifest_json));
    if (!manifest.chapters.find((ch) => ch.id === chapterId)) {
      return c.json({ error: 'chapter_not_found' }, 404);
    }

    const insertAddendum = db.prepare(
      `INSERT INTO addenda
       (subject_slug, version_label, chapter_id, author_user_id, question, answer, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    );
    const insertFts = db.prepare(
      `INSERT INTO content_fts (subject_slug, version_label, doc_type, doc_id, title, body)
       VALUES (?, ?, 'addendum', ?, ?, ?)`,
    );
    const now = Date.now();
    const txn = db.transaction(() => {
      const ins = insertAddendum.get(subject, version, chapterId, u.user_id, q, a, now) as { id: number };
      insertFts.run(subject, version, `addendum/${ins.id}`, q, a ?? '');
      return ins.id;
    });
    const newId = txn();

    return c.json({ id: newId, ok: true }, 201);
  });

  return r;
}
```

- [ ] **Step 2: 改 `server/src/app.ts`** — mount

```ts
    app.route('/api/v1/wikis', createAddendaRoutes(opts.db, opts.env));
```

Add import.

- [ ] **Step 3: 写测试 `server/test/addenda.test.ts`**

```ts
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
```

- [ ] **Step 4: build + test**

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && npm run build --workspaces --if-present && cd server && npx vitest run test/addenda.test.ts
```
Expected: 5 tests pass.

- [ ] **Step 5: commit**

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && git add server/ && git commit -m "server/addenda: POST/GET (append-only, FTS-indexed, rate-limited)"
```

---

## Task 6: Final integration verification

**Files:** none new.

- [ ] **Step 1: Clean install + build + full test**

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && rm -rf node_modules shared/node_modules shared/dist tools/wikipkg/node_modules tools/wikipkg/dist server/node_modules server/dist
cd /Users/xgliu/Documents/git/codebase-wiki && npm install && npm run build && npm test
```
Expected: all green. Plan A: 43+11 tests. Plan B: ~30. Plan C adds ~25 more. Total ~110+.

- [ ] **Step 2: Manual API smoke**

Boot server with sample subject pre-uploaded, then:

```bash
# (set DATA_DIR + start server in another terminal — see Plan B Task 14 Step 2)

# Anonymous reads
curl -s http://localhost:3000/api/v1/wikis | python3 -m json.tool

# Submit a quiz attempt — should fail without login
curl -sX POST http://localhost:3000/api/v1/wikis/tiny-counter/v0.1.0/quizzes/intro/attempts \
  -H 'content-type: application/json' \
  -d '{"answers":{"intro-q1":["b"]}}' | python3 -m json.tool

# Expect: {"error":"unauthorized", ...}
```

(For logged-in tests you'd need to go through GitHub OAuth — manual smoke is fine to skip if vitest passes.)

- [ ] **Step 3: Commit if anything changed**

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && git status
```
Clean → no commit. Otherwise add + commit.

---

Plan C done. The service now supports the full user-writes surface. **Viewer is still placeholder** — Plan D rewrites the actual UI.
