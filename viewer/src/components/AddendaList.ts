import { h, clear } from '../dom.js';
import { api } from '../api/client.js';
import { userStore } from '../state.js';

export type AddendaListOpts = {
  subject: string;
  version: string;
  chapterId: string;
};

export async function renderAddendaList(opts: AddendaListOpts): Promise<HTMLElement> {
  const { subject, version, chapterId } = opts;
  const container = h('section', { class: 'addenda' }, h('h3', null, 'Q&A'));

  const refresh = async () => {
    const { addenda } = await api.listAddenda(subject, version, chapterId);
    const list = container.querySelector('.addenda-list');
    if (list) container.removeChild(list);
    const ul = h('ul', { class: 'addenda-list' });
    if (addenda.length === 0) {
      ul.appendChild(h('li', { class: 'empty' }, 'No questions yet.'));
    } else {
      for (const a of addenda) {
        ul.appendChild(
          h('li', null,
            h('div', { class: 'question' }, h('strong', null, 'Q: '), a.question),
            a.answer && h('div', { class: 'answer' }, h('strong', null, 'A: '), a.answer),
            h('div', { class: 'meta' }, `by ${a.author_login} on ${new Date(a.created_at).toLocaleDateString()}`),
          ),
        );
      }
    }
    container.appendChild(ul);
  };

  await refresh();

  if (userStore.get()) {
    const textarea = h('textarea', {
      placeholder: 'Ask a question about this chapter…',
      rows: '3',
    });
    const submit = h('button', {
      type: 'button',
      onclick: async () => {
        const text = textarea.value.trim();
        if (!text) return;
        submit.disabled = true;
        try {
          await api.postAddendum(subject, version, chapterId, text);
          textarea.value = '';
          await refresh();
        } catch (e: any) {
          alert(`Failed: ${e.message}`);
        } finally {
          submit.disabled = false;
        }
      },
    }, 'Submit question');
    container.appendChild(h('form', { class: 'addendum-form' }, textarea, submit));
  } else {
    container.appendChild(h('p', { class: 'signin-hint' }, 'Sign in to ask a question.'));
  }

  return container;
}
