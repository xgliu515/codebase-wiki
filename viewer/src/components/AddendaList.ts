import type { Manifest } from '@codebase-wiki/shared';
import { h, clear } from '../dom.js';
import { api } from '../api/client.js';
import { userStore } from '../state.js';
import { renderMarkdown } from './MarkdownRenderer.js';

export type AddendaListOpts = {
  subject: string;
  version: string;
  chapterId: string;
  manifest: Manifest;
};

export async function renderAddendaList(opts: AddendaListOpts): Promise<HTMLElement> {
  const { subject, version, chapterId, manifest } = opts;
  const ctx = { subject, version, manifest };
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
        const questionBlock = h('div', { class: 'addendum-question-block' },
          h('span', { class: 'addendum-label' }, 'Q'),
          renderMarkdown(a.question, ctx),
        );
        questionBlock.querySelector('.markdown-body')?.classList.add('addendum-body');
        const answerBlock = a.answer
          ? (() => {
              const block = h('div', { class: 'addendum-answer-block' },
                h('span', { class: 'addendum-label' }, 'A'),
                renderMarkdown(a.answer, ctx),
              );
              block.querySelector('.markdown-body')?.classList.add('addendum-body');
              return block;
            })()
          : null;
        ul.appendChild(
          h('li', null,
            questionBlock,
            answerBlock,
            h('div', { class: 'meta' }, `by ${a.author_login} on ${new Date(a.created_at).toLocaleDateString()}`),
          ),
        );
      }
    }
    container.appendChild(ul);
  };

  await refresh();

  if (userStore.get()) {
    container.appendChild(renderEditor(ctx, chapterId, refresh));
  } else {
    container.appendChild(h('p', { class: 'signin-hint' }, 'Sign in to ask a question.'));
  }

  return container;
}

function renderEditor(
  ctx: { subject: string; version: string; manifest: Manifest },
  chapterId: string,
  onSubmit: () => Promise<void>,
): HTMLElement {
  const { subject, version, manifest } = ctx;

  const textarea = h('textarea', {
    placeholder: 'Ask a question about this chapter… Markdown supported (code, links, file:line refs).',
    rows: '4',
    class: 'addendum-textarea',
  }) as HTMLTextAreaElement;

  const previewPane = h('div', { class: 'addendum-preview' });

  const writeTab = h('button', { type: 'button', class: 'addendum-tab active' }, 'Write');
  const previewTab = h('button', { type: 'button', class: 'addendum-tab' }, 'Preview');

  const showWrite = () => {
    writeTab.classList.add('active');
    previewTab.classList.remove('active');
    textarea.style.display = 'block';
    previewPane.style.display = 'none';
  };
  const showPreview = () => {
    previewTab.classList.add('active');
    writeTab.classList.remove('active');
    textarea.style.display = 'none';
    previewPane.style.display = 'block';
    clear(previewPane);
    const text = textarea.value.trim();
    if (!text) {
      previewPane.appendChild(h('p', { class: 'addendum-preview-empty' }, 'Nothing to preview yet.'));
      return;
    }
    const rendered = renderMarkdown(text, { subject, version, manifest });
    rendered.classList.add('addendum-body');
    previewPane.appendChild(rendered);
  };

  writeTab.addEventListener('click', showWrite);
  previewTab.addEventListener('click', showPreview);

  const submit = h('button', {
    type: 'button',
    class: 'addendum-submit',
    onclick: async () => {
      const text = textarea.value.trim();
      if (!text) return;
      submit.disabled = true;
      try {
        await api.postAddendum(subject, version, chapterId, text);
        textarea.value = '';
        showWrite();
        await onSubmit();
      } catch (e: any) {
        alert(`Failed: ${e.message}`);
      } finally {
        submit.disabled = false;
      }
    },
  }, 'Submit question');

  showWrite();
  previewPane.style.display = 'none';

  return h('form', { class: 'addendum-form' },
    h('div', { class: 'addendum-tabs' }, writeTab, previewTab),
    textarea,
    previewPane,
    h('div', { class: 'addendum-form-footer' },
      h('span', { class: 'addendum-hint' },
        'Markdown supported. ',
        h('code', null, '**bold**'), ' ',
        h('code', null, '`code`'), ' ',
        h('code', null, '[link](url)'), ' ',
        h('code', null, 'path/file.py:42'),
      ),
      submit,
    ),
  );
}
