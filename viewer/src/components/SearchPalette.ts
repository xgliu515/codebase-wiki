import { h, clear } from '../dom.js';
import { api } from '../api/client.js';
import { navigate } from '../router.js';
import { renderSnippet } from '../util/snippet.js';
import type { SearchHit } from '../api/types.js';

let palette: HTMLElement | null = null;

type WikiContext = { subject: string; version: string };

function currentWikiContext(): WikiContext | null {
  const m = location.pathname.match(/^\/wiki\/([^/]+)\/([^/]+)/);
  return m ? { subject: m[1]!, version: m[2]! } : null;
}

function resolveResultPath(ctx: WikiContext, hit: SearchHit): string | null {
  switch (hit.doc_type) {
    case 'chapter':
      return `/wiki/${ctx.subject}/${ctx.version}/chapter/${hit.doc_id}`;
    case 'tour_overview':
      return `/wiki/${ctx.subject}/${ctx.version}/tour/${hit.doc_id}`;
    case 'tour_step': {
      const [tourId, order] = hit.doc_id.split('/');
      return tourId && order
        ? `/wiki/${ctx.subject}/${ctx.version}/tour/${tourId}/${order}`
        : null;
    }
    case 'glossary_term':
      return `/wiki/${ctx.subject}/${ctx.version}/glossary#term-${hit.doc_id}`;
    default:
      // addendum and unknown types don't carry chapter context — not navigable
      return null;
  }
}

function docTypeLabel(t: string): string {
  switch (t) {
    case 'chapter': return 'Chapter';
    case 'tour_overview': return 'Tour';
    case 'tour_step': return 'Tour step';
    case 'glossary_term': return 'Glossary';
    case 'addendum': return 'Q&A';
    default: return t;
  }
}

export function openSearchPalette(): void {
  if (palette) {
    // Already open — refocus its input
    palette.querySelector<HTMLInputElement>('.cmdk-input')?.focus();
    return;
  }

  const ctx = currentWikiContext();

  const input = h('input', {
    type: 'text',
    placeholder: ctx ? `Search ${ctx.subject} ${ctx.version}…` : 'Open a wiki first to search',
    class: 'cmdk-input',
    autocomplete: 'off',
    spellcheck: 'false',
  }) as HTMLInputElement;
  if (!ctx) input.disabled = true;

  const results = h('div', { class: 'cmdk-results' });
  if (!ctx) {
    results.appendChild(h('p', { class: 'cmdk-hint' },
      'Search is scoped to one wiki version. Navigate into any subject first.',
    ));
  } else {
    results.appendChild(h('p', { class: 'cmdk-hint' }, 'Type to search'));
  }

  let debounceTimer = 0;
  let currentResults: SearchHit[] = [];
  let highlightIndex = 0;

  const doSearch = async (q: string) => {
    if (!ctx) return;
    try {
      const data = await api.search(ctx.subject, ctx.version, q);
      currentResults = data.results;
      highlightIndex = 0;
      renderResults();
    } catch (e: any) {
      currentResults = [];
      clear(results);
      results.appendChild(h('p', { class: 'cmdk-error' }, `Search failed: ${e.message}`));
    }
  };

  const renderResults = () => {
    clear(results);
    if (currentResults.length === 0) {
      results.appendChild(h('p', { class: 'cmdk-hint' }, 'No results.'));
      return;
    }
    // Group by doc_type, preserving server's score-ordered sequence within group
    const groups = new Map<string, SearchHit[]>();
    for (const hit of currentResults) {
      const list = groups.get(hit.doc_type) ?? [];
      list.push(hit);
      groups.set(hit.doc_type, list);
    }
    let flatIdx = 0;
    for (const [type, items] of groups) {
      results.appendChild(h('h4', { class: 'cmdk-group' }, docTypeLabel(type)));
      const ul = h('ul', { class: 'cmdk-list' });
      for (const hit of items) {
        const myIdx = flatIdx++;
        const path = ctx ? resolveResultPath(ctx, hit) : null;
        const li = h('li', {
          class: `cmdk-hit${myIdx === highlightIndex ? ' active' : ''}${path ? '' : ' not-navigable'}`,
          onclick: () => {
            if (path) {
              closeSearchPalette();
              navigate(path);
            }
          },
        },
          h('div', { class: 'cmdk-hit-id' }, hit.doc_id),
          h('div', { class: 'cmdk-hit-snippet' }, ...renderSnippet(hit.snippet)),
        );
        ul.appendChild(li);
      }
      results.appendChild(ul);
    }
  };

  input.addEventListener('input', () => {
    if (!ctx) return;
    window.clearTimeout(debounceTimer);
    const q = input.value.trim();
    if (!q) {
      currentResults = [];
      clear(results);
      results.appendChild(h('p', { class: 'cmdk-hint' }, 'Type to search'));
      return;
    }
    debounceTimer = window.setTimeout(() => void doSearch(q), 200);
  });

  input.addEventListener('keydown', (e) => {
    if (currentResults.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlightIndex = Math.min(currentResults.length - 1, highlightIndex + 1);
      renderResults();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlightIndex = Math.max(0, highlightIndex - 1);
      renderResults();
    } else if (e.key === 'Enter' && ctx) {
      e.preventDefault();
      const hit = currentResults[highlightIndex];
      if (hit) {
        const path = resolveResultPath(ctx, hit);
        if (path) {
          closeSearchPalette();
          navigate(path);
        }
      }
    }
  });

  palette = h('div', { class: 'cmdk-overlay' },
    h('div', { class: 'cmdk-modal' },
      h('div', { class: 'cmdk-header' }, input),
      results,
      h('div', { class: 'cmdk-footer' },
        h('span', null, h('kbd', null, '↑'), h('kbd', null, '↓'), ' navigate'),
        h('span', null, h('kbd', null, 'Enter'), ' open'),
        h('span', null, h('kbd', null, 'Esc'), ' close'),
      ),
    ),
  );

  palette.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('.cmdk-modal')) return;  // clicks inside modal don't close
    closeSearchPalette();
  });

  document.body.appendChild(palette);
  document.body.style.overflow = 'hidden';
  // Focus on next frame so the modal is in the layout
  requestAnimationFrame(() => input.focus());
}

export function closeSearchPalette(): void {
  if (palette) {
    palette.remove();
    palette = null;
    document.body.style.overflow = '';
  }
}

export function isSearchPaletteOpen(): boolean {
  return palette !== null;
}
