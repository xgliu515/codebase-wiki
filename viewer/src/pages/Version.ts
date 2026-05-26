import { h } from '../dom.js';
import { api } from '../api/client.js';
import { renderSidebar } from '../components/Sidebar.js';
import { navigate } from '../router.js';

export async function renderVersion(subject: string, version: string): Promise<HTMLElement> {
  const manifest = await api.getManifest(subject, version);
  const sidebar = await renderSidebar({ manifest, subject, version });

  const repoLink = manifest.source.type === 'codebase'
    ? h('a', {
        href: manifest.source.codebase.repo_url,
        target: '_blank',
        rel: 'noopener',
      }, manifest.source.codebase.repo_url)
    : null;

  const chapterCards = manifest.chapters
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((ch) =>
      h('li', { class: 'chapter-card' },
        h('a', {
          href: `/wiki/${subject}/${version}/chapter/${ch.id}`,
          onclick: (e: MouseEvent) => {
            e.preventDefault();
            navigate(`/wiki/${subject}/${version}/chapter/${ch.id}`);
          },
        },
          h('span', { class: 'chapter-order' }, String(ch.order).padStart(2, '0')),
          h('span', { class: 'chapter-title' }, ch.title),
          ch.estimated_minutes && h('span', { class: 'chapter-mins' }, `${ch.estimated_minutes} min`),
        ),
      ),
    );

  const tourList = manifest.tours.length === 0
    ? null
    : h('section', { class: 'tours-section' },
        h('h2', null, 'Trace tours'),
        h('ul', { class: 'tour-list' },
          ...manifest.tours.map((t) =>
            h('li', null,
              h('a', {
                href: `/wiki/${subject}/${version}/tour/${t.id}`,
                onclick: (e: MouseEvent) => {
                  e.preventDefault();
                  navigate(`/wiki/${subject}/${version}/tour/${t.id}`);
                },
              }, t.title),
              h('span', { class: 'tour-step-count' }, ` — ${t.steps.length} step${t.steps.length === 1 ? '' : 's'}`),
            ),
          ),
        ),
      );

  const main = h('article', { class: 'version-overview' },
    h('h1', null, manifest.subject.name),
    h('p', { class: 'subtitle' },
      h('strong', null, version),
      ` · generated ${new Date(manifest.wiki_version.generated_at).toLocaleDateString()}`,
      manifest.source.type === 'codebase' && ` · commit ${manifest.source.codebase.target_commit}`,
    ),
    manifest.subject.description && h('p', { class: 'description' }, manifest.subject.description),
    repoLink && h('p', { class: 'source-link' }, 'Source: ', repoLink),

    h('section', { class: 'chapters-section' },
      h('h2', null, 'Reference chapters'),
      manifest.chapters.length === 0
        ? h('p', null, 'No chapters in this version.')
        : h('ul', { class: 'chapter-grid' }, ...chapterCards),
    ),

    tourList,

    h('section', { class: 'other-section' },
      h('h2', null, 'Other'),
      h('ul', null,
        h('li', null,
          h('a', {
            href: `/wiki/${subject}/${version}/glossary`,
            onclick: (e: MouseEvent) => {
              e.preventDefault();
              navigate(`/wiki/${subject}/${version}/glossary`);
            },
          }, 'Glossary'),
          ` (${0 /* lazy count, can fetch */} terms — see panel)`,
        ),
        h('li', null,
          h('a', {
            href: `/wiki/${subject}/${version}/search?q=`,
            onclick: (e: MouseEvent) => {
              e.preventDefault();
              navigate(`/wiki/${subject}/${version}/search?q=`);
            },
          }, 'Search'),
        ),
      ),
    ),
  );

  return h('div', { class: 'layout' }, sidebar, main);
}
