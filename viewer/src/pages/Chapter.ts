import { h } from '../dom.js';
import { api } from '../api/client.js';
import { renderMarkdown } from '../components/MarkdownRenderer.js';
import { renderSidebar } from '../components/Sidebar.js';
import { renderQuizCard } from '../components/QuizCard.js';
import { renderAddendaList } from '../components/AddendaList.js';
import { userStore } from '../state.js';
import { navigate } from '../router.js';

export async function renderChapter(
  subject: string,
  version: string,
  chapterId: string,
): Promise<HTMLElement> {
  const [manifest, chapter] = await Promise.all([
    api.getManifest(subject, version),
    api.getChapter(subject, version, chapterId),
  ]);

  const sidebar = await renderSidebar({ manifest, subject, version, activeId: chapterId });
  const content = renderMarkdown(chapter.markdown, { subject, version, manifest });

  const ch = manifest.chapters.find((x) => x.id === chapterId)!;
  const actionsRow: HTMLElement[] = [];
  if (userStore.get()) {
    const markBtn = h('button', {
      onclick: async () => {
        await api.setProgress(subject, version, chapterId, 'read');
        markBtn.textContent = 'Marked read ✓';
        markBtn.disabled = true;
      },
    }, 'Mark as read');
    actionsRow.push(markBtn);
  }
  if (ch.quiz_path) {
    actionsRow.push(
      h('button', {
        onclick: () => navigate(`/wiki/${subject}/${version}/chapter/${chapterId}/quiz`),
      }, 'Start quiz'),
    );
  }

  // Prev / next chapter by manifest order
  const sortedChapters = manifest.chapters.slice().sort((a, b) => a.order - b.order);
  const idx = sortedChapters.findIndex((x) => x.id === chapterId);
  const prev = idx > 0 ? sortedChapters[idx - 1] : undefined;
  const next = idx >= 0 && idx < sortedChapters.length - 1 ? sortedChapters[idx + 1] : undefined;
  const chapterNav = (prev || next) ? h('nav', { class: 'chapter-nav' },
    prev ? h('a', {
      class: 'chapter-nav-prev',
      href: `/wiki/${subject}/${version}/chapter/${prev.id}`,
      onclick: (e: MouseEvent) => { e.preventDefault(); navigate(`/wiki/${subject}/${version}/chapter/${prev.id}`); },
    },
      h('span', { class: 'chapter-nav-label' }, '← Previous'),
      h('span', { class: 'chapter-nav-title' }, prev.title),
    ) : h('span'),
    next ? h('a', {
      class: 'chapter-nav-next',
      href: `/wiki/${subject}/${version}/chapter/${next.id}`,
      onclick: (e: MouseEvent) => { e.preventDefault(); navigate(`/wiki/${subject}/${version}/chapter/${next.id}`); },
    },
      h('span', { class: 'chapter-nav-label' }, 'Next →'),
      h('span', { class: 'chapter-nav-title' }, next.title),
    ) : h('span'),
  ) : null;

  const main = h('article', { class: 'chapter' },
    h('h1', null, chapter.title),
    content,
    h('div', { class: 'chapter-actions' }, ...actionsRow),
    chapterNav,
    await renderAddendaList({ subject, version, chapterId }),
  );

  return h('div', { class: 'layout' }, sidebar, main);
}

export async function renderQuizPage(
  subject: string,
  version: string,
  chapterId: string,
): Promise<HTMLElement> {
  const manifest = await api.getManifest(subject, version);
  const sidebar = await renderSidebar({ manifest, subject, version, activeId: chapterId });
  const quizCard = await renderQuizCard({ subject, version, chapterId });
  const main = h('article', { class: 'quiz-page' },
    h('h1', null, `Quiz: ${manifest.chapters.find((c) => c.id === chapterId)?.title ?? chapterId}`),
    quizCard,
  );
  return h('div', { class: 'layout' }, sidebar, main);
}
