/**
 * Custom in-chapter find/highlight. Triggered by `f` keyboard shortcut
 * (not when typing in form controls). Renders a small sticky bar with:
 *   - input
 *   - "N of M" counter
 *   - prev / next buttons
 *   - close button (or Esc)
 *
 * All matches in the current chapter article are wrapped in
 * `<mark class="find-hit">`. The "active" hit gets `.find-hit-active`.
 * Cleared on close.
 *
 * Skips text inside <code>, <pre>, <kbd>, <button>, <input>, <textarea>.
 */

let bar: HTMLElement | null = null;
let input: HTMLInputElement | null = null;
let counter: HTMLElement | null = null;
let articleEl: HTMLElement | null = null;
let hits: HTMLElement[] = [];
let activeIdx = 0;

const SKIP_TAGS = new Set(['CODE', 'PRE', 'KBD', 'BUTTON', 'INPUT', 'TEXTAREA']);

function clearHighlights(): void {
  if (!articleEl) return;
  articleEl.querySelectorAll<HTMLElement>('mark.find-hit').forEach((m) => {
    const text = document.createTextNode(m.textContent ?? '');
    m.replaceWith(text);
  });
  // Merge adjacent text nodes to keep DOM tidy
  // (Browsers handle this lazily; not critical.)
  hits = [];
  activeIdx = 0;
}

function applySearch(query: string): void {
  clearHighlights();
  if (!articleEl || !query) {
    updateCounter();
    return;
  }
  const re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  const walker = document.createTreeWalker(articleEl, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.parentElement) return NodeFilter.FILTER_REJECT;
      let p: HTMLElement | null = node.parentElement;
      while (p && p !== articleEl) {
        if (SKIP_TAGS.has(p.tagName)) return NodeFilter.FILTER_REJECT;
        // Don't recurse into our own find bar or marks
        if (p.classList?.contains('find-bar')) return NodeFilter.FILTER_REJECT;
        if (p.classList?.contains('find-hit')) return NodeFilter.FILTER_REJECT;
        p = p.parentElement;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const textNodes: Text[] = [];
  let n: Node | null = walker.nextNode();
  while (n) { textNodes.push(n as Text); n = walker.nextNode(); }

  for (const tn of textNodes) {
    const text = tn.nodeValue ?? '';
    if (!text) continue;
    re.lastIndex = 0;
    let lastIndex = 0;
    let m: RegExpExecArray | null;
    const frag = document.createDocumentFragment();
    let hasMatch = false;
    while ((m = re.exec(text)) !== null) {
      hasMatch = true;
      if (m.index > lastIndex) frag.appendChild(document.createTextNode(text.slice(lastIndex, m.index)));
      const mark = document.createElement('mark');
      mark.className = 'find-hit';
      mark.textContent = m[0];
      frag.appendChild(mark);
      hits.push(mark);
      lastIndex = m.index + m[0].length;
      // Zero-length match guard
      if (m[0].length === 0) re.lastIndex++;
    }
    if (hasMatch) {
      if (lastIndex < text.length) frag.appendChild(document.createTextNode(text.slice(lastIndex)));
      tn.replaceWith(frag);
    }
  }

  if (hits.length > 0) {
    activeIdx = 0;
    setActive(0);
  }
  updateCounter();
}

function setActive(idx: number): void {
  for (const m of hits) m.classList.remove('find-hit-active');
  if (idx >= 0 && idx < hits.length) {
    hits[idx]!.classList.add('find-hit-active');
    hits[idx]!.scrollIntoView({ block: 'center', behavior: 'auto' });
  }
  updateCounter();
}

function updateCounter(): void {
  if (!counter) return;
  if (hits.length === 0) {
    counter.textContent = input?.value ? '0 / 0' : '';
  } else {
    counter.textContent = `${activeIdx + 1} / ${hits.length}`;
  }
}

function next(): void {
  if (hits.length === 0) return;
  activeIdx = (activeIdx + 1) % hits.length;
  setActive(activeIdx);
}
function prev(): void {
  if (hits.length === 0) return;
  activeIdx = (activeIdx - 1 + hits.length) % hits.length;
  setActive(activeIdx);
}

export function openInChapterFind(): void {
  // Find the article element first
  articleEl = document.querySelector<HTMLElement>('article.chapter, article.tour-step, article.chapter-overview, .markdown-body')?.closest('article') ?? null;
  if (!articleEl) {
    // No chapter article on this page — bail silently
    return;
  }
  if (bar) {
    input?.focus();
    input?.select();
    return;
  }
  const inputEl = document.createElement('input');
  inputEl.type = 'text';
  inputEl.placeholder = 'Find in chapter…';
  inputEl.className = 'find-input';
  inputEl.autocomplete = 'off';
  inputEl.spellcheck = false;

  const cnt = document.createElement('span');
  cnt.className = 'find-counter';

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'find-btn';
  prevBtn.title = 'Previous (Shift+Enter)';
  prevBtn.textContent = '↑';
  prevBtn.addEventListener('click', () => prev());

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'find-btn';
  nextBtn.title = 'Next (Enter)';
  nextBtn.textContent = '↓';
  nextBtn.addEventListener('click', () => next());

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'find-btn find-close';
  closeBtn.title = 'Close (Esc)';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', () => closeInChapterFind());

  bar = document.createElement('div');
  bar.className = 'find-bar';
  bar.appendChild(inputEl);
  bar.appendChild(cnt);
  bar.appendChild(prevBtn);
  bar.appendChild(nextBtn);
  bar.appendChild(closeBtn);
  document.body.appendChild(bar);

  input = inputEl;
  counter = cnt;

  let debounceTimer = 0;
  inputEl.addEventListener('input', () => {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => applySearch(inputEl.value.trim()), 120);
  });
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) prev();
      else next();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeInChapterFind();
    }
  });
  inputEl.focus();
}

export function closeInChapterFind(): void {
  clearHighlights();
  if (bar) {
    bar.remove();
    bar = null;
    input = null;
    counter = null;
  }
  articleEl = null;
}

export function isInChapterFindOpen(): boolean {
  return bar !== null;
}
