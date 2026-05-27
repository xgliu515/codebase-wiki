import { ManifestSchema, type Manifest, type RedactedQuiz, type Glossary } from '@codebase-wiki/shared';
import { ApiError, type AuthMe, type SubjectListItem, type VersionListItem, type Addendum, type SearchHit } from './types.js';

async function jget<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'same-origin', ...opts });
  if (!res.ok) {
    let body: { error?: string; message?: string } = {};
    try { body = await res.json(); } catch {}
    throw new ApiError(res.status, body.error ?? 'http_error', body.message ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

async function jpost<T>(path: string, body: unknown, opts?: RequestInit): Promise<T> {
  return jget<T>(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    ...opts,
  });
}

async function jput<T>(path: string, body: unknown): Promise<T> {
  return jget<T>(path, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export const api = {
  // Auth
  me: () => jget<AuthMe>('/api/v1/auth/me'),
  logout: () => jpost('/api/v1/auth/logout', {}),

  // Wikis read
  listSubjects: () => jget<{ subjects: SubjectListItem[] }>('/api/v1/wikis'),
  listVersions: (subject: string) =>
    jget<{ subject: SubjectListItem; versions: VersionListItem[] }>(`/api/v1/wikis/${subject}`),
  getManifest: async (subject: string, version: string): Promise<Manifest> => {
    const raw = await jget<unknown>(`/api/v1/wikis/${subject}/${version}/manifest`);
    return ManifestSchema.parse(raw);
  },
  getChapter: (subject: string, version: string, chapterId: string) =>
    jget<{ id: string; title: string; order: number; markdown: string }>(
      `/api/v1/wikis/${subject}/${version}/chapters/${chapterId}`,
    ),
  getTour: (subject: string, version: string, tourId: string) =>
    jget<{ id: string; title: string; steps: Array<{ order: number; title: string; path: string }> }>(
      `/api/v1/wikis/${subject}/${version}/tours/${tourId}`,
    ),
  getTourStep: (subject: string, version: string, tourId: string, order: number) =>
    jget<{ order: number; title: string; markdown: string }>(
      `/api/v1/wikis/${subject}/${version}/tours/${tourId}/steps/${order}`,
    ),
  getGlossary: (subject: string, version: string) =>
    jget<Glossary>(`/api/v1/wikis/${subject}/${version}/glossary`),
  getRedactedQuiz: (subject: string, version: string, chapterId: string) =>
    jget<RedactedQuiz>(`/api/v1/wikis/${subject}/${version}/quizzes/${chapterId}`),
  search: (subject: string, version: string, q: string) =>
    jget<{ results: SearchHit[] }>(
      `/api/v1/wikis/${subject}/${version}/search?q=${encodeURIComponent(q)}`,
    ),

  // Quiz attempt (write)
  submitAttempt: (
    subject: string,
    version: string,
    chapterId: string,
    answers: Record<string, string[]>,
  ) =>
    jpost<{
      attempt_id: number;
      score: number;
      question_count: number;
      results: Array<{
        qid: string;
        user_answer: string[];
        correct: boolean;
        correct_answer: string[];
        explanation?: string;
      }>;
    }>(`/api/v1/wikis/${subject}/${version}/quizzes/${chapterId}/attempts`, { answers }),

  listAttempts: (subject: string, version: string, chapterId: string) =>
    jget<{ attempts: Array<{ id: number; attempted_at: number; score: number; question_count: number; results: any[] }> }>(
      `/api/v1/wikis/${subject}/${version}/quizzes/${chapterId}/attempts`,
    ),

  // Progress
  setProgress: (subject: string, version: string, chapterId: string, status: 'read' | 'unread') =>
    jput(`/api/v1/wikis/${subject}/${version}/progress/${chapterId}`, { status }),
  getProgress: (subject: string) =>
    jget<{ progress: Array<{ chapter_id: string; status: string; last_version_label: string; marked_at: number }> }>(
      `/api/v1/wikis/${subject}/progress`,
    ),

  // Addenda
  listAddenda: (subject: string, version: string, chapterId: string) =>
    jget<{ addenda: Addendum[] }>(
      `/api/v1/wikis/${subject}/${version}/chapters/${chapterId}/addenda`,
    ),
  postAddendum: (subject: string, version: string, chapterId: string, question: string, answer?: string) =>
    jpost<{ id: number; ok: true }>(
      `/api/v1/wikis/${subject}/${version}/chapters/${chapterId}/addenda`,
      { question, answer },
    ),

  // Admin
  // Uses XMLHttpRequest (not fetch) so upload progress can be reported.
  // onProgress receives a float in [0..1] for sent bytes.
  uploadWiki: (
    file: File,
    opts: { force?: boolean; onProgress?: (frac: number) => void } = {},
  ): Promise<{ subject: string; version: string }> => {
    const url = opts.force ? '/api/v1/admin/wikis?force=true' : '/api/v1/admin/wikis';
    return new Promise((resolveOK, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      xhr.setRequestHeader('content-type', 'application/gzip');
      xhr.withCredentials = true;
      if (opts.onProgress) {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable && e.total > 0) opts.onProgress!(e.loaded / e.total);
        });
      }
      xhr.onload = () => {
        let body: { error?: string; message?: string; subject?: string; version?: string } = {};
        try { body = JSON.parse(xhr.responseText); } catch { /* ignore */ }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolveOK({ subject: body.subject ?? '', version: body.version ?? '' });
        } else {
          reject(new ApiError(xhr.status, body.error ?? 'upload_failed', body.message ?? `HTTP ${xhr.status}`));
        }
      };
      xhr.onerror = () => reject(new ApiError(0, 'network_error', 'Upload network error'));
      xhr.send(file);
    });
  },

  adminListAll: () =>
    jget<{
      subjects: Array<{
        slug: string;
        name: string;
        description: string | null;
        language: string;
        content_type: string;
        latest_version: string | null;
        created_at: number;
        updated_at: number;
        versions: Array<{
          subject_slug: string;
          version_label: string;
          schema_version: string;
          uploaded_at: number;
          uploaded_by: number;
          deleted_at: number | null;
        }>;
      }>;
    }>('/api/v1/admin/wikis'),

  adminDeleteWiki: async (subject: string, version: string): Promise<void> => {
    const res = await fetch(`/api/v1/admin/wikis/${subject}/${version}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    });
    if (!res.ok) {
      const body = await res.json();
      throw new ApiError(res.status, body.error ?? 'delete_failed', body.message ?? 'delete failed');
    }
  },

  adminSetLatest: (subject: string, version: string) =>
    jpost<{ ok: true; subject: string; latest_version: string }>(
      `/api/v1/admin/wikis/${subject}/${version}/latest`,
      {},
    ),

  // Per-user dashboard
  myRecentAttempts: (limit = 20) =>
    jget<{
      attempts: Array<{
        id: number;
        subject_slug: string;
        version_label: string;
        chapter_id: string;
        attempted_at: number;
        score: number;
        question_count: number;
      }>;
    }>(`/api/v1/me/recent-attempts?limit=${limit}`),

  myAddenda: (limit = 20) =>
    jget<{
      addenda: Array<{
        id: number;
        subject_slug: string;
        version_label: string;
        chapter_id: string;
        question: string;
        answer: string | null;
        created_at: number;
      }>;
    }>(`/api/v1/me/addenda?limit=${limit}`),
};
