import { h } from '../dom.js';
import { userStore } from '../state.js';
import { api } from '../api/client.js';
import { navigate } from '../router.js';

type SubjectListItem = Awaited<ReturnType<typeof api.listSubjects>>['subjects'][number];
type ProgressRow = Awaited<ReturnType<typeof api.getProgress>>['progress'][number];

export async function renderMe(): Promise<HTMLElement> {
  const u = userStore.get();
  if (!u) {
    return h('main', { class: 'me-page' },
      h('div', { class: 'empty-state' },
        h('div', { class: 'empty-state-icon' }, '🙂'),
        h('h1', null, 'Not signed in'),
        h('p', null, 'Sign in to see your reading progress, recent quiz attempts, and the questions you posted.'),
        h('div', { class: 'empty-state-actions' },
          h('a', { href: '/api/v1/auth/github/start' }, 'Sign in with GitHub'),
        ),
      ),
    );
  }

  // Header skeleton, fill content async
  const header = h('header', { class: 'me-header' },
    u.avatar_url && h('img', { class: 'me-avatar', src: u.avatar_url, alt: u.login }),
    h('div', { class: 'me-identity' },
      h('h1', null, u.display_name ?? u.login),
      h('p', { class: 'me-handle' }, '@', u.login, u.is_admin && h('span', { class: 'me-admin-badge' }, 'admin')),
    ),
  );

  const progressSection = h('section', { class: 'me-section' },
    h('h2', null, 'Reading progress'),
    h('div', { class: 'me-section-body' }, h('p', { class: 'me-loading' }, 'Loading…')),
  );

  const attemptsSection = h('section', { class: 'me-section' },
    h('h2', null, 'Recent quiz attempts'),
    h('div', { class: 'me-section-body' }, h('p', { class: 'me-loading' }, 'Loading…')),
  );

  const addendaSection = h('section', { class: 'me-section' },
    h('h2', null, 'Your Q&A posts'),
    h('div', { class: 'me-section-body' }, h('p', { class: 'me-loading' }, 'Loading…')),
  );

  const main = h('main', { class: 'me-page' }, header, progressSection, attemptsSection, addendaSection);

  // Fire all three lookups in parallel
  void hydrateProgress(progressSection);
  void hydrateAttempts(attemptsSection);
  void hydrateAddenda(addendaSection);

  return main;
}

async function hydrateProgress(section: HTMLElement) {
  const body = section.querySelector<HTMLElement>('.me-section-body')!;
  const { subjects } = await api.listSubjects();
  if (subjects.length === 0) {
    replace(body, h('p', { class: 'me-empty' }, 'No wikis published yet.'));
    return;
  }
  const rows = await Promise.all(
    subjects.map(async (s: SubjectListItem) => {
      try {
        const p = await api.getProgress(s.slug);
        return { subject: s, progress: p.progress };
      } catch {
        return { subject: s, progress: [] as ProgressRow[] };
      }
    }),
  );
  // Need per-subject chapter total. Fetch manifest of latest version.
  const totals = await Promise.all(
    rows.map(async ({ subject }) => {
      if (!subject.latest_version) return { slug: subject.slug, total: 0 };
      try {
        const m = await api.getManifest(subject.slug, subject.latest_version);
        return { slug: subject.slug, total: m.chapters.length };
      } catch {
        return { slug: subject.slug, total: 0 };
      }
    }),
  );
  const totalBySlug = new Map(totals.map((t) => [t.slug, t.total]));

  const cards = rows.map(({ subject, progress }) => {
    const read = progress.filter((p) => p.status === 'read').length;
    const total = totalBySlug.get(subject.slug) ?? 0;
    const pct = total > 0 ? Math.round((read / total) * 100) : 0;
    const targetVersion = subject.latest_version ?? '';
    const link = targetVersion
      ? `/wiki/${subject.slug}/${targetVersion}`
      : `/wiki/${subject.slug}`;

    return h('a', {
      class: 'me-progress-card',
      href: link,
      onclick: (e: MouseEvent) => { e.preventDefault(); navigate(link); },
    },
      h('div', { class: 'me-progress-card-head' },
        h('div', { class: 'me-progress-card-title' }, subject.name),
        h('div', { class: 'me-progress-card-stats' }, `${read} / ${total} chapters`),
      ),
      h('div', { class: 'me-progress-bar' },
        h('div', { class: 'me-progress-bar-fill', style: `width: ${pct}%` }),
      ),
      h('div', { class: 'me-progress-card-meta' },
        h('span', null, `${pct}% complete`),
        subject.latest_version && h('span', { class: 'version-tag' }, subject.latest_version),
      ),
    );
  });

  replace(body, h('div', { class: 'me-progress-grid' }, ...cards));
}

async function hydrateAttempts(section: HTMLElement) {
  const body = section.querySelector<HTMLElement>('.me-section-body')!;
  try {
    const { attempts } = await api.myRecentAttempts(10);
    if (attempts.length === 0) {
      replace(body, h('p', { class: 'me-empty' }, 'No quiz attempts yet.'));
      return;
    }
    replace(body, h('ul', { class: 'me-attempts' },
      ...attempts.map((a) => {
        const pct = Math.round(a.score * 100);
        const d = new Date(a.attempted_at);
        const date = d.toLocaleDateString();
        const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const link = `/wiki/${a.subject_slug}/${a.version_label}/chapter/${a.chapter_id}/quiz`;
        const tier = a.score === 1 ? 'perfect' : a.score >= 0.6 ? 'good' : 'low';
        return h('li', { class: 'me-attempt-row' },
          h('a', {
            class: 'me-attempt-link',
            href: link,
            onclick: (e: MouseEvent) => { e.preventDefault(); navigate(link); },
          },
            h('span', { class: `me-attempt-score ${tier}` }, `${pct}%`),
            h('span', { class: 'me-attempt-where' }, `${a.subject_slug} · ${a.chapter_id}`),
            h('span', { class: 'me-attempt-when' }, `${date} ${time}`),
          ),
        );
      }),
    ));
  } catch (e: any) {
    replace(body, h('p', { class: 'me-empty' }, `Failed: ${e.message}`));
  }
}

async function hydrateAddenda(section: HTMLElement) {
  const body = section.querySelector<HTMLElement>('.me-section-body')!;
  try {
    const { addenda } = await api.myAddenda(10);
    if (addenda.length === 0) {
      replace(body, h('p', { class: 'me-empty' }, 'No Q&A posts yet.'));
      return;
    }
    replace(body, h('ul', { class: 'me-addenda' },
      ...addenda.map((a) => {
        const link = `/wiki/${a.subject_slug}/${a.version_label}/chapter/${a.chapter_id}`;
        const date = new Date(a.created_at).toLocaleDateString();
        return h('li', { class: 'me-addendum-row' },
          h('a', {
            class: 'me-addendum-link',
            href: link,
            onclick: (e: MouseEvent) => { e.preventDefault(); navigate(link); },
          },
            h('div', { class: 'me-addendum-question' }, a.question),
            h('div', { class: 'me-addendum-meta' },
              h('span', null, `${a.subject_slug} · ${a.chapter_id}`),
              h('span', null, date),
            ),
          ),
        );
      }),
    ));
  } catch (e: any) {
    replace(body, h('p', { class: 'me-empty' }, `Failed: ${e.message}`));
  }
}

function replace(container: HTMLElement, node: Node): void {
  while (container.firstChild) container.removeChild(container.firstChild);
  container.appendChild(node);
}
