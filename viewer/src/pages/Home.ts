import { h } from '../dom.js';
import { api } from '../api/client.js';
import { navigate } from '../router.js';

export async function renderHome(): Promise<HTMLElement> {
  const { subjects } = await api.listSubjects();
  return h('main', { class: 'home' },
    h('h1', null, 'Available wikis'),
    subjects.length === 0
      ? h('p', null, 'No wikis uploaded yet.')
      : h('ul', { class: 'subject-list' },
          ...subjects.map((s) =>
            h('li', null,
              h('a', {
                href: `/wiki/${s.slug}` + (s.latest_version ? `/${s.latest_version}` : ''),
                onclick: (e: MouseEvent) => {
                  e.preventDefault();
                  navigate(`/wiki/${s.slug}` + (s.latest_version ? `/${s.latest_version}` : ''));
                },
              },
                h('h2', null, s.name),
                s.description && h('p', null, s.description),
                s.latest_version && h('span', { class: 'version-tag' }, s.latest_version),
              ),
            ),
          ),
        ),
  );
}
