import { h } from '../dom.js';
import { api } from '../api/client.js';
import { navigate } from '../router.js';

export async function renderSubject(subject: string): Promise<HTMLElement> {
  const data = await api.listVersions(subject);
  return h('main', { class: 'subject-page' },
    h('h1', null, data.subject.name),
    h('p', null, `Language: ${data.subject.language}`),
    h('h2', null, 'Versions'),
    h('ul', { class: 'version-list' },
      ...data.versions.map((v) =>
        h('li', null,
          h('a', {
            href: `/wiki/${subject}/${v.version_label}`,
            onclick: (e: MouseEvent) => { e.preventDefault(); navigate(`/wiki/${subject}/${v.version_label}`); },
          }, v.version_label),
          ' ',
          h('span', { class: 'meta' }, new Date(v.uploaded_at).toLocaleDateString()),
        ),
      ),
    ),
  );
}
