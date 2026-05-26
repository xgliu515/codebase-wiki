import type { Manifest } from '@codebase-wiki/shared';
import { h } from '../dom.js';
import { navigate } from '../router.js';
import { api } from '../api/client.js';
import { userStore } from '../state.js';

export type SidebarOpts = {
  manifest: Manifest;
  subject: string;
  version: string;
  activeId?: string;  // chapterId / tour step
};

export async function renderSidebar(opts: SidebarOpts): Promise<HTMLElement> {
  const { manifest, subject, version, activeId } = opts;

  let progressBySlug: Record<string, string> = {};
  if (userStore.get()) {
    try {
      const r = await api.getProgress(subject);
      for (const p of r.progress) progressBySlug[p.chapter_id] = p.status;
    } catch { /* anonymous or error — show no checkmarks */ }
  }

  const link = (label: string, path: string, active = false, indicator = '') => {
    const a = h('a', {
      class: active ? 'side-link active' : 'side-link',
      href: path,
      onclick: (e: MouseEvent) => {
        e.preventDefault();
        navigate(path);
      },
    }, indicator, label);
    return a;
  };

  return h('aside', { class: 'sidebar' },
    h('h2', null, manifest.subject.name),
    h('div', { class: 'version' }, version),
    h('h3', null, 'Chapters'),
    h('ul', null,
      ...manifest.chapters.map((ch) =>
        h('li', null,
          link(
            ch.title,
            `/wiki/${subject}/${version}/chapter/${ch.id}`,
            activeId === ch.id,
            progressBySlug[ch.id] === 'read' ? '✓ ' : '',
          ),
        ),
      ),
    ),
    manifest.tours.length > 0 && h('h3', null, 'Tours'),
    ...manifest.tours.map((t) =>
      h('div', { class: 'tour-block' },
        link(t.title, `/wiki/${subject}/${version}/tour/${t.id}`, activeId === `tour:${t.id}`),
        h('ul', null,
          ...t.steps.map((s) =>
            h('li', null,
              link(
                `${s.order}. ${s.title}`,
                `/wiki/${subject}/${version}/tour/${t.id}/${s.order}`,
                activeId === `tour:${t.id}:${s.order}`,
              ),
            ),
          ),
        ),
      ),
    ),
    h('h3', null, 'Other'),
    h('ul', null,
      h('li', null, link('Glossary', `/wiki/${subject}/${version}/glossary`)),
      h('li', null, link('Search', `/wiki/${subject}/${version}/search?q=`)),
    ),
  );
}
