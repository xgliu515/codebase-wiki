import { h } from '../dom.js';
import { api } from '../api/client.js';
import { renderSidebar } from '../components/Sidebar.js';
import { navigate } from '../router.js';

function renderSnippet(snippet: string): Node[] {
  // Allow only <mark>...</mark> tags. Everything else is text.
  const out: Node[] = [];
  const parts = snippet.split(/(<mark>|<\/mark>)/);
  let inMark = false;
  for (const p of parts) {
    if (p === '<mark>') { inMark = true; continue; }
    if (p === '</mark>') { inMark = false; continue; }
    if (inMark) {
      const m = document.createElement('mark');
      m.textContent = p;
      out.push(m);
    } else {
      out.push(document.createTextNode(p));
    }
  }
  return out;
}

export async function renderSearch(subject: string, version: string, q: string): Promise<HTMLElement> {
  const manifest = await api.getManifest(subject, version);
  const sidebar = await renderSidebar({ manifest, subject, version });

  const main = h('article', { class: 'search-page' },
    h('h1', null, 'Search'),
    h('form', {
      onsubmit: (e: SubmitEvent) => {
        e.preventDefault();
        const input = (e.target as HTMLFormElement).querySelector<HTMLInputElement>('input[name=q]');
        navigate(`/wiki/${subject}/${version}/search?q=${encodeURIComponent(input?.value ?? '')}`);
      },
    },
      h('input', { type: 'text', name: 'q', value: q, placeholder: 'Search terms…' }),
      h('button', { type: 'submit' }, 'Search'),
    ),
  );

  if (q) {
    try {
      const { results } = await api.search(subject, version, q);
      main.appendChild(
        h('ul', { class: 'search-results' },
          ...results.map((r) =>
            h('li', { class: r.doc_type },
              h('span', { class: 'doc-type' }, r.doc_type),
              ' ',
              h('span', { class: 'doc-id' }, r.doc_id),
              h('p', { class: 'snippet' }, ...renderSnippet(r.snippet)),
            ),
          ),
        ),
      );
      if (results.length === 0) main.appendChild(h('p', null, 'No results.'));
    } catch (e: any) {
      main.appendChild(h('p', { class: 'error' }, `Search failed: ${e.message}`));
    }
  }

  return h('div', { class: 'layout' }, sidebar, main);
}
