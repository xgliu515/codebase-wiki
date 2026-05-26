import { h, clear } from '../dom.js';
import { api } from '../api/client.js';
import { userStore } from '../state.js';
import { navigate } from '../router.js';

export async function renderAdminConsole(): Promise<HTMLElement> {
  const u = userStore.get();
  if (!u || !u.is_admin) {
    return h('main', { class: 'admin' },
      h('div', { class: 'empty-state' },
        h('div', { class: 'empty-state-icon' }, '🔒'),
        h('h1', null, 'Admin only'),
        h('p', null, 'You need admin role to access this page.'),
      ),
    );
  }

  const main = h('main', { class: 'admin admin-console' },
    h('header', { class: 'admin-header' },
      h('h1', null, 'Admin console'),
      h('a', {
        class: 'admin-upload-link',
        href: '/admin/upload',
        onclick: (e: MouseEvent) => { e.preventDefault(); navigate('/admin/upload'); },
      }, '+ Upload new wiki'),
    ),
    h('div', { class: 'admin-body' }, h('p', null, 'Loading…')),
  );

  refresh(main);
  return main;
}

async function refresh(root: HTMLElement) {
  const body = root.querySelector<HTMLElement>('.admin-body')!;
  clear(body);

  let data: Awaited<ReturnType<typeof api.adminListAll>>;
  try {
    data = await api.adminListAll();
  } catch (e: any) {
    body.appendChild(h('p', { class: 'error' }, `Failed to load: ${e.message}`));
    return;
  }

  if (data.subjects.length === 0) {
    body.appendChild(h('p', { class: 'empty' }, 'No wikis uploaded yet.'));
    return;
  }

  for (const s of data.subjects) {
    body.appendChild(renderSubjectBlock(s, root));
  }
}

function renderSubjectBlock(
  s: Awaited<ReturnType<typeof api.adminListAll>>['subjects'][number],
  root: HTMLElement,
): HTMLElement {
  const block = h('section', { class: 'admin-subject' },
    h('div', { class: 'admin-subject-head' },
      h('h2', null, s.name),
      h('code', { class: 'admin-subject-slug' }, s.slug),
      s.description && h('p', { class: 'admin-subject-desc' }, s.description),
    ),
    h('table', { class: 'admin-version-table' },
      h('thead', null,
        h('tr', null,
          h('th', null, 'Version'),
          h('th', null, 'Schema'),
          h('th', null, 'Uploaded'),
          h('th', null, 'Status'),
          h('th', { class: 'col-actions' }, 'Actions'),
        ),
      ),
      h('tbody', null,
        ...s.versions.map((v) => renderVersionRow(s.slug, s.latest_version, v, root)),
      ),
    ),
  );
  return block;
}

function renderVersionRow(
  subjectSlug: string,
  latestVersion: string | null,
  v: Awaited<ReturnType<typeof api.adminListAll>>['subjects'][number]['versions'][number],
  root: HTMLElement,
): HTMLElement {
  const isLatest = v.version_label === latestVersion;
  const isDeleted = v.deleted_at !== null;

  const statusBadges: HTMLElement[] = [];
  if (isLatest) statusBadges.push(h('span', { class: 'badge badge-latest' }, 'latest'));
  if (isDeleted) statusBadges.push(h('span', { class: 'badge badge-deleted' }, 'deleted'));
  if (!isLatest && !isDeleted) statusBadges.push(h('span', { class: 'badge badge-active' }, 'active'));

  const actions: HTMLElement[] = [];

  if (!isDeleted && !isLatest) {
    actions.push(h('button', {
      class: 'btn-small',
      onclick: async () => {
        try {
          await api.adminSetLatest(subjectSlug, v.version_label);
          refresh(root);
        } catch (e: any) {
          alert(`Set latest failed: ${e.message}`);
        }
      },
    }, 'Set latest'));
  }

  if (!isDeleted) {
    actions.push(h('button', {
      class: 'btn-small btn-danger',
      onclick: async () => {
        const confirmed = confirm(
          `Delete ${subjectSlug}/${v.version_label}?\n\nThis is a soft-delete — wiki content stays on disk, but the version disappears from public listing and search. User progress / attempts / addenda are preserved.`,
        );
        if (!confirmed) return;
        try {
          await api.adminDeleteWiki(subjectSlug, v.version_label);
          refresh(root);
        } catch (e: any) {
          alert(`Delete failed: ${e.message}`);
        }
      },
    }, 'Delete'));
  }

  return h('tr', { class: isDeleted ? 'admin-version-row deleted' : 'admin-version-row' },
    h('td', null, h('code', null, v.version_label)),
    h('td', null, h('code', { class: 'admin-schema' }, v.schema_version)),
    h('td', null, new Date(v.uploaded_at).toLocaleString()),
    h('td', null, ...statusBadges),
    h('td', { class: 'col-actions' }, ...actions),
  );
}
