import type { Glossary, Term } from '@codebase-wiki/shared';
import { h } from '../dom.js';
import { api } from '../api/client.js';

/**
 * Inline glossary linkifier + popover.
 *
 * - On chapter render, find any occurrence of a glossary term (or its alias)
 *   in plain text nodes (NOT inside code/pre/headings/links) and wrap in
 *   `<span class="glossary-term" data-term-id="...">`.
 * - On hover/click, show a popover with the definition + see_also.
 * - Caches glossary per (subject, version).
 */

type Cache = { subject: string; version: string; glossary: Glossary };
let cache: Cache | null = null;

async function loadGlossary(subject: string, version: string): Promise<Glossary | null> {
  if (cache && cache.subject === subject && cache.version === version) return cache.glossary;
  try {
    const g = await api.getGlossary(subject, version);
    cache = { subject, version, glossary: g };
    return g;
  } catch {
    return null;
  }
}

/**
 * Walk an element's text nodes (skipping inside <code>, <pre>, <a>, headings)
 * and wrap occurrences of any provided term phrase.
 */
function highlightTerms(root: HTMLElement, terms: Term[]): void {
  // Build a single regex of all phrases (longest first to prefer "kv cache" over "cache")
  const allPhrases: Array<{ phrase: string; term: Term }> = [];
  for (const term of terms) {
    allPhrases.push({ phrase: term.term, term });
    if (term.aliases) {
      for (const a of term.aliases) allPhrases.push({ phrase: a, term });
    }
  }
  allPhrases.sort((a, b) => b.phrase.length - a.phrase.length);
  if (allPhrases.length === 0) return;

  // Escape regex meta chars per phrase
  const escaped = allPhrases.map(({ phrase }) => phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // Word boundary: for ASCII phrases use \b; for non-ASCII (Chinese) require no preceding/following word char (Chinese chars match \b oddly, so we use a simpler look-around)
  // Combined: try \b<phrase>\b first; if phrase contains non-ASCII fallback to non-word-char-boundary heuristic.
  // Simpler approach: a single regex with (^|[^A-Za-z0-9_])(phrase)([^A-Za-z0-9_]|$). We capture group 2 as the match.
  const re = new RegExp(`(^|[^A-Za-z0-9_])(${escaped.join('|')})(?=[^A-Za-z0-9_]|$)`, 'gi');

  // Build a phrase → Term map (case-insensitive lookup)
  const lookup = new Map<string, Term>();
  for (const { phrase, term } of allPhrases) lookup.set(phrase.toLowerCase(), term);

  // Skip these tag names entirely when walking
  const SKIP_TAGS = new Set(['CODE', 'PRE', 'A', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'KBD', 'BUTTON']);

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.parentElement) return NodeFilter.FILTER_REJECT;
      // Reject if any ancestor is in skip list
      let p: HTMLElement | null = node.parentElement;
      while (p && p !== root) {
        if (SKIP_TAGS.has(p.tagName)) return NodeFilter.FILTER_REJECT;
        if (p.classList?.contains('glossary-term')) return NodeFilter.FILTER_REJECT;
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
      const fullMatch = m[0];
      const lead = m[1] ?? '';
      const phrase = m[2] ?? '';
      const term = lookup.get(phrase.toLowerCase());
      // Emit any text between lastIndex and this match
      if (m.index > lastIndex) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex, m.index)));
      }
      // Lead char (whitespace/punct) is part of the match — emit raw
      if (lead) frag.appendChild(document.createTextNode(lead));
      // The wrapped term
      const span = document.createElement('span');
      span.className = 'glossary-term';
      if (term) span.dataset.termId = term.id;
      span.textContent = phrase;
      frag.appendChild(span);
      lastIndex = m.index + fullMatch.length;
    }
    if (hasMatch) {
      if (lastIndex < text.length) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex)));
      }
      tn.replaceWith(frag);
    }
  }
}

let popover: HTMLElement | null = null;
let popoverStack: string[] = [];  // for "see_also" recursive open

function closePopover(): void {
  if (popover) {
    popover.remove();
    popover = null;
    popoverStack = [];
  }
}

function openPopover(termId: string, anchorEl: HTMLElement, glossary: Glossary): void {
  const term = glossary.terms.find((t) => t.id === termId);
  if (!term) return;
  if (popover) popover.remove();
  popover = h('div', { class: 'glossary-popover', role: 'tooltip' },
    h('h4', null, term.term),
    term.aliases && term.aliases.length > 0
      ? h('p', { class: 'glossary-popover-aliases' }, `aka ${term.aliases.join(', ')}`)
      : null,
    h('p', { class: 'glossary-popover-def' }, term.definition),
    term.see_also && term.see_also.length > 0
      ? h('p', { class: 'glossary-popover-seealso' },
          'See also: ',
          ...term.see_also.flatMap((sid, idx) => {
            const referenced = glossary.terms.find((x) => x.id === sid);
            const label = referenced?.term ?? sid;
            const a = h('a', {
              class: 'glossary-popover-link',
              href: '#',
              onclick: (e: MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                popoverStack.push(termId);
                openPopover(sid, anchorEl, glossary);
              },
            }, label);
            return idx === 0 ? [a] : [document.createTextNode(', '), a];
          }),
        )
      : null,
    popoverStack.length > 0
      ? h('button', {
          class: 'glossary-popover-back',
          type: 'button',
          onclick: () => {
            const prev = popoverStack.pop();
            if (prev) openPopover(prev, anchorEl, glossary);
          },
        }, '← Back')
      : null,
  );
  document.body.appendChild(popover);
  positionPopover(popover, anchorEl);
}

function positionPopover(pop: HTMLElement, anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  pop.style.position = 'fixed';
  pop.style.visibility = 'hidden';
  pop.style.left = '0';
  pop.style.top = '0';
  // Force layout to measure
  const popRect = pop.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = rect.left;
  let top = rect.bottom + 6;
  if (left + popRect.width + 12 > vw) left = vw - popRect.width - 12;
  if (left < 12) left = 12;
  if (top + popRect.height + 12 > vh) top = rect.top - popRect.height - 6;
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
  pop.style.visibility = 'visible';
}

/**
 * Install the global click + Esc handlers (once at app startup).
 */
export function installGlossaryHandlers(): void {
  document.addEventListener('click', (e) => {
    const target = e.target as Element | null;
    if (!target) return;
    if (target.closest('.glossary-popover')) return;  // clicks inside popover handled there
    const term = target.closest<HTMLElement>('.glossary-term');
    if (term) {
      const termId = term.dataset.termId;
      if (!termId) return;
      // Find glossary from cache. If absent, ignore (we only highlight terms we know).
      if (!cache) return;
      e.preventDefault();
      e.stopPropagation();
      openPopover(termId, term, cache.glossary);
      return;
    }
    // Clicked outside popover → close
    if (popover) closePopover();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && popover) closePopover();
  });
  window.addEventListener('resize', () => {
    if (popover) closePopover();
  });
  window.addEventListener('scroll', () => {
    if (popover) closePopover();
  }, true);
}

/**
 * Called from Chapter page after markdown is rendered. Fetches glossary
 * (cached) and decorates the chapter element in place. No-op on failure.
 */
export async function decorateWithGlossary(
  contentEl: HTMLElement,
  subject: string,
  version: string,
): Promise<void> {
  const g = await loadGlossary(subject, version);
  if (!g || g.terms.length === 0) return;
  highlightTerms(contentEl, g.terms);
}
