import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { readFile } from 'node:fs/promises';
import { resolve as resolvePath } from 'node:path';
import { ManifestSchema, QuizSchema } from '@codebase-wiki/shared';
import type { DB } from '../db/connection.js';
import { getSessionUser } from '../auth/session.js';
import { grade, validateAnswerKeys, type UserAnswers } from './grading.js';
import { RateLimiter } from '../util/rate-limit.js';

export function createQuizRoutes(db: DB, env: Record<string, string | undefined>) {
  const r = new Hono();
  const rl = new RateLimiter();
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
