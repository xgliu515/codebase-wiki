import { describe, it, expect } from 'vitest';
import { QuizSchema, RedactedQuizSchema, type Quiz, type RedactedQuiz } from '../src/quiz.js';

const validQuiz = {
  schema_version: '1.0',
  chapter_id: 'architecture-overview',
  questions: [
    {
      id: 'architecture-overview-q1',
      type: 'mcq-single',
      stem: 'Why does vLLM use PagedAttention?',
      options: [
        { id: 'a', text: 'To compress weights' },
        { id: 'b', text: 'To page KV cache like virtual memory' },
        { id: 'c', text: 'To skip attention' },
        { id: 'd', text: 'To use less GPU memory by quantization' },
      ],
      answer: ['b'],
      explanation: 'Traditional contiguous KV alloc fragments...',
      difficulty: 'easy',
      tags: ['memory'],
    },
    {
      id: 'architecture-overview-q2',
      type: 'mcq-multi',
      stem: 'Which of the following are true...',
      options: [
        { id: 'a', text: 'opt a' },
        { id: 'b', text: 'opt b' },
        { id: 'c', text: 'opt c' },
        { id: 'd', text: 'opt d' },
      ],
      answer: ['a', 'c'],
      explanation: '...',
      difficulty: 'medium',
    },
  ],
};

describe('QuizSchema', () => {
  it('accepts the canonical quiz', () => {
    const r = QuizSchema.safeParse(validQuiz);
    if (!r.success) console.error(r.error.format());
    expect(r.success).toBe(true);
  });

  it('rejects mcq-single with multiple answers', () => {
    const q = structuredClone(validQuiz);
    q.questions[0].answer = ['a', 'b'];
    expect(QuizSchema.safeParse(q).success).toBe(false);
  });

  it('rejects answer referencing missing option id', () => {
    const q = structuredClone(validQuiz);
    q.questions[0].answer = ['z'];
    expect(QuizSchema.safeParse(q).success).toBe(false);
  });

  it('rejects duplicate question ids within a quiz', () => {
    const q = structuredClone(validQuiz);
    q.questions[1].id = q.questions[0].id;
    expect(QuizSchema.safeParse(q).success).toBe(false);
  });

  it('rejects duplicate option ids within a question', () => {
    const q = structuredClone(validQuiz);
    q.questions[0].options[1].id = 'a';
    expect(QuizSchema.safeParse(q).success).toBe(false);
  });

  it('requires at least 2 options', () => {
    const q = structuredClone(validQuiz);
    q.questions[0].options = [{ id: 'a', text: 'only one' }];
    q.questions[0].answer = ['a'];
    expect(QuizSchema.safeParse(q).success).toBe(false);
  });

  it('requires at least 1 question', () => {
    const q = { ...validQuiz, questions: [] };
    expect(QuizSchema.safeParse(q).success).toBe(false);
  });

  it('allows references array', () => {
    const q = structuredClone(validQuiz);
    q.questions[0] = {
      ...q.questions[0],
      references: [{ chapter_id: 'architecture-overview', anchor: 'fragmentation' }],
    } as any;
    expect(QuizSchema.safeParse(q).success).toBe(true);
  });

  it('rejects mcq-multi with duplicate answer values', () => {
    const q = structuredClone(validQuiz);
    q.questions[1].answer = ['a', 'a'];
    expect(QuizSchema.safeParse(q).success).toBe(false);
  });
});

describe('RedactedQuizSchema', () => {
  it('strips answer / explanation / references', () => {
    const fullParsed = QuizSchema.parse(validQuiz);
    const redacted: RedactedQuiz = {
      schema_version: fullParsed.schema_version,
      chapter_id: fullParsed.chapter_id,
      questions: fullParsed.questions.map((q) => ({
        id: q.id,
        type: q.type,
        stem: q.stem,
        options: q.options,
        difficulty: q.difficulty,
        tags: q.tags,
      })),
    };
    const r = RedactedQuizSchema.safeParse(redacted);
    expect(r.success).toBe(true);
  });

  it('rejects redacted shape carrying answer', () => {
    const bogus = {
      schema_version: '1.0',
      chapter_id: 'x',
      questions: [
        {
          id: 'x-q1',
          type: 'mcq-single',
          stem: 's',
          options: [{ id: 'a', text: 't1' }, { id: 'b', text: 't2' }],
          difficulty: 'easy',
          answer: ['a'],
        },
      ],
    };
    expect(RedactedQuizSchema.safeParse(bogus).success).toBe(false);
  });

  it('redactQuiz() strips sensitive fields and produces a RedactedQuiz', async () => {
    const { redactQuiz } = await import('../src/quiz.js');
    const parsed = QuizSchema.parse(validQuiz);
    const redacted = redactQuiz(parsed);

    // Schema accepts the redacted output
    const r = RedactedQuizSchema.safeParse(redacted);
    expect(r.success).toBe(true);

    // No sensitive fields leaked into any question
    for (const q of redacted.questions) {
      expect((q as any).answer).toBeUndefined();
      expect((q as any).explanation).toBeUndefined();
      expect((q as any).references).toBeUndefined();
    }

    // Preserved fields match
    expect(redacted.questions[0]!.id).toBe(parsed.questions[0]!.id);
    expect(redacted.questions[0]!.stem).toBe(parsed.questions[0]!.stem);
  });
});
