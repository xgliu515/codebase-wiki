import { h, clear } from '../dom.js';
import { api } from '../api/client.js';
import { userStore } from '../state.js';

export function renderAdminUpload(): HTMLElement {
  const u = userStore.get();
  if (!u || !u.is_admin) {
    return h('main', { class: 'admin' },
      h('h1', null, 'Admin upload'),
      h('p', null, 'Forbidden. Admin role required.'),
    );
  }

  const status = h('div', { class: 'upload-status' });

  const fileInput = h('input', { type: 'file', accept: '.gz,.tgz,application/gzip' });
  const forceCheckbox = h('input', { type: 'checkbox', id: 'force' });

  const renderProgress = (frac: number, fileName: string, fileSize: number) => {
    clear(status);
    const pct = Math.round(frac * 100);
    const sentMb = (frac * fileSize / 1024 / 1024).toFixed(2);
    const totalMb = (fileSize / 1024 / 1024).toFixed(2);
    status.appendChild(
      h('div', { class: 'upload-progress' },
        h('div', { class: 'upload-progress-label' },
          h('span', null, `Uploading ${fileName}`),
          h('span', { class: 'upload-progress-pct' }, `${pct}% — ${sentMb} / ${totalMb} MB`),
        ),
        h('div', { class: 'upload-progress-bar' },
          h('div', { class: 'upload-progress-fill', style: `width: ${pct}%` }),
        ),
      ),
    );
  };

  const submit = h('button', {
    onclick: async () => {
      const file = fileInput.files?.[0];
      if (!file) {
        clear(status);
        status.appendChild(h('p', { class: 'error' }, 'Pick a file first.'));
        return;
      }
      submit.disabled = true;
      renderProgress(0, file.name, file.size);
      try {
        const r = await api.uploadWiki(file, {
          force: forceCheckbox.checked,
          onProgress: (frac) => renderProgress(frac, file.name, file.size),
        });
        clear(status);
        status.appendChild(h('p', { class: 'success' }, `✓ Uploaded ${r.subject} ${r.version}`));
      } catch (e: any) {
        clear(status);
        status.appendChild(h('p', { class: 'error' }, `✗ ${e.code}: ${e.message}`));
      } finally {
        submit.disabled = false;
      }
    },
  }, 'Upload');

  return h('main', { class: 'admin' },
    h('h1', null, 'Upload wikipkg'),
    h('p', null, 'Select a .wikipkg.tar.gz file produced by ', h('code', null, 'wikipkg pack'), '.'),
    h('div', { class: 'upload-form' },
      fileInput,
      h('label', null, forceCheckbox, ' Force overwrite if version exists'),
      submit,
    ),
    status,
  );
}
