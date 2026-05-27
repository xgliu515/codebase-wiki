import type { RedactedQuiz } from '@codebase-wiki/shared';
import { h, clear } from '../dom.js';
import { api } from '../api/client.js';
import { userStore } from '../state.js';

export type QuizCardOpts = {
  subject: string;
  version: string;
  chapterId: string;
};

// Persist mid-quiz selections so a refresh or accidental navigation doesn't
// lose work. Key is per (subject, version, chapter). Stored as
// { qid: optionIds[] }. Cleared on successful submit.
function draftKey(opts: QuizCardOpts): string {
  return `cwquiz:${opts.subject}/${opts.version}/${opts.chapterId}`;
}

function loadDraft(opts: QuizCardOpts): Record<string, string[]> | null {
  try {
    const raw = localStorage.getItem(draftKey(opts));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as Record<string, string[]>;
    return null;
  } catch {
    return null;
  }
}

function saveDraft(opts: QuizCardOpts, answers: Record<string, Set<string>>): void {
  try {
    const flat: Record<string, string[]> = {};
    for (const [qid, set] of Object.entries(answers)) flat[qid] = [...set];
    // Skip writing an all-empty draft (clutters localStorage)
    if (Object.values(flat).every((arr) => arr.length === 0)) {
      localStorage.removeItem(draftKey(opts));
      return;
    }
    localStorage.setItem(draftKey(opts), JSON.stringify(flat));
  } catch {
    /* quota or disabled — ignore */
  }
}

function clearDraft(opts: QuizCardOpts): void {
  try { localStorage.removeItem(draftKey(opts)); } catch { /* ignore */ }
}

export async function renderQuizCard(opts: QuizCardOpts): Promise<HTMLElement> {
  const { subject, version, chapterId } = opts;

  const container = h('div', { class: 'quiz-card' }, h('p', null, 'Loading quiz…'));

  if (!userStore.get()) {
    clear(container);
    container.appendChild(h('p', null, 'Sign in to take the quiz.'));
    container.appendChild(h('a', { href: '/api/v1/auth/github/start' }, 'Sign in with GitHub'));
    return container;
  }

  let quiz: RedactedQuiz;
  try {
    quiz = await api.getRedactedQuiz(subject, version, chapterId);
  } catch (e: any) {
    clear(container);
    container.appendChild(h('p', null, e.status === 404 ? 'No quiz for this chapter.' : 'Failed to load quiz.'));
    return container;
  }

  const userAnswers: Record<string, Set<string>> = {};
  for (const q of quiz.questions) userAnswers[q.id] = new Set();

  // Restore draft if present (must match this quiz's question ids)
  const draft = loadDraft(opts);
  let hasDraft = false;
  if (draft) {
    for (const q of quiz.questions) {
      const arr = draft[q.id];
      if (Array.isArray(arr)) {
        const optIds = new Set(q.options.map((o) => o.id));
        for (const a of arr) if (optIds.has(a)) {
          userAnswers[q.id]!.add(a);
          hasDraft = true;
        }
      }
    }
  }

  const renderForm = () => {
    clear(container);
    container.appendChild(h('h3', null, `Quiz: ${quiz.questions.length} questions`));
    if (hasDraft) {
      container.appendChild(h('p', { class: 'quiz-draft-hint' },
        'Restored from saved draft. ',
        h('button', {
          class: 'quiz-draft-clear',
          type: 'button',
          onclick: () => {
            for (const q of quiz.questions) userAnswers[q.id] = new Set();
            clearDraft(opts);
            hasDraft = false;
            renderForm();
          },
        }, 'Clear and start over'),
      ));
    }

    for (const q of quiz.questions) {
      const optEls = q.options.map((opt) => {
        const inputType = q.type === 'mcq-single' ? 'radio' : 'checkbox';
        const input = h('input', {
          type: inputType,
          name: q.id,
          value: opt.id,
          onchange: (e: Event) => {
            const checked = (e.target as HTMLInputElement).checked;
            if (q.type === 'mcq-single') {
              userAnswers[q.id]!.clear();
              if (checked) userAnswers[q.id]!.add(opt.id);
            } else {
              if (checked) userAnswers[q.id]!.add(opt.id);
              else userAnswers[q.id]!.delete(opt.id);
            }
            saveDraft(opts, userAnswers);
          },
        });
        // Pre-check based on restored draft
        if (userAnswers[q.id]!.has(opt.id)) {
          (input as HTMLInputElement).checked = true;
        }
        return h('label', { class: 'quiz-option' }, input, ' ', opt.text);
      });

      container.appendChild(
        h('div', { class: 'quiz-question' },
          h('p', { class: 'stem' }, q.stem),
          ...optEls,
        ),
      );
    }

    const submitBtn = h('button', {
      class: 'submit',
      onclick: async () => {
        submitBtn.disabled = true;
        const answers: Record<string, string[]> = {};
        for (const qid of Object.keys(userAnswers)) {
          answers[qid] = [...userAnswers[qid]!];
        }
        try {
          const result = await api.submitAttempt(subject, version, chapterId, answers);
          clearDraft(opts);
          renderResults(result);
        } catch (e: any) {
          submitBtn.disabled = false;
          alert(`Submit failed: ${e.message}`);
        }
      },
    }, 'Submit');
    container.appendChild(submitBtn);
  };

  type Result = Awaited<ReturnType<typeof api.submitAttempt>>;
  const renderResults = (result: Result) => {
    clear(container);
    container.appendChild(h('h3', null, `Score: ${Math.round(result.score * 100)}%`));
    for (const r of result.results) {
      const q = quiz.questions.find((qq) => qq.id === r.qid)!;
      container.appendChild(
        h('div', { class: 'quiz-result' + (r.correct ? ' correct' : ' incorrect') },
          h('p', { class: 'stem' }, q.stem),
          h('p', { class: 'verdict' }, r.correct ? '✓ Correct' : '✗ Incorrect'),
          h('p', { class: 'detail' }, `Your answer: ${r.user_answer.join(', ') || '(empty)'}`),
          !r.correct && h('p', { class: 'detail' }, `Correct: ${r.correct_answer.join(', ')}`),
          r.explanation && h('p', { class: 'explanation' }, r.explanation),
        ),
      );
    }
    const retry = h('button', {
      onclick: () => {
        for (const q of quiz.questions) userAnswers[q.id] = new Set();
        clearDraft(opts);
        hasDraft = false;
        renderForm();
      },
    }, 'Try again');
    container.appendChild(retry);
  };

  renderForm();
  return container;
}
