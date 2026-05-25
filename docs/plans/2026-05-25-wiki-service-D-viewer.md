# Plan D: Viewer 改造(vanilla TS + esbuild + bundle)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `templates/web/js/` 现有 vanilla JS viewer 重写为 TS modular viewer,放在 `viewer/` workspace,通过 esbuild 打成单文件 `bundle.js`,由 Plan B 服务的 `/static/` 端点托管。新增组件:AuthButton、QuizCard、ProgressBar、AddendaList、AdminUpload。删除组件:chapters.js / versions.js / architecture.js(都由 manifest API 替代)。

**Architecture:** History API 路由 + 服务端 HTML shell + `window.__INITIAL__` 注入。Markdown 仍然客户端渲染(via `marked` from CDN/npm)。Glossary 弹层、搜索、Tour、Quiz、Addenda、Progress 都通过 `/api/v1/*` 拉数据。无前端框架(允许一个 ~150 行 `h()` 辅助函数)。

**Tech Stack:** TypeScript 5,esbuild,marked,zod(from `@codebase-wiki/shared`),no testing framework for viewer(手动浏览器验证 + 服务端 vitest 已覆盖 API);可选:vitest + happy-dom 加少量 DOM 测试。

**Spec:** `docs/specs/2026-05-25-codebase-wiki-service-design.md` §5

**Predecessor:** Plan B(`/static/bundle.js` 由服务 mount,API endpoints 可用)+ Plan C(交互 endpoints)。

**Path conventions:** 单行 commit message,Edit/Write,无 Co-Authored-By。

---

## Task 1: `viewer/` workspace scaffold

**Files:**
- Create: `viewer/package.json`
- Create: `viewer/tsconfig.json`
- Create: `viewer/src/main.ts`
- Create: `viewer/index.html` (dev template, not shipped)
- Modify: 根 `package.json` workspaces

- [ ] **Step 1: Update root `package.json`**

Change:
```json
  "workspaces": ["shared", "tools/*", "server"],
```
To:
```json
  "workspaces": ["shared", "tools/*", "server", "viewer"],
```

- [ ] **Step 2: 写 `viewer/package.json`**

```json
{
  "name": "@codebase-wiki/viewer",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "esbuild src/main.ts --bundle --outfile=dist/bundle.js --sourcemap --watch --servedir=. --serve=8080",
    "build": "tsc --noEmit && esbuild src/main.ts --bundle --outfile=dist/bundle.js --sourcemap --minify",
    "check": "tsc --noEmit"
  },
  "dependencies": {
    "@codebase-wiki/shared": "*",
    "marked": "^14.0.0"
  },
  "devDependencies": {
    "esbuild": "^0.24.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 3: 写 `viewer/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "outDir": "./dist",
    "rootDir": "./src",
    "types": []
  },
  "include": ["src/**/*"]
}
```

(Note: `"types": []` overrides base `["node"]` since viewer runs in browser, not Node.)

- [ ] **Step 4: 写占位 `viewer/src/main.ts`**

```ts
const app = document.querySelector('#app');
if (app) {
  app.textContent = 'viewer scaffold loaded';
}
console.log('viewer build:', (window as any).__INITIAL__);
```

- [ ] **Step 5: 写 dev `viewer/index.html`** (for esbuild --servedir local dev)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>viewer dev</title>
</head>
<body>
  <div id="app">loading…</div>
  <script>
    window.__INITIAL__ = { user: null, build: { version: 'dev' } };
  </script>
  <script type="module" src="dist/bundle.js"></script>
</body>
</html>
```

- [ ] **Step 6: install + check + smoke build**

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && npm install
cd /Users/xgliu/Documents/git/codebase-wiki && npm run check --workspace @codebase-wiki/viewer
cd /Users/xgliu/Documents/git/codebase-wiki && npm run build --workspace @codebase-wiki/viewer
ls -la viewer/dist/bundle.js
```
Expected: bundle.js produced, < 100KB.

- [ ] **Step 7: commit**

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && git add viewer/ package.json package-lock.json && git commit -m "viewer/: workspace scaffold (TS + esbuild bundling)"
```

---

## Task 2: API client (typed fetch wrappers)

**Files:**
- Create: `viewer/src/api/client.ts`
- Create: `viewer/src/api/types.ts`

**Context:** Single source of `fetch()` calls to `/api/v1/*`. All responses are validated via `@codebase-wiki/shared` schemas where applicable. Returns typed data or throws `ApiError`.

- [ ] **Step 1: 写 `viewer/src/api/types.ts`**

```ts
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export type AuthMe = {
  id: number;
  login: string;
  display_name: string | null;
  avatar_url: string | null;
  is_admin: boolean;
};

export type SubjectListItem = {
  slug: string;
  name: string;
  description: string | null;
  language: string;
  latest_version: string | null;
  content_type: string;
};

export type VersionListItem = {
  version_label: string;
  schema_version: string;
  uploaded_at: number;
};

export type Addendum = {
  id: number;
  question: string;
  answer: string | null;
  created_at: number;
  author_login: string;
};

export type SearchHit = {
  doc_type: string;
  doc_id: string;
  snippet: string;
};
```

- [ ] **Step 2: 写 `viewer/src/api/client.ts`**

```ts
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
  uploadWiki: async (file: File, force = false): Promise<{ subject: string; version: string }> => {
    const url = force ? '/api/v1/admin/wikis?force=true' : '/api/v1/admin/wikis';
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/gzip' },
      body: file,
    });
    if (!res.ok) {
      const body = await res.json();
      throw new ApiError(res.status, body.error ?? 'upload_failed', body.message ?? 'upload failed');
    }
    return res.json();
  },
};
```

- [ ] **Step 3: build check**

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && npm run check --workspace @codebase-wiki/viewer
```
Expected: no TS errors.

- [ ] **Step 4: commit**

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && git add viewer/ && git commit -m "viewer/api: typed client wrapping /api/v1/* (auth + wikis + quiz + progress + addenda)"
```

---

## Task 3: Tiny DOM helper `h()` + state store + router

**Files:**
- Create: `viewer/src/dom.ts`
- Create: `viewer/src/state.ts`
- Create: `viewer/src/router.ts`

**Context:** No framework. `h()` creates DOM nodes ergonomically. `state` is a small pub-sub of user + currentRoute. `router` parses `location.pathname` into a tagged union, listens to `popstate`.

- [ ] **Step 1: 写 `viewer/src/dom.ts`**

```ts
type Child = Node | string | number | false | null | undefined;
type Props = Record<string, unknown> & {
  class?: string;
  style?: string;
  onclick?: (e: MouseEvent) => void;
  onsubmit?: (e: SubmitEvent) => void;
  oninput?: (e: InputEvent) => void;
  onchange?: (e: Event) => void;
};

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k === 'style') el.setAttribute('style', String(v));
      else if (k.startsWith('on') && typeof v === 'function') {
        el.addEventListener(k.slice(2), v as EventListener);
      } else if (k === 'html') {
        el.innerHTML = String(v);  // CAUTION — only for trusted (e.g., marked() output we trust)
      } else {
        el.setAttribute(k, String(v));
      }
    }
  }
  for (const c of children) {
    if (c === false || c === null || c === undefined) continue;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return el;
}

export function clear(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function mount(root: HTMLElement, node: Node): void {
  clear(root);
  root.appendChild(node);
}
```

- [ ] **Step 2: 写 `viewer/src/state.ts`**

```ts
import type { AuthMe } from './api/types.js';

type Listener = () => void;

class Store<T> {
  private listeners = new Set<Listener>();
  constructor(private value: T) {}
  get(): T { return this.value; }
  set(next: T): void {
    this.value = next;
    for (const fn of this.listeners) fn();
  }
  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

declare global {
  interface Window {
    __INITIAL__?: {
      user: AuthMe | null;
      build: { version: string };
    };
  }
}

export const userStore = new Store<AuthMe | null>(window.__INITIAL__?.user ?? null);
export const buildVersion = window.__INITIAL__?.build.version ?? 'unknown';
```

- [ ] **Step 3: 写 `viewer/src/router.ts`**

```ts
export type Route =
  | { kind: 'home' }
  | { kind: 'subject'; subject: string }
  | { kind: 'version'; subject: string; version: string }
  | { kind: 'chapter'; subject: string; version: string; chapterId: string }
  | { kind: 'quiz'; subject: string; version: string; chapterId: string }
  | { kind: 'tour'; subject: string; version: string; tourId: string }
  | { kind: 'tour_step'; subject: string; version: string; tourId: string; step: number }
  | { kind: 'search'; subject: string; version: string; q: string }
  | { kind: 'admin' }
  | { kind: 'admin_upload' }
  | { kind: 'me' }
  | { kind: 'notfound'; pathname: string };

export function parseRoute(pathname: string, search = ''): Route {
  if (pathname === '/' || pathname === '') return { kind: 'home' };
  if (pathname === '/me') return { kind: 'me' };
  if (pathname === '/admin') return { kind: 'admin' };
  if (pathname === '/admin/upload') return { kind: 'admin_upload' };

  const parts = pathname.replace(/^\/+|\/+$/g, '').split('/');
  if (parts[0] === 'wiki' && parts.length >= 2) {
    const subject = parts[1]!;
    if (parts.length === 2) return { kind: 'subject', subject };
    const version = parts[2]!;
    if (parts.length === 3) return { kind: 'version', subject, version };
    if (parts[3] === 'chapter' && parts[4]) {
      if (parts[5] === 'quiz') return { kind: 'quiz', subject, version, chapterId: parts[4] };
      return { kind: 'chapter', subject, version, chapterId: parts[4] };
    }
    if (parts[3] === 'tour' && parts[4]) {
      if (parts[5]) return { kind: 'tour_step', subject, version, tourId: parts[4], step: Number(parts[5]) };
      return { kind: 'tour', subject, version, tourId: parts[4] };
    }
    if (parts[3] === 'search') {
      const qp = new URLSearchParams(search);
      return { kind: 'search', subject, version, q: qp.get('q') ?? '' };
    }
  }
  return { kind: 'notfound', pathname };
}

export function navigate(path: string): void {
  history.pushState({}, '', path);
  window.dispatchEvent(new Event('cw:route'));
}

export function listenRoute(handler: (route: Route) => void): void {
  const fire = () => handler(parseRoute(location.pathname, location.search));
  window.addEventListener('popstate', fire);
  window.addEventListener('cw:route', fire);
  fire();
}
```

- [ ] **Step 4: build check**

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && npm run check --workspace @codebase-wiki/viewer
```

- [ ] **Step 5: commit**

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && git add viewer/ && git commit -m "viewer: h() DOM helper + Store pub-sub + history-API router"
```

---

## Task 4: Markdown renderer + GitHub deep-link rewriting

**Files:**
- Create: `viewer/src/components/MarkdownRenderer.ts`
- Create: `viewer/src/util/anchors.ts`

**Context:** Use `marked` to render markdown to HTML. Custom renderer step: rewrite `![alt](figures/x.svg)` to point at the API path `/api/v1/wikis/<subject>/<version>/figures/<id>` based on figureId-by-path lookup from the manifest.

- [ ] **Step 1: 写 `viewer/src/util/anchors.ts`**

```ts
export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
```

- [ ] **Step 2: 写 `viewer/src/components/MarkdownRenderer.ts`**

```ts
import { marked, Renderer } from 'marked';
import type { Manifest } from '@codebase-wiki/shared';
import { h } from '../dom.js';
import { slugifyHeading } from '../util/anchors.js';

export type RenderContext = {
  subject: string;
  version: string;
  manifest: Manifest;
};

export function renderMarkdown(md: string, ctx: RenderContext): HTMLElement {
  const renderer = new Renderer();

  renderer.image = (href, title, text) => {
    // Rewrite relative figure paths into API URLs
    if (href && !/^https?:\/\//.test(href) && !href.startsWith('/api/')) {
      // Find a figure whose path matches
      const fig = ctx.manifest.figures.find((f) => f.path === href);
      if (fig) {
        href = `/api/v1/wikis/${ctx.subject}/${ctx.version}/figures/${fig.id}`;
      } else {
        // Generic relative path → fallback to chapters dir resolution... unusual case
      }
    }
    const safe = (text ?? '').replace(/"/g, '&quot;');
    const titleAttr = title ? ` title="${title.replace(/"/g, '&quot;')}"` : '';
    return `<img src="${href}" alt="${safe}"${titleAttr} loading="lazy">`;
  };

  renderer.heading = (text, level) => {
    const id = slugifyHeading(text);
    return `<h${level} id="${id}">${text}</h${level}>`;
  };

  marked.setOptions({ renderer, gfm: true, breaks: false });

  const html = marked.parse(md) as string;
  return h('div', { class: 'markdown-body', html });
}
```

(Note: `h({html: ...})` uses `innerHTML` from the helper; marked output is trusted because it's parsed-and-sanitized by marked. For tighter security in the future, run through DOMPurify, but defer.)

- [ ] **Step 3: build check**

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && npm run build --workspace @codebase-wiki/viewer
```

- [ ] **Step 4: commit**

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && git add viewer/ && git commit -m "viewer/MarkdownRenderer: marked + figure-path → API URL rewrite + heading anchors"
```

---

## Task 5: Sidebar + chapter list + current-route highlighting

**Files:**
- Create: `viewer/src/components/Sidebar.ts`

**Context:** A sidebar always present (except on home). Pulls manifest from API, renders:
- Subject name + version dropdown
- Chapter list (ordered, marked-read indicators)
- Tour list (each with steps as nested items)
- Glossary link
- Search box

For simplicity v1: no real-time progress fetch — show progress only when user is logged in (call `/progress` once, cache).

- [ ] **Step 1: 写 `viewer/src/components/Sidebar.ts`**

```ts
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
```

- [ ] **Step 2: build check + commit**

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && npm run build --workspace @codebase-wiki/viewer
cd /Users/xgliu/Documents/git/codebase-wiki && git add viewer/ && git commit -m "viewer/Sidebar: chapters + tours + glossary/search links + progress checkmarks"
```

---

## Task 6: AuthButton + topbar

**Files:**
- Create: `viewer/src/components/AuthButton.ts`
- Create: `viewer/src/components/Topbar.ts`

**Context:** Right side of topbar. Logged-out: "Sign in with GitHub" → `/api/v1/auth/github/start`. Logged-in: avatar + dropdown (My progress, Admin if admin, Logout).

- [ ] **Step 1: 写 `viewer/src/components/AuthButton.ts`**

```ts
import { h } from '../dom.js';
import { userStore } from '../state.js';
import { api } from '../api/client.js';

export function renderAuthButton(): HTMLElement {
  const u = userStore.get();
  if (!u) {
    return h('a', {
      class: 'auth-btn',
      href: '/api/v1/auth/github/start',
    }, 'Sign in with GitHub');
  }

  const onLogout = async () => {
    await api.logout();
    userStore.set(null);
    location.reload();
  };

  return h('div', { class: 'auth-menu' },
    u.avatar_url && h('img', { class: 'avatar', src: u.avatar_url, alt: u.login }),
    h('span', { class: 'login' }, u.login),
    u.is_admin && h('a', { class: 'admin-link', href: '/admin/upload',
      onclick: (e: MouseEvent) => { e.preventDefault(); history.pushState({}, '', '/admin/upload'); window.dispatchEvent(new Event('cw:route')); }
    }, 'Admin'),
    h('a', { class: 'logout-link', href: '#', onclick: (e: MouseEvent) => { e.preventDefault(); void onLogout(); } }, 'Logout'),
  );
}
```

- [ ] **Step 2: 写 `viewer/src/components/Topbar.ts`**

```ts
import { h } from '../dom.js';
import { navigate } from '../router.js';
import { renderAuthButton } from './AuthButton.js';

export function renderTopbar(): HTMLElement {
  return h('header', { class: 'topbar' },
    h('a', {
      class: 'brand',
      href: '/',
      onclick: (e: MouseEvent) => { e.preventDefault(); navigate('/'); },
    }, 'codebase-wiki'),
    h('nav', null,
      h('a', {
        href: '/',
        onclick: (e: MouseEvent) => { e.preventDefault(); navigate('/'); },
      }, 'Subjects'),
    ),
    renderAuthButton(),
  );
}
```

- [ ] **Step 3: build + commit**

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && npm run build --workspace @codebase-wiki/viewer
cd /Users/xgliu/Documents/git/codebase-wiki && git add viewer/ && git commit -m "viewer: Topbar + AuthButton (login / avatar / admin link / logout)"
```

---

## Task 7: QuizCard component

**Files:**
- Create: `viewer/src/components/QuizCard.ts`

**Context:** Renders the redacted quiz. User selects options (radio for mcq-single, checkbox for mcq-multi). On submit: POST attempt, show results inline (correct in green, wrong in red, explanation).

- [ ] **Step 1: 写 `viewer/src/components/QuizCard.ts`**

```ts
import type { RedactedQuiz } from '@codebase-wiki/shared';
import { h, clear } from '../dom.js';
import { api } from '../api/client.js';
import { userStore } from '../state.js';

export type QuizCardOpts = {
  subject: string;
  version: string;
  chapterId: string;
};

export async function renderQuizCard(opts: QuizCardOpts): Promise<HTMLElement> {
  const { subject, version, chapterId } = opts;

  const container = h('div', { class: 'quiz-card' }, h('p', null, 'Loading quiz…'));

  if (!userStore.get()) {
    clear(container);
    container.appendChild(h('p', null, 'Sign in to take the quiz.'));
    container.appendChild(h('a', { href: '/api/v1/auth/github/start' }, 'Sign in with GitHub'));
    return container;
  }

  let quiz: RedactedQuiz;
  try {
    quiz = await api.getRedactedQuiz(subject, version, chapterId);
  } catch (e: any) {
    clear(container);
    container.appendChild(h('p', null, e.status === 404 ? 'No quiz for this chapter.' : 'Failed to load quiz.'));
    return container;
  }

  const userAnswers: Record<string, Set<string>> = {};
  for (const q of quiz.questions) userAnswers[q.id] = new Set();

  const renderForm = () => {
    clear(container);
    container.appendChild(h('h3', null, `Quiz: ${quiz.questions.length} questions`));

    for (const q of quiz.questions) {
      const optEls = q.options.map((opt) => {
        const inputType = q.type === 'mcq-single' ? 'radio' : 'checkbox';
        const input = h('input', {
          type: inputType,
          name: q.id,
          value: opt.id,
          onchange: (e: Event) => {
            const checked = (e.target as HTMLInputElement).checked;
            if (q.type === 'mcq-single') {
              userAnswers[q.id]!.clear();
              if (checked) userAnswers[q.id]!.add(opt.id);
            } else {
              if (checked) userAnswers[q.id]!.add(opt.id);
              else userAnswers[q.id]!.delete(opt.id);
            }
          },
        });
        return h('label', { class: 'quiz-option' }, input, ' ', opt.text);
      });

      container.appendChild(
        h('div', { class: 'quiz-question' },
          h('p', { class: 'stem' }, q.stem),
          ...optEls,
        ),
      );
    }

    const submitBtn = h('button', {
      class: 'submit',
      onclick: async () => {
        submitBtn.disabled = true;
        const answers: Record<string, string[]> = {};
        for (const qid of Object.keys(userAnswers)) {
          answers[qid] = [...userAnswers[qid]!];
        }
        try {
          const result = await api.submitAttempt(subject, version, chapterId, answers);
          renderResults(result);
        } catch (e: any) {
          submitBtn.disabled = false;
          alert(`Submit failed: ${e.message}`);
        }
      },
    }, 'Submit');
    container.appendChild(submitBtn);
  };

  type Result = Awaited<ReturnType<typeof api.submitAttempt>>;
  const renderResults = (result: Result) => {
    clear(container);
    container.appendChild(h('h3', null, `Score: ${Math.round(result.score * 100)}%`));
    for (const r of result.results) {
      const q = quiz.questions.find((qq) => qq.id === r.qid)!;
      container.appendChild(
        h('div', { class: 'quiz-result' + (r.correct ? ' correct' : ' incorrect') },
          h('p', { class: 'stem' }, q.stem),
          h('p', { class: 'verdict' }, r.correct ? '✓ Correct' : '✗ Incorrect'),
          h('p', { class: 'detail' }, `Your answer: ${r.user_answer.join(', ') || '(empty)'}`),
          !r.correct && h('p', { class: 'detail' }, `Correct: ${r.correct_answer.join(', ')}`),
          r.explanation && h('p', { class: 'explanation' }, r.explanation),
        ),
      );
    }
    const retry = h('button', {
      onclick: () => { for (const q of quiz.questions) userAnswers[q.id] = new Set(); renderForm(); },
    }, 'Try again');
    container.appendChild(retry);
  };

  renderForm();
  return container;
}
```

- [ ] **Step 2: build + commit**

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && npm run build --workspace @codebase-wiki/viewer
cd /Users/xgliu/Documents/git/codebase-wiki && git add viewer/ && git commit -m "viewer/QuizCard: render redacted quiz + submit + inline results with explanations"
```

---

## Task 8: AddendaList component

**Files:**
- Create: `viewer/src/components/AddendaList.ts`

- [ ] **Step 1: 写 `viewer/src/components/AddendaList.ts`**

```ts
import { h, clear } from '../dom.js';
import { api } from '../api/client.js';
import { userStore } from '../state.js';

export type AddendaListOpts = {
  subject: string;
  version: string;
  chapterId: string;
};

export async function renderAddendaList(opts: AddendaListOpts): Promise<HTMLElement> {
  const { subject, version, chapterId } = opts;
  const container = h('section', { class: 'addenda' }, h('h3', null, 'Q&A'));

  const refresh = async () => {
    const { addenda } = await api.listAddenda(subject, version, chapterId);
    const list = container.querySelector('.addenda-list');
    if (list) container.removeChild(list);
    const ul = h('ul', { class: 'addenda-list' });
    if (addenda.length === 0) {
      ul.appendChild(h('li', { class: 'empty' }, 'No questions yet.'));
    } else {
      for (const a of addenda) {
        ul.appendChild(
          h('li', null,
            h('div', { class: 'question' }, h('strong', null, 'Q: '), a.question),
            a.answer && h('div', { class: 'answer' }, h('strong', null, 'A: '), a.answer),
            h('div', { class: 'meta' }, `by ${a.author_login} on ${new Date(a.created_at).toLocaleDateString()}`),
          ),
        );
      }
    }
    container.appendChild(ul);
  };

  await refresh();

  if (userStore.get()) {
    const textarea = h('textarea', {
      placeholder: 'Ask a question about this chapter…',
      rows: '3',
    });
    const submit = h('button', {
      onclick: async () => {
        const text = textarea.value.trim();
        if (!text) return;
        submit.disabled = true;
        try {
          await api.postAddendum(subject, version, chapterId, text);
          textarea.value = '';
          await refresh();
        } catch (e: any) {
          alert(`Failed: ${e.message}`);
        } finally {
          submit.disabled = false;
        }
      },
    }, 'Submit question');
    container.appendChild(h('form', { class: 'addendum-form' }, textarea, submit));
  } else {
    container.appendChild(h('p', { class: 'signin-hint' }, 'Sign in to ask a question.'));
  }

  return container;
}
```

- [ ] **Step 2: build + commit**

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && npm run build --workspace @codebase-wiki/viewer
cd /Users/xgliu/Documents/git/codebase-wiki && git add viewer/ && git commit -m "viewer/AddendaList: per-chapter Q&A list + submit form (auth-gated)"
```

---

## Task 9: Pages — Home (subjects list), Subject (versions), Chapter, TourStep, Search, Me

**Files:**
- Create: `viewer/src/pages/Home.ts`
- Create: `viewer/src/pages/Subject.ts`
- Create: `viewer/src/pages/Chapter.ts`
- Create: `viewer/src/pages/TourStep.ts`
- Create: `viewer/src/pages/Search.ts`
- Create: `viewer/src/pages/Me.ts`

**Context:** Each page returns an HTMLElement. Composition: page = topbar + sidebar (where applicable) + main content.

- [ ] **Step 1: 写 `viewer/src/pages/Home.ts`**

```ts
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
```

- [ ] **Step 2: 写 `viewer/src/pages/Subject.ts`** (lists versions for a subject)

```ts
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
```

- [ ] **Step 3: 写 `viewer/src/pages/Chapter.ts`**

```ts
import { h } from '../dom.js';
import { api } from '../api/client.js';
import { renderMarkdown } from '../components/MarkdownRenderer.js';
import { renderSidebar } from '../components/Sidebar.js';
import { renderQuizCard } from '../components/QuizCard.js';
import { renderAddendaList } from '../components/AddendaList.js';
import { userStore } from '../state.js';
import { navigate } from '../router.js';

export async function renderChapter(
  subject: string,
  version: string,
  chapterId: string,
): Promise<HTMLElement> {
  const [manifest, chapter] = await Promise.all([
    api.getManifest(subject, version),
    api.getChapter(subject, version, chapterId),
  ]);

  const sidebar = await renderSidebar({ manifest, subject, version, activeId: chapterId });
  const content = renderMarkdown(chapter.markdown, { subject, version, manifest });

  const ch = manifest.chapters.find((x) => x.id === chapterId)!;
  const actionsRow: HTMLElement[] = [];
  if (userStore.get()) {
    const markBtn = h('button', {
      onclick: async () => {
        await api.setProgress(subject, version, chapterId, 'read');
        markBtn.textContent = 'Marked read ✓';
        markBtn.disabled = true;
      },
    }, 'Mark as read');
    actionsRow.push(markBtn);
  }
  if (ch.quiz_path) {
    actionsRow.push(
      h('button', {
        onclick: () => navigate(`/wiki/${subject}/${version}/chapter/${chapterId}/quiz`),
      }, 'Start quiz'),
    );
  }

  const main = h('article', { class: 'chapter' },
    h('h1', null, chapter.title),
    content,
    h('div', { class: 'chapter-actions' }, ...actionsRow),
    await renderAddendaList({ subject, version, chapterId }),
  );

  return h('div', { class: 'layout' }, sidebar, main);
}

export async function renderQuizPage(
  subject: string,
  version: string,
  chapterId: string,
): Promise<HTMLElement> {
  const manifest = await api.getManifest(subject, version);
  const sidebar = await renderSidebar({ manifest, subject, version, activeId: chapterId });
  const quizCard = await renderQuizCard({ subject, version, chapterId });
  const main = h('article', { class: 'quiz-page' },
    h('h1', null, `Quiz: ${manifest.chapters.find((c) => c.id === chapterId)?.title ?? chapterId}`),
    quizCard,
  );
  return h('div', { class: 'layout' }, sidebar, main);
}
```

- [ ] **Step 4: 写 `viewer/src/pages/TourStep.ts`**

```ts
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
        href: `/wiki/${subject}/${version}/tour/${tourId}/${prev.order}`,
        onclick: (e: MouseEvent) => { e.preventDefault(); navigate(`/wiki/${subject}/${version}/tour/${tourId}/${prev.order}`); },
      }, `← ${prev.title}`),
      next && h('a', {
        href: `/wiki/${subject}/${version}/tour/${tourId}/${next.order}`,
        onclick: (e: MouseEvent) => { e.preventDefault(); navigate(`/wiki/${subject}/${version}/tour/${tourId}/${next.order}`); },
      }, `${next.title} →`),
    ),
  );
  return h('div', { class: 'layout' }, sidebar, main);
}
```

- [ ] **Step 5: 写 `viewer/src/pages/Search.ts`**

```ts
import { h } from '../dom.js';
import { api } from '../api/client.js';
import { renderSidebar } from '../components/Sidebar.js';
import { navigate } from '../router.js';

export async function renderSearch(subject: string, version: string, q: string): Promise<HTMLElement> {
  const manifest = await api.getManifest(subject, version);
  const sidebar = await renderSidebar({ manifest, subject, version });

  const main = h('article', { class: 'search-page' },
    h('h1', null, 'Search'),
    h('form', {
      onsubmit: (e: SubmitEvent) => {
        e.preventDefault();
        const input = (e.target as HTMLFormElement).querySelector<HTMLInputElement>('input[name=q]');
        navigate(`/wiki/${subject}/${version}/search?q=${encodeURIComponent(input?.value ?? '')}`);
      },
    },
      h('input', { type: 'text', name: 'q', value: q, placeholder: 'Search terms…' }),
      h('button', { type: 'submit' }, 'Search'),
    ),
  );

  if (q) {
    try {
      const { results } = await api.search(subject, version, q);
      main.appendChild(
        h('ul', { class: 'search-results' },
          ...results.map((r) =>
            h('li', { class: r.doc_type },
              h('span', { class: 'doc-type' }, r.doc_type),
              ' ',
              h('span', { class: 'doc-id' }, r.doc_id),
              h('p', { class: 'snippet', html: r.snippet }),
            ),
          ),
        ),
      );
      if (results.length === 0) main.appendChild(h('p', null, 'No results.'));
    } catch (e: any) {
      main.appendChild(h('p', { class: 'error' }, `Search failed: ${e.message}`));
    }
  }

  return h('div', { class: 'layout' }, sidebar, main);
}
```

- [ ] **Step 6: 写 `viewer/src/pages/Me.ts`**

```ts
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
```

- [ ] **Step 7: build + commit**

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && npm run build --workspace @codebase-wiki/viewer
cd /Users/xgliu/Documents/git/codebase-wiki && git add viewer/ && git commit -m "viewer/pages: Home / Subject / Chapter / Quiz / Tour / Search / Me"
```

---

## Task 10: AdminUpload page

**Files:**
- Create: `viewer/src/pages/AdminUpload.ts`

**Context:** Drag-drop or `<input type=file>`. POSTs to `/api/v1/admin/wikis` using `api.uploadWiki`. Shows validation errors inline.

- [ ] **Step 1: 写 `viewer/src/pages/AdminUpload.ts`**

```ts
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
  const submit = h('button', {
    onclick: async () => {
      const file = fileInput.files?.[0];
      if (!file) {
        clear(status);
        status.appendChild(h('p', { class: 'error' }, 'Pick a file first.'));
        return;
      }
      clear(status);
      status.appendChild(h('p', null, `Uploading ${file.name} (${file.size} bytes)…`));
      submit.disabled = true;
      try {
        const r = await api.uploadWiki(file, forceCheckbox.checked);
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
```

- [ ] **Step 2: build + commit**

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && npm run build --workspace @codebase-wiki/viewer
cd /Users/xgliu/Documents/git/codebase-wiki && git add viewer/ && git commit -m "viewer/AdminUpload: file picker + force flag + inline status"
```

---

## Task 11: Wire it all up — `main.ts` route dispatcher

**Files:**
- Modify: `viewer/src/main.ts`

- [ ] **Step 1: 写 `viewer/src/main.ts`**

```ts
import { listenRoute, type Route, navigate } from './router.js';
import { mount, h, clear } from './dom.js';
import { renderTopbar } from './components/Topbar.js';
import { renderHome } from './pages/Home.js';
import { renderSubject } from './pages/Subject.js';
import { renderChapter, renderQuizPage } from './pages/Chapter.js';
import { renderTourOverview, renderTourStep } from './pages/TourStep.js';
import { renderSearch } from './pages/Search.js';
import { renderMe } from './pages/Me.js';
import { renderAdminUpload } from './pages/AdminUpload.js';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('#app element missing');

async function renderForRoute(route: Route): Promise<HTMLElement> {
  switch (route.kind) {
    case 'home':       return await renderHome();
    case 'subject':    return await renderSubject(route.subject);
    case 'version':    return await renderSubject(route.subject);  // alias for now
    case 'chapter':    return await renderChapter(route.subject, route.version, route.chapterId);
    case 'quiz':       return await renderQuizPage(route.subject, route.version, route.chapterId);
    case 'tour':       return await renderTourOverview(route.subject, route.version, route.tourId);
    case 'tour_step':  return await renderTourStep(route.subject, route.version, route.tourId, route.step);
    case 'search':     return await renderSearch(route.subject, route.version, route.q);
    case 'me':         return await renderMe();
    case 'admin':      return await renderAdminUpload();
    case 'admin_upload': return await renderAdminUpload();
    case 'notfound':   return h('main', null, h('h1', null, 'Not found'), h('p', null, route.pathname));
  }
}

async function paint(route: Route) {
  clear(root!);
  root!.appendChild(renderTopbar());
  const loading = h('main', { class: 'loading' }, 'Loading…');
  root!.appendChild(loading);
  try {
    const page = await renderForRoute(route);
    root!.removeChild(loading);
    root!.appendChild(page);
  } catch (e: any) {
    root!.removeChild(loading);
    root!.appendChild(h('main', { class: 'error' }, h('h1', null, 'Error'), h('p', null, e.message)));
  }
}

listenRoute((route) => {
  void paint(route);
});

// Intercept all internal <a href="/..."> clicks so they go through router
document.addEventListener('click', (e) => {
  const a = (e.target as Element | null)?.closest('a');
  if (!a) return;
  const href = a.getAttribute('href');
  if (!href || href.startsWith('http') || href.startsWith('//') || href.startsWith('#')) return;
  if (href.startsWith('/api/')) return;  // let server handle auth redirects etc
  if ((e as MouseEvent).metaKey || (e as MouseEvent).ctrlKey || (e as MouseEvent).shiftKey) return;
  e.preventDefault();
  navigate(href);
});
```

- [ ] **Step 2: build + smoke**

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && npm run build --workspace @codebase-wiki/viewer
ls -la viewer/dist/bundle.js
```
Expected: bundle.js exists, < 300KB (marked + zod + our code).

- [ ] **Step 3: commit**

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && git add viewer/ && git commit -m "viewer/main: route dispatcher + topbar mount + global <a> intercept"
```

---

## Task 12: Stylesheet (minimal but usable)

**Files:**
- Create: `viewer/src/styles/main.css`

**Context:** A single CSS file with sensible defaults. CSS variables for theming. SVG figures auto-themed via `data-figure` selectors. No external CSS framework.

- [ ] **Step 1: 写 `viewer/src/styles/main.css`**

```css
:root {
  --color-bg: #ffffff;
  --color-fg: #1a1a1a;
  --color-muted: #666;
  --color-link: #0a66c2;
  --color-accent: #2a7;
  --color-error: #c33;
  --color-correct: #2a7;
  --color-incorrect: #c33;
  --color-border: #e0e0e0;
  --color-sidebar-bg: #f7f7f7;
  --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: 'SF Mono', Menlo, Consolas, monospace;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: #1a1a1a;
    --color-fg: #e8e8e8;
    --color-muted: #999;
    --color-link: #6cb6ff;
    --color-border: #333;
    --color-sidebar-bg: #222;
  }
}

* { box-sizing: border-box; }

body {
  font-family: var(--font-sans);
  background: var(--color-bg);
  color: var(--color-fg);
  margin: 0;
  line-height: 1.5;
}

a {
  color: var(--color-link);
  text-decoration: none;
}
a:hover { text-decoration: underline; }

.topbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 24px;
  border-bottom: 1px solid var(--color-border);
}
.topbar .brand { font-weight: 600; font-size: 18px; }
.topbar nav { flex: 1; }
.auth-menu { display: flex; align-items: center; gap: 8px; }
.auth-menu .avatar { width: 24px; height: 24px; border-radius: 50%; }
.auth-btn {
  background: var(--color-fg);
  color: var(--color-bg);
  padding: 6px 12px;
  border-radius: 4px;
}

.layout { display: grid; grid-template-columns: 240px 1fr; min-height: calc(100vh - 50px); }

.sidebar {
  background: var(--color-sidebar-bg);
  padding: 16px;
  border-right: 1px solid var(--color-border);
  overflow-y: auto;
}
.sidebar h2 { font-size: 18px; margin: 0 0 4px; }
.sidebar h3 { font-size: 12px; text-transform: uppercase; color: var(--color-muted); margin: 16px 0 4px; }
.sidebar ul { list-style: none; padding: 0; margin: 0; }
.sidebar li { padding: 2px 0; }
.side-link { display: block; padding: 2px 8px; border-radius: 3px; color: var(--color-fg); }
.side-link:hover { background: rgba(127,127,127,.1); text-decoration: none; }
.side-link.active { background: rgba(127,127,127,.2); }

article { padding: 24px 32px; max-width: 800px; }
article h1 { margin-top: 0; }

.markdown-body img { max-width: 100%; }
.markdown-body pre { background: rgba(127,127,127,.1); padding: 12px; overflow-x: auto; }
.markdown-body code { font-family: var(--font-mono); font-size: 0.9em; }

[data-figure] [stroke="currentColor"] { stroke: var(--color-fg); }
[data-figure] text { fill: var(--color-fg); }

.subject-list { list-style: none; padding: 0; }
.subject-list li { border: 1px solid var(--color-border); border-radius: 6px; padding: 16px; margin-bottom: 12px; }
.subject-list h2 { margin: 0 0 8px; }
.version-tag { display: inline-block; background: var(--color-link); color: white; padding: 2px 6px; border-radius: 3px; font-size: 12px; }

.quiz-card { border: 1px solid var(--color-border); border-radius: 6px; padding: 16px; margin: 24px 0; }
.quiz-question { margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid var(--color-border); }
.quiz-option { display: block; padding: 4px 0; cursor: pointer; }
.quiz-result.correct { color: var(--color-correct); }
.quiz-result.incorrect { color: var(--color-incorrect); }
.quiz-result .explanation { color: var(--color-muted); font-style: italic; }

.addenda { margin-top: 48px; padding-top: 16px; border-top: 2px solid var(--color-border); }
.addenda-list { list-style: none; padding: 0; }
.addenda-list li { border-left: 3px solid var(--color-link); padding-left: 12px; margin-bottom: 16px; }
.addenda-list .meta { font-size: 12px; color: var(--color-muted); }
.addendum-form textarea { width: 100%; padding: 8px; }

.upload-form input, .upload-form button { margin: 8px 0; display: block; }
.upload-status .error { color: var(--color-error); }
.upload-status .success { color: var(--color-correct); }
```

- [ ] **Step 2: 配置 build 把 main.css 复制到 dist**

Edit `viewer/package.json` build script to also copy CSS:

Change:
```json
"build": "tsc --noEmit && esbuild src/main.ts --bundle --outfile=dist/bundle.js --sourcemap --minify",
```
To:
```json
"build": "tsc --noEmit && esbuild src/main.ts --bundle --outfile=dist/bundle.js --sourcemap --minify && cp src/styles/main.css dist/main.css",
```

- [ ] **Step 3: build + smoke**

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && npm run build --workspace @codebase-wiki/viewer
ls viewer/dist/
```
Expected: `bundle.js`, `bundle.js.map`, `main.css`.

- [ ] **Step 4: commit**

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && git add viewer/ && git commit -m "viewer/styles: minimal CSS with light/dark + sidebar + quiz/addenda components"
```

---

## Task 13: Wire viewer bundle into server's `/static`

**Files:**
- Modify: `server/src/app.ts`
- Modify: `server/package.json` build script

**Context:** Server should serve `viewer/dist/bundle.js` and `viewer/dist/main.css` at `/static/bundle.js` and `/static/main.css`. Simplest approach: at build-time copy them into `server/dist/static/`. At runtime, use `@hono/node-server/serve-static`.

- [ ] **Step 1: 改 `server/package.json` build script**

Change build script to copy viewer artifacts too:

```json
"build": "tsc -p tsconfig.json && cp -r src/db/migrations dist/db/migrations && mkdir -p dist/static && cp src/static/shell.html dist/static/shell.html && cp ../viewer/dist/bundle.js dist/static/bundle.js 2>/dev/null || true && cp ../viewer/dist/bundle.js.map dist/static/bundle.js.map 2>/dev/null || true && cp ../viewer/dist/main.css dist/static/main.css 2>/dev/null || true",
```

(The `|| true` allows server to build before viewer exists. In root-level `npm run build` they'll both build; topological order: shared → viewer → server when invoked via `npm run build` at root — though npm workspaces don't guarantee order. Practical answer: run viewer build first then server build.)

- [ ] **Step 2: 改 `server/src/app.ts`** — serve `/static/*`

Add at top:
```ts
import { serveStatic } from '@hono/node-server/serve-static';
```

In `createApp`, BEFORE the catch-all routes, add:

```ts
    app.use('/static/*', serveStatic({ root: './dist' }));
```

(Note: `@hono/node-server` exports `serveStatic`. Verify the import path in dependency docs.)

- [ ] **Step 3: build + smoke**

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && npm run build --workspace @codebase-wiki/viewer && npm run build --workspace @codebase-wiki/server
ls server/dist/static/
```
Expected: `shell.html`, `bundle.js`, `bundle.js.map`, `main.css`.

- [ ] **Step 4: 跑现有测试,确认没破**

```bash
cd /Users/xgliu/Documents/git/codebase-wiki/server && npx vitest run
```
Expected: all green.

- [ ] **Step 5: commit**

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && git add server/ && git commit -m "server: serve /static/bundle.js + main.css from viewer build artifacts"
```

---

## Task 14: Manual browser verification

**Files:** none.

**Context:** vitest covers the server API. For viewer we do manual browser verification — this is the only way to spot UX issues + visual bugs.

- [ ] **Step 1: Boot server with sample subject pre-loaded**

In one terminal:
```bash
cd /Users/xgliu/Documents/git/codebase-wiki && rm -rf /tmp/cwiki-demo && mkdir -p /tmp/cwiki-demo
cd /Users/xgliu/Documents/git/codebase-wiki && DATA_DIR=/tmp/cwiki-demo GITHUB_CLIENT_ID=x GITHUB_CLIENT_SECRET=x OAUTH_REDIRECT_URI=http://localhost:3000/api/v1/auth/github/callback ADMIN_GITHUB_LOGINS=x PUBLIC_READ=true node server/dist/server.js
```

In another terminal: upload the sample tarball via curl (bypass admin gate by inserting a session manually). Actually easier: use sqlite3 CLI to seed user + session, then upload. Or skip auth gate by setting `PUBLIC_READ=true` and uploading via direct SQL... no, upload requires admin.

Simplest path: temporarily relax the admin check in dev by setting `ADMIN_GITHUB_LOGINS=` to include any user you create via SQL. Or insert an admin user directly:

```bash
sqlite3 /tmp/cwiki-demo/wiki-server.db "INSERT INTO users (github_id, github_login, created_at, last_seen_at) VALUES (1, 'demo_admin', $(date +%s)000, $(date +%s)000);"
sqlite3 /tmp/cwiki-demo/wiki-server.db "INSERT INTO sessions (id, user_id, created_at, expires_at, last_used_at) VALUES ('demoseed01234567890123456789012345678901234567890123456789012345', 1, $(date +%s)000, $(date -v+30d +%s)000, $(date +%s)000);"
```

Then upload:
```bash
cd /Users/xgliu/Documents/git/codebase-wiki && node tools/wikipkg/dist/cli.js pack examples/sample-wikipkg /tmp/tiny-counter.wikipkg.tar.gz
curl -sX POST 'http://localhost:3000/api/v1/admin/wikis' \
  -H 'content-type: application/gzip' \
  -H 'cookie: cwsess=demoseed01234567890123456789012345678901234567890123456789012345' \
  --data-binary @/tmp/tiny-counter.wikipkg.tar.gz \
  -- (with ADMIN_GITHUB_LOGINS=demo_admin set when starting the server)
```

This is fiddly — adjust env on server boot.

- [ ] **Step 2: Open browser and verify each page renders**

Open `http://localhost:3000/` — should see "Available wikis" with tiny-counter.
Click → see version selector.
Click v0.1.0 → see chapters / tours sidebar.
Click `intro` → see markdown + (signed-out) Q&A "sign in" hint + Start quiz button.
Click Start quiz → see quiz with 1 question, options as radios.
(Without login, "Sign in to take the quiz".)

- [ ] **Step 3: Take notes of any visual / functional bugs**

If anything is broken: file as follow-ups in `docs/`, fix in subsequent PRs. v1 acceptable if basic flow works.

- [ ] **Step 4: Kill server, no commit needed unless source changed**

---

## Task 15: Final integration check + lock-in

**Files:** none new.

- [ ] **Step 1: Clean full build from zero**

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && rm -rf node_modules */node_modules */dist tools/wikipkg/dist
cd /Users/xgliu/Documents/git/codebase-wiki && npm install
# Build in order: shared → viewer → server (npm workspaces doesn't guarantee order, so explicit)
cd /Users/xgliu/Documents/git/codebase-wiki && npm run build --workspace @codebase-wiki/shared
cd /Users/xgliu/Documents/git/codebase-wiki && npm run build --workspace @codebase-wiki/wikipkg
cd /Users/xgliu/Documents/git/codebase-wiki && npm run build --workspace @codebase-wiki/viewer
cd /Users/xgliu/Documents/git/codebase-wiki && npm run build --workspace @codebase-wiki/server
cd /Users/xgliu/Documents/git/codebase-wiki && npm test
```
Expected: all tests green, all workspaces build successfully.

- [ ] **Step 2: 看 final size of bundle.js**

```bash
ls -lh viewer/dist/bundle.js server/dist/static/bundle.js
```
Both should be identical (server copies viewer's output).

- [ ] **Step 3: Commit if anything changed**

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && git status
```

If clean → no commit.

---

Plan D done. Full stack:
- Plan A: wikipkg format + skill generator
- Plan B: service core (auth + upload + read + search)
- Plan C: service interactive (quiz attempts + progress + addenda)
- Plan D: viewer (TS modular, served as single bundle by server)

End-to-end: skill generates a wikipkg → admin uploads via viewer → users browse, learn, take quizzes, track progress, contribute Q&A.
