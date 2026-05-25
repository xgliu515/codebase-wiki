import { z } from 'zod';
import { SlugSchema, SchemaVersionSchema } from './common.js';

const OptionSchema = z.object({
  id: z.string().regex(/^[a-z]$/, 'option id must be a single lowercase letter'),
  text: z.string().min(1).max(1000),
});

const ReferenceSchema = z.object({
  chapter_id: SlugSchema,
  anchor: z.string().min(1).max(200).optional(),
});

const DifficultySchema = z.enum(['easy', 'medium', 'hard']);
const QuestionTypeSchema = z.enum(['mcq-single', 'mcq-multi']);

// Full question (with answer + explanation) — for in-package storage and server side
const QuestionSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,127}$/),
    type: QuestionTypeSchema,
    stem: z.string().min(1).max(2000),
    options: z.array(OptionSchema).min(2).max(8),
    answer: z.array(z.string()).min(1).max(8),
    explanation: z.string().max(4000).optional(),
    references: z.array(ReferenceSchema).max(10).optional(),
    difficulty: DifficultySchema,
    tags: z.array(z.string().min(1).max(64)).max(10).optional(),
  })
  .superRefine((q, ctx) => {
    const optionIds = new Set(q.options.map((o) => o.id));
    if (optionIds.size !== q.options.length) {
      ctx.addIssue({ code: 'custom', message: 'duplicate option id', path: ['options'] });
    }
    if (q.type === 'mcq-single' && q.answer.length !== 1) {
      ctx.addIssue({
        code: 'custom',
        message: 'mcq-single must have exactly 1 answer',
        path: ['answer'],
      });
    }
    const answerSet = new Set(q.answer);
    if (answerSet.size !== q.answer.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'duplicate answer values',
        path: ['answer'],
      });
    }
    for (const a of q.answer) {
      if (!optionIds.has(a)) {
        ctx.addIssue({
          code: 'custom',
          message: `answer ${a} not in options`,
          path: ['answer'],
        });
      }
    }
  });

export const QuizSchema = z
  .object({
    schema_version: SchemaVersionSchema,
    chapter_id: SlugSchema,
    questions: z.array(QuestionSchema).min(1).max(20),
  })
  .superRefine((q, ctx) => {
    const seen = new Set<string>();
    q.questions.forEach((qq, i) => {
      if (seen.has(qq.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `duplicate question id: ${qq.id}`,
          path: ['questions', i, 'id'],
        });
      }
      seen.add(qq.id);
    });
  });

// Redacted version sent to the browser before submission (no answer / explanation / references)
const RedactedQuestionSchema = z.object({
  id: z.string(),
  type: QuestionTypeSchema,
  stem: z.string(),
  options: z.array(OptionSchema).min(2).max(8),
  difficulty: DifficultySchema,
  tags: z.array(z.string().min(1).max(64)).max(10).optional(),
});

export const RedactedQuizSchema = z.object({
  schema_version: SchemaVersionSchema,
  chapter_id: SlugSchema,
  questions: z.array(RedactedQuestionSchema).min(1),
});

export type Quiz = z.infer<typeof QuizSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type RedactedQuiz = z.infer<typeof RedactedQuizSchema>;

/** Strip answer-bearing fields for browser consumption */
export function redactQuiz(quiz: Quiz): RedactedQuiz {
  return {
    schema_version: quiz.schema_version,
    chapter_id: quiz.chapter_id,
    questions: quiz.questions.map((q) => ({
      id: q.id,
      type: q.type,
      stem: q.stem,
      options: q.options,
      difficulty: q.difficulty,
      ...(q.tags !== undefined ? { tags: q.tags } : {}),
    })),
  };
}
