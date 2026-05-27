import { h } from '../dom.js';
import { api } from '../api/client.js';
import { renderMarkdown } from '../components/MarkdownRenderer.js';
import { renderSidebar } from '../components/Sidebar.js';
import { navigate } from '../router.js';

export async function renderTourOverview(subject: string, version: string, tourId: string): Promise<HTMLElement> {
  const [manifest, tour] = await Promise.all([
    api.getManifest(subject, version),
    api.getTour(subject, version, tourId),
  ]);
  const sidebar = await renderSidebar({ manifest, subject, version, activeId: `tour:${tourId}` });
  const main = h('article', { class: 'tour-overview' },
    h('h1', null, tour.title),
    h('ol', null,
      ...tour.steps.map((s) =>
        h('li', null,
          h('a', {
            href: `/wiki/${subject}/${version}/tour/${tourId}/${s.order}`,
            onclick: (e: MouseEvent) => {
              e.preventDefault();
              navigate(`/wiki/${subject}/${version}/tour/${tourId}/${s.order}`);
            },
          }, s.title),
        ),
      ),
    ),
  );
  return h('div', { class: 'layout' }, sidebar, main);
}

export async function renderTourStep(
  subject: string,
  version: string,
  tourId: string,
  stepOrder: number,
): Promise<HTMLElement> {
  const [manifest, step] = await Promise.all([
    api.getManifest(subject, version),
    api.getTourStep(subject, version, tourId, stepOrder),
  ]);
  const sidebar = await renderSidebar({ manifest, subject, version, activeId: `tour:${tourId}:${stepOrder}` });
  const tour = manifest.tours.find((t) => t.id === tourId)!;
  const idx = tour.steps.findIndex((s) => s.order === stepOrder);
  const prev = tour.steps[idx - 1];
  const next = tour.steps[idx + 1];

  const main = h('article', { class: 'tour-step' },
    h('div', { class: 'breadcrumb' },
      h('a', {
        href: `/wiki/${subject}/${version}/tour/${tourId}`,
        onclick: (e: MouseEvent) => { e.preventDefault(); navigate(`/wiki/${subject}/${version}/tour/${tourId}`); },
      }, tour.title), ' › ', step.title),
    h('h1', null, `Step ${step.order}: ${step.title}`),
    renderMarkdown(step.markdown, { subject, version, manifest }),
    h('nav', { class: 'tour-nav' },
      prev && h('a', {
        'data-nav': 'prev',
        href: `/wiki/${subject}/${version}/tour/${tourId}/${prev.order}`,
        onclick: (e: MouseEvent) => { e.preventDefault(); navigate(`/wiki/${subject}/${version}/tour/${tourId}/${prev.order}`); },
      }, `← ${prev.title}`),
      next && h('a', {
        'data-nav': 'next',
        href: `/wiki/${subject}/${version}/tour/${tourId}/${next.order}`,
        onclick: (e: MouseEvent) => { e.preventDefault(); navigate(`/wiki/${subject}/${version}/tour/${tourId}/${next.order}`); },
      }, `${next.title} →`),
    ),
  );
  return h('div', { class: 'layout' }, sidebar, main);
}
