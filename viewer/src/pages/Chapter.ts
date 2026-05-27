import { h } from '../dom.js';
import { api } from '../api/client.js';
import { renderMarkdown } from '../components/MarkdownRenderer.js';
import { renderSidebar } from '../components/Sidebar.js';
import { renderQuizCard } from '../components/QuizCard.js';
import { renderAddendaList } from '../components/AddendaList.js';
import { installAutoMarkRead } from '../components/AutoMarkRead.js';
import { decorateWithGlossary } from '../components/GlossaryInline.js';
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
  const user = userStore.get();
  const actionsRow: HTMLElement[] = [];
  let alreadyRead = false;
  if (user) {
    // Check if this chapter is already marked read (best-effort, fail open)
    try {
      const p = await api.getProgress(subject);
      alreadyRead = p.progress.some((row) => row.chapter_id === chapterId && row.status === 'read');
    } catch { /* anonymous or error — fall through */ }

    const markBtn = h('button', {
      onclick: async () => {
        await api.setProgress(subject, version, chapterId, 'read');
        markBtn.textContent = 'Marked read ✓';
        markBtn.disabled = true;
      },
    }, alreadyRead ? 'Marked read ✓' : 'Mark as read');
    if (alreadyRead) markBtn.setAttribute('disabled', '');
    actionsRow.push(markBtn);
  }
  if (ch.quiz_path) {
    actionsRow.push(
      h('button', {
        onclick: () => navigate(`/wiki/${subject}/${version}/chapter/${chapterId}/quiz`),
      }, 'Start quiz'),
    );
  }
  actionsRow.push(
    h('button', {
      class: 'btn-secondary',
      title: 'Open browser print dialog — choose "Save as PDF" to export',
      onclick: () => window.print(),
    }, '🖨 Print / PDF'),
  );

  // Prev / next chapter by manifest order
  const sortedChapters = manifest.chapters.slice().sort((a, b) => a.order - b.order);
  const idx = sortedChapters.findIndex((x) => x.id === chapterId);
  const prev = idx > 0 ? sortedChapters[idx - 1] : undefined;
  const next = idx >= 0 && idx < sortedChapters.length - 1 ? sortedChapters[idx + 1] : undefined;
  const chapterNav = (prev || next) ? h('nav', { class: 'chapter-nav' },
    prev ? h('a', {
      class: 'chapter-nav-prev',
      'data-nav': 'prev',
      href: `/wiki/${subject}/${version}/chapter/${prev.id}`,
      onclick: (e: MouseEvent) => { e.preventDefault(); navigate(`/wiki/${subject}/${version}/chapter/${prev.id}`); },
    },
      h('span', { class: 'chapter-nav-label' }, '← Previous'),
      h('span', { class: 'chapter-nav-title' }, prev.title),
    ) : h('span'),
    next ? h('a', {
      class: 'chapter-nav-next',
      'data-nav': 'next',
      href: `/wiki/${subject}/${version}/chapter/${next.id}`,
      onclick: (e: MouseEvent) => { e.preventDefault(); navigate(`/wiki/${subject}/${version}/chapter/${next.id}`); },
    },
      h('span', { class: 'chapter-nav-label' }, 'Next →'),
      h('span', { class: 'chapter-nav-title' }, next.title),
    ) : h('span'),
  ) : null;

  const article = h('article', { class: 'chapter' },
    h('h1', null, chapter.title),
    content,
    h('div', { class: 'chapter-actions' }, ...actionsRow),
    chapterNav,
    await renderAddendaList({ subject, version, chapterId, manifest }),
  );

  // Build a "On this page" TOC from h2/h3 in rendered content
  const toc = buildToc(content);

  const main = h('div', { class: 'chapter-with-toc' }, article, toc);

  // Auto mark-as-read on scroll-to-bottom + 4s dwell
  installAutoMarkRead(article, subject, version, chapterId, Boolean(user), alreadyRead);

  // Decorate inline glossary terms (fire-and-forget)
  void decorateWithGlossary(content, subject, version);

  return h('div', { class: 'layout' }, sidebar, main);
}

function buildToc(content: HTMLElement): HTMLElement | null {
  const headings = content.querySelectorAll<HTMLElement>('h2[id], h3[id]');
  if (headings.length === 0) return null;
  const items: HTMLElement[] = [];
  const headingArr = Array.from(headings);
  const linkById = new Map<string, HTMLAnchorElement>();
  headingArr.forEach((hd) => {
    const id = hd.id;
    const clone = hd.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('.heading-anchor').forEach((a) => a.remove());
    const text = clone.textContent?.trim() ?? id;
    const a = h('a', { href: `#${id}`, 'data-toc-target': id }, text) as HTMLAnchorElement;
    linkById.set(id, a);
    items.push(h('li', { class: `toc-${hd.tagName.toLowerCase()}` }, a));
  });
  const toc = h('aside', { class: 'chapter-toc' },
    h('h4', null, 'On this page'),
    h('ul', null, ...items),
  );
  // Activate the first heading by default before scroll fires
  if (linkById.size > 0) {
    const firstLink = linkById.values().next().value;
    if (firstLink) firstLink.classList.add('active');
  }
  // Install IntersectionObserver to highlight currently-in-view heading
  // Defer to next frame so headings are laid out
  requestAnimationFrame(() => installTocSync(headingArr, linkById, toc));
  return toc;
}

function installTocSync(
  headings: HTMLElement[],
  linkById: Map<string, HTMLAnchorElement>,
  toc: HTMLElement,
): void {
  if (typeof IntersectionObserver === 'undefined') return;
  // Track visibility ratios; the "active" heading is the topmost one whose
  // top is above (or at) the viewport's reading line. We use a top rootMargin
  // so the active heading switches as it crosses near the top of the viewport.
  const visible = new Set<string>();
  const setActive = (id: string | null) => {
    linkById.forEach((a) => a.classList.remove('active'));
    if (id) {
      const a = linkById.get(id);
      if (a) {
        a.classList.add('active');
        // Auto-scroll TOC if active item out of TOC viewport
        const tocBox = toc.getBoundingClientRect();
        const aBox = a.getBoundingClientRect();
        if (aBox.top < tocBox.top || aBox.bottom > tocBox.bottom) {
          a.scrollIntoView({ block: 'nearest', behavior: 'auto' });
        }
      }
    }
  };

  const obs = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const id = (e.target as HTMLElement).id;
      if (e.isIntersecting) visible.add(id);
      else visible.delete(id);
    }
    // Pick the topmost visible heading (by document order)
    let active: string | null = null;
    for (const hd of headings) {
      if (visible.has(hd.id)) { active = hd.id; break; }
    }
    // If nothing is in the "visible" window, find the heading just above the viewport
    if (!active) {
      let aboveTop: string | null = null;
      for (const hd of headings) {
        if (hd.getBoundingClientRect().top < 100) aboveTop = hd.id;
        else break;
      }
      active = aboveTop;
    }
    setActive(active);
  }, {
    // Active region: top 12% to top 50% of viewport
    rootMargin: '-12% 0% -50% 0%',
    threshold: 0,
  });

  for (const hd of headings) obs.observe(hd);

  // Cleanup when TOC detaches
  const cleanup = new MutationObserver(() => {
    if (!toc.isConnected) {
      obs.disconnect();
      cleanup.disconnect();
    }
  });
  cleanup.observe(document.body, { childList: true, subtree: true });
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
