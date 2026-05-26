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
