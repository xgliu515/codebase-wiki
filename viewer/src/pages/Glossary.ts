import { h } from '../dom.js';
import { api } from '../api/client.js';
import { renderSidebar } from '../components/Sidebar.js';

export async function renderGlossary(subject: string, version: string): Promise<HTMLElement> {
  const [manifest, glossary] = await Promise.all([
    api.getManifest(subject, version),
    api.getGlossary(subject, version),
  ]);
  const sidebar = await renderSidebar({ manifest, subject, version });
  const main = h('article', { class: 'glossary-page' },
    h('h1', null, 'Glossary'),
    glossary.terms.length === 0
      ? h('p', null, 'No terms.')
      : h('dl', null,
          ...glossary.terms.flatMap((t) => [
            h('dt', { id: `term-${t.id}` }, t.term),
            h('dd', null,
              t.aliases && t.aliases.length > 0 && h('p', { class: 'aliases' }, `aka ${t.aliases.join(', ')}`),
              h('p', null, t.definition),
              t.see_also && t.see_also.length > 0 && h('p', { class: 'see-also' }, 'See also: ', t.see_also.join(', ')),
            ),
          ]),
        ),
  );
  return h('div', { class: 'layout' }, sidebar, main);
}
