import { h } from '../dom.js';
import { userStore } from '../state.js';
import { api } from '../api/client.js';

export async function renderMe(): Promise<HTMLElement> {
  const u = userStore.get();
  if (!u) {
    return h('main', { class: 'me-page' },
      h('p', null, 'Not signed in.'),
      h('a', { href: '/api/v1/auth/github/start' }, 'Sign in with GitHub'),
    );
  }

  const { subjects } = await api.listSubjects();
  const progressBySubject: Record<string, any[]> = {};
  for (const s of subjects) {
    try {
      const p = await api.getProgress(s.slug);
      progressBySubject[s.slug] = p.progress;
    } catch { progressBySubject[s.slug] = []; }
  }

  return h('main', { class: 'me-page' },
    h('h1', null, `Hi, ${u.display_name ?? u.login}`),
    u.is_admin && h('p', null, h('em', null, '(admin)')),
    h('h2', null, 'Your progress'),
    h('ul', null,
      ...subjects.map((s) =>
        h('li', null,
          h('strong', null, s.name),
          ': ',
          `${progressBySubject[s.slug]!.filter((p) => p.status === 'read').length} chapters read`,
        ),
      ),
    ),
  );
}
