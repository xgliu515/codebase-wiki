# Codebase-Wiki Mono-repo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the codebase-wiki skill produce a single mono-repo holding many projects, each with many versions (`mono-repo / <project> / <version> / wiki`), with a top-level project selector, an in-viewer project dropdown, and an import flow for existing standalone wiki repos.

**Architecture:** The versioning layout (built earlier) is wrapped in one more directory level: each project gets a `<project>/` directory containing its version selector + `versions.json` + version subdirectories. The repo root holds a project selector `index.html` + `projects.json` + shared `selector.css`. Relative paths make the nesting work with no fetch-path changes for the version layer. The skill detects three modes (new mono-repo / new project / append version) and has a separate import flow.

**Tech Stack:** Vanilla ES modules (no build step), HTML/CSS, JSON. The skill itself is markdown instruction files. This repo has no automated test framework; verification is JSON validation, `node --check`, fence-balance checks, and consistency review against the spec.

**Spec:** `docs/specs/2026-05-18-codebase-wiki-monorepo-design.md`

**Branch:** `monorepo` (already created). All commits land here. Use single-line commit messages with no trailer, matching this repo's convention.

---

## File Structure

### New files

| File | Responsibility |
|------|----------------|
| `templates/projects.json` | Example project manifest the skill copies and fills. |
| `templates/project-index.html` | Top-level project selector page (becomes mono-repo root `index.html`). |
| `reference/monorepo.md` | Reference doc: three-level layout, manifests, run modes, import flow. |

### Modified files

| File | Change |
|------|--------|
| `templates/web/js/chapters.js` | Add `getCurrentProjectDir()`. |
| `templates/web/js/versions.js` | Add `initProjectSwitcher()`; import `getCurrentProjectDir`. |
| `templates/index.html` | Add `<select id="project-switcher">` to the topbar. |
| `templates/web/js/app.js` | Import and call `initProjectSwitcher()`. |
| `templates/version-index.html` | Add a "← all projects" back link; point stylesheet at `../selector.css`. |
| `templates/selector.css` | Add `.back-link` and `.vc-tagline` rules. |
| `SKILL.md` | Rewrite Phase 0 / 4 / 7 for the three mono-repo modes; add an import section; add `reference/monorepo.md` to the reference list. |
| `reference/workflow.md` | Update Phase 0 / 5 / 7 subsections. |
| `reference/versioning.md` | Re-scope to "the version layer"; defer repo modes to `monorepo.md`. |
| `templates/readme.md.tmpl` | Document the three-level mono-repo layout. |

Note: the project dropdown reuses the existing `.version-switcher` CSS class, so `style.css` needs no change (DRY — a separate identical `.project-switcher` rule would be duplication).

---

## Task 1: projects.json example template

**Files:**
- Create: `templates/projects.json`

- [ ] **Step 1: Write the file**

Create `templates/projects.json` with this exact content:

```json
{
  "title": "{{MONOREPO_TITLE}}",
  "projects": [
    {
      "dir": "{{PROJECT_DIR}}",
      "name": "{{PROJECT_NAME}}",
      "github": "{{PROJECT_GITHUB_REPO}}",
      "tagline": "{{PROJECT_TAGLINE}}",
      "versions": 1,
      "latest": "{{LATEST_VERSION_DIR}}",
      "updated": "{{DATE_ISO}}"
    }
  ]
}
```

- [ ] **Step 2: Verify it is valid JSON**

Run: `python3 -m json.tool templates/projects.json`
Expected: the content is echoed back pretty-printed, no error.

- [ ] **Step 3: Commit**

```bash
git add templates/projects.json
git commit -m "Add projects.json manifest template"
```

---

## Task 2: getCurrentProjectDir() in chapters.js

**Files:**
- Modify: `templates/web/js/chapters.js`

- [ ] **Step 1: Insert the new function**

In `templates/web/js/chapters.js`, find this exact block (the end of `getCurrentVersionDir` followed by a blank line and the `STORAGE_PREFIX` comment):

```js
export function getCurrentVersionDir() {
  const segs = location.pathname.split('/').filter(Boolean);
  if (segs.length && /\.html?$/i.test(segs[segs.length - 1])) segs.pop();
  return segs.length ? segs[segs.length - 1] : '';
}

// localStorage key 前缀：由 PROJECT_NAME 派生，并追加版本目录名做隔离，
```

Replace it with:

```js
export function getCurrentVersionDir() {
  const segs = location.pathname.split('/').filter(Boolean);
  if (segs.length && /\.html?$/i.test(segs[segs.length - 1])) segs.pop();
  return segs.length ? segs[segs.length - 1] : '';
}

// 当前项目目录名：mono-repo 下版本目录的上一级，例如
//   /wikis/vllm/v0.22.0/index.html  →  'vllm'
// 用于项目切换下拉。路径不足两段时返回空串。
export function getCurrentProjectDir() {
  const segs = location.pathname.split('/').filter(Boolean);
  if (segs.length && /\.html?$/i.test(segs[segs.length - 1])) segs.pop();
  return segs.length >= 2 ? segs[segs.length - 2] : '';
}

// localStorage key 前缀：由 PROJECT_NAME 派生，并追加版本目录名做隔离，
```

- [ ] **Step 2: Verify the module parses**

Run: `node --check templates/web/js/chapters.js`
Expected: no output, exit code 0.

- [ ] **Step 3: Verify the derivation logic**

Run:
```bash
node -e "global.location={pathname:'/wikis/vllm/v0.22.0/index.html'}; const f=()=>{const a=location.pathname.split('/').filter(Boolean); if(a.length&&/\.html?$/i.test(a[a.length-1]))a.pop(); return a.length>=2?a[a.length-2]:'';}; console.log(f());"
```
Expected: prints `vllm`.

- [ ] **Step 4: Commit**

```bash
git add templates/web/js/chapters.js
git commit -m "Add getCurrentProjectDir to web viewer"
```

---

## Task 3: initProjectSwitcher() in versions.js

**Files:**
- Modify: `templates/web/js/versions.js`

- [ ] **Step 1: Update the import line**

In `templates/web/js/versions.js`, line 1 is:

```js
import { getCurrentVersionDir } from './chapters.js';
```

Replace it with:

```js
import { getCurrentVersionDir, getCurrentProjectDir } from './chapters.js';
```

- [ ] **Step 2: Append the project switcher function**

At the end of `templates/web/js/versions.js` (after the closing `}` of `initVersionSwitcher`), append:

```js

// =========================================================
// 项目切换下拉（mono-repo）
// 运行时 fetch 顶层 ../../projects.json，在顶栏渲染项目下拉。
// 切换项目 = 跳到目标项目的版本选择页。
// fetch 失败（如非 mono-repo 布局、本地单目录打开）时静默隐藏下拉。
// =========================================================

export async function initProjectSwitcher() {
  const sel = document.getElementById('project-switcher');
  if (!sel) return;

  let manifest;
  try {
    const resp = await fetch('../../projects.json', { cache: 'no-cache' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    manifest = await resp.json();
  } catch {
    sel.hidden = true;
    return;
  }

  const projects = Array.isArray(manifest && manifest.projects) ? manifest.projects : [];
  if (projects.length < 1) {
    sel.hidden = true;
    return;
  }

  const current = getCurrentProjectDir();
  sel.innerHTML = '';
  for (const p of projects) {
    const opt = document.createElement('option');
    opt.value = p.dir;
    opt.textContent = p.name || p.dir;
    if (p.dir === current) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.hidden = false;

  sel.addEventListener('change', () => {
    const dir = sel.value;
    if (dir && dir !== current) {
      location.href = `../../${dir}/index.html`;
    }
  });
}
```

- [ ] **Step 3: Verify the module parses**

Run: `node --check templates/web/js/versions.js`
Expected: no output, exit code 0.

- [ ] **Step 4: Verify both functions are exported**

Run: `grep -nE 'export async function (initVersionSwitcher|initProjectSwitcher)' templates/web/js/versions.js`
Expected: two lines — `initVersionSwitcher` and `initProjectSwitcher`.

- [ ] **Step 5: Commit**

```bash
git add templates/web/js/versions.js
git commit -m "Add project switcher to versions.js"
```

---

## Task 4: Wire the project dropdown into the viewer

**Files:**
- Modify: `templates/index.html`
- Modify: `templates/web/js/app.js`

- [ ] **Step 1: Add the project select to the topbar**

In `templates/index.html`, this line exists:

```html
    <select id="version-switcher" class="version-switcher" title="切换版本" hidden></select>
```

Replace it with (project switcher first — it is the broader scope):

```html
    <select id="project-switcher" class="version-switcher" title="切换项目" hidden></select>
    <select id="version-switcher" class="version-switcher" title="切换版本" hidden></select>
```

- [ ] **Step 2: Update the app.js import**

In `templates/web/js/app.js`, line 9 is:

```js
import { initVersionSwitcher } from './versions.js';
```

Replace it with:

```js
import { initVersionSwitcher, initProjectSwitcher } from './versions.js';
```

- [ ] **Step 3: Call initProjectSwitcher in main()**

In `templates/web/js/app.js`, this exact block exists inside `main()`:

```js
  // 版本切换下拉（无 versions.json 时自动隐藏，不阻塞启动）
  initVersionSwitcher();

  // 键盘
  initKeybindings();
```

Replace it with:

```js
  // 版本切换下拉（无 versions.json 时自动隐藏，不阻塞启动）
  initVersionSwitcher();

  // 项目切换下拉（无 projects.json 时自动隐藏，不阻塞启动）
  initProjectSwitcher();

  // 键盘
  initKeybindings();
```

- [ ] **Step 4: Verify app.js parses**

Run: `node --check templates/web/js/app.js`
Expected: no output, exit code 0.

- [ ] **Step 5: Static verification**

Run: `grep -nE 'project-switcher|initProjectSwitcher' templates/index.html templates/web/js/app.js`
Expected: `templates/index.html` has the `<select id="project-switcher" ...>` line; `app.js` has the import and the `initProjectSwitcher();` call.

- [ ] **Step 6: Commit**

```bash
git add templates/index.html templates/web/js/app.js
git commit -m "Wire project switcher into the web viewer"
```

---

## Task 5: version-index.html back link + ../selector.css

**Files:**
- Modify: `templates/version-index.html`
- Modify: `templates/selector.css`

- [ ] **Step 1: Update the header comment and stylesheet path**

In `templates/version-index.html`, this block exists (lines 2-12):

```html
<!--
  顶层版本选择页 → 复制为 <output>/index.html（仓库根，version 子目录的同级）。
  替换 {{PROJECT_NAME}} 为项目名。页面内容完全由同级 versions.json 驱动，
  新增版本时本文件无需重新生成。
-->
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{PROJECT_NAME}} 中文参考 Wiki — 版本选择</title>
  <link rel="stylesheet" href="selector.css">
```

Replace it with:

```html
<!--
  项目内的版本选择页 → 复制为 mono-repo 里的 <project>/index.html。
  替换 {{PROJECT_NAME}} 为项目名。页面内容完全由同级 versions.json 驱动，
  新增版本时本文件无需重新生成。
-->
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{PROJECT_NAME}} 中文参考 Wiki — 版本选择</title>
  <link rel="stylesheet" href="../selector.css">
```

- [ ] **Step 2: Add the back link**

In `templates/version-index.html`, this block exists:

```html
  <main class="selector">
    <h1>{{PROJECT_NAME}} <span>中文参考 Wiki</span></h1>
    <p class="subtitle">选择一个代码版本查看对应的 wiki。</p>
```

Replace it with:

```html
  <main class="selector">
    <p class="back-link"><a href="../index.html">← 所有项目</a></p>
    <h1>{{PROJECT_NAME}} <span>中文参考 Wiki</span></h1>
    <p class="subtitle">选择一个代码版本查看对应的 wiki。</p>
```

- [ ] **Step 3: Add the .back-link style**

In `templates/selector.css`, the last rule is:

```css
.empty { color: var(--text-soft); }
```

Add directly after it:

```css
.back-link { margin: 0 0 16px; font-size: 13px; }
.back-link a { color: var(--text-soft); text-decoration: none; }
.back-link a:hover { color: var(--accent); }
```

- [ ] **Step 4: Static verification**

Run: `grep -nE 'back-link|\.\./selector\.css' templates/version-index.html templates/selector.css`
Expected: `version-index.html` references `../selector.css` and has the `back-link` paragraph; `selector.css` has the three `.back-link` rules.

- [ ] **Step 5: Commit**

```bash
git add templates/version-index.html templates/selector.css
git commit -m "Add back link and parent stylesheet path to version selector"
```

---

## Task 6: Top-level project selector page

**Files:**
- Create: `templates/project-index.html`
- Modify: `templates/selector.css`

- [ ] **Step 1: Write the project selector page**

Create `templates/project-index.html` with this exact content:

```html
<!DOCTYPE html>
<!--
  顶层项目选择页 → 复制为 mono-repo 根 index.html。
  替换 {{MONOREPO_TITLE}} 为站点标题。页面内容完全由同级 projects.json 驱动，
  新增项目时本文件无需重新生成。
-->
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{MONOREPO_TITLE}} — 项目选择</title>
  <link rel="stylesheet" href="selector.css">
</head>
<body>
  <main class="selector">
    <h1>{{MONOREPO_TITLE}}</h1>
    <p class="subtitle">选择一个项目查看它的代码学习 wiki。</p>
    <ul id="project-list" class="version-list"></ul>
    <p id="empty" class="empty" hidden>未找到 projects.json，或其中没有任何项目。</p>
  </main>
  <script>
    (async function () {
      const listEl = document.getElementById('project-list');
      const emptyEl = document.getElementById('empty');
      try {
        const resp = await fetch('projects.json', { cache: 'no-cache' });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const manifest = await resp.json();
        const projects = Array.isArray(manifest && manifest.projects) ? manifest.projects : [];
        if (!projects.length) { emptyEl.hidden = false; return; }
        for (const p of projects) {
          const li = document.createElement('li');
          const a = document.createElement('a');
          a.href = p.dir + '/index.html';
          a.className = 'version-card';
          a.innerHTML =
            '<div class="vc-head"><span class="vc-label"></span></div>' +
            '<p class="vc-tagline"></p>' +
            '<dl class="vc-meta">' +
            '<div><dt>GitHub</dt><dd class="vc-github"></dd></div>' +
            '<div><dt>版本数</dt><dd class="vc-versions"></dd></div>' +
            '<div><dt>最新</dt><dd class="vc-latest"></dd></div>' +
            '<div><dt>更新</dt><dd class="vc-updated"></dd></div>' +
            '</dl>';
          a.querySelector('.vc-label').textContent = p.name || p.dir;
          a.querySelector('.vc-tagline').textContent = p.tagline || '';
          a.querySelector('.vc-github').textContent = p.github || '—';
          a.querySelector('.vc-versions').textContent = p.versions != null ? String(p.versions) : '—';
          a.querySelector('.vc-latest').textContent = p.latest || '—';
          a.querySelector('.vc-updated').textContent = p.updated || '—';
          li.appendChild(a);
          listEl.appendChild(li);
        }
      } catch (err) {
        emptyEl.hidden = false;
        emptyEl.textContent = '加载 projects.json 失败：' + (err.message || err);
      }
    })();
  </script>
</body>
</html>
```

- [ ] **Step 2: Add the .vc-tagline style**

In `templates/selector.css`, the `.back-link a:hover` rule (added in Task 5) is the last rule:

```css
.back-link a:hover { color: var(--accent); }
```

Add directly after it:

```css
.vc-tagline { margin: 0 0 10px; color: var(--text-soft); font-size: 13px; }
```

- [ ] **Step 3: Browser smoke test**

Run:
```bash
mkdir -p /tmp/mtest
sed 's/{{MONOREPO_TITLE}}/Demo Wikis/g' templates/project-index.html > /tmp/mtest/index.html
cp templates/selector.css /tmp/mtest/
printf '{"title":"Demo Wikis","projects":[{"dir":"vllm","name":"vLLM","github":"vllm-project/vllm","tagline":"vLLM learning wiki","versions":2,"latest":"v0.22.0","updated":"2026-05-18"},{"dir":"react","name":"React","github":"facebook/react","tagline":"React learning wiki","versions":1,"latest":"v18.2.0","updated":"2026-04-01"}]}' > /tmp/mtest/projects.json
cd /tmp/mtest && python3 -m http.server 8796
```
Open `http://localhost:8796/`.
Expected: two project cards — `vLLM` and `React` — each showing tagline, GitHub, version count, latest, updated; hovering lifts a card; clicking navigates to `<dir>/index.html` (404 is fine — the dirs do not exist in the fixture). No console errors.
Stop the server and run `rm -rf /tmp/mtest`.

- [ ] **Step 4: Commit**

```bash
git add templates/project-index.html templates/selector.css
git commit -m "Add top-level project selector page"
```

---

## Task 7: reference/monorepo.md

**Files:**
- Create: `reference/monorepo.md`

- [ ] **Step 1: Write the reference doc**

Create `reference/monorepo.md` with the exact content between the markers (do not include the marker lines):

````text
----- BEGIN reference/monorepo.md -----
# Mono-repo: many projects in one wiki repo

The skill writes every wiki into a single **mono-repo** with a three-level
tree: `mono-repo / <project> / <version> / wiki`. This doc defines the
layout, the manifests, the run modes, and the import flow for existing
standalone wiki repos. For the version layer in isolation see
`reference/versioning.md`.

## Repo layout

```
wikis/                          (mono-repo, GitHub Pages serves from main /)
├── index.html                  project selector (from templates/project-index.html)
├── selector.css                shared selector styling (project + version pages)
├── projects.json               project manifest — the top-level source of truth
├── README.md  LICENSE  .gitignore
├── vllm/
│   ├── index.html              version selector (from templates/version-index.html)
│   ├── versions.json           this project's version manifest
│   ├── v0.22.0/                one complete, self-contained wiki
│   │   ├── index.html  *.md  web/
│   └── v0.21.1/
└── react/
    ├── index.html
    ├── versions.json
    └── v18.2.0/
```

Each `<project>/<version>/` is a complete, self-contained wiki. The
version layer works exactly as `reference/versioning.md` describes — it
just lives one level under a project directory. Relative paths make the
nesting work with no code change: the in-viewer version dropdown fetches
`../versions.json`, the project dropdown fetches `../../projects.json`.

`selector.css` lives once at the repo root. The project selector
references `selector.css`; each version selector references `../selector.css`.

## projects.json

The repo-root `projects.json` is the top-level source of truth, driving
the project selector page and the in-viewer project dropdown.

```json
{
  "title": "Codebase Wikis",
  "projects": [
    { "dir": "vllm", "name": "vLLM", "github": "vllm-project/vllm",
      "tagline": "为深入学习 vLLM 源码而写", "versions": 2,
      "latest": "v0.22.0", "updated": "2026-05-18" },
    { "dir": "react", "name": "React", "github": "facebook/react",
      "tagline": "...", "versions": 1, "latest": "v18.2.0", "updated": "2026-04-01" }
  ]
}
```

- `dir` — project subdirectory name, also the routing id. `slug(name)`.
- `name` — friendly project name (selector card + viewer dropdown).
- `github` — target code's GitHub repo (`owner/repo`), display only.
- `tagline` — one-line description on the project card.
- `versions` — current version count for this project.
- `latest` — directory name of this project's latest version.
- `updated` — date of this project's most recent generation / append (ISO).

The array is newest-first by `updated`. Adding a project pushes a new
entry to the head; appending a version updates that project's entry
(`versions` / `latest` / `updated`) and moves it to the head.

## Project directory naming

`dir = slug(name)`: lowercase, non-alphanumeric runs → `-`, trim leading
and trailing `-`. If a "new project" run derives a `dir` that already
exists, STOP and ask the user: rename, or treat the run as "append
version". Never silently merge.

Version directory naming is unchanged — see `reference/versioning.md`.

## Run modes

When the skill runs, probe the output directory:

| Detected | Mode | Action |
|----------|------|--------|
| No `projects.json`, directory empty / missing | new mono-repo | Create the repo + its first project |
| `projects.json` present, target project dir absent | new project | Add a project to the mono-repo |
| `projects.json` present, target project dir present | append version | Add a version to that project |

### New mono-repo

`git init -b main` → write repo-root `index.html` (project selector),
`selector.css`, `README.md`, `LICENSE`, `.gitignore` → build the first
`<project>/` (version selector + `versions.json` + first `v<x>/`) → write
`projects.json` (single entry) → commit → enable Pages.

### New project

Repo already exists → build a new `<project>/` (version selector +
`versions.json` + first `v<x>/`) → push a new entry to the head of
`projects.json` → repo-root `index.html` / `selector.css` are NOT touched
→ commit and push.

### Append version

Add `<project>/v<x>/` → update `<project>/versions.json` (push to head,
flip `latest`) → update that project's entry in `projects.json`
(`versions` / `latest` / `updated`, move to head) → repo-root files and
other projects are NOT touched → commit and push.

## Import flow

The import flow brings already-generated standalone wiki repos into the
mono-repo. It is a separate entry point and can batch multiple sources.
Before moving or copying many files, tell the user and get confirmation.

For each source wiki repo:

1. Detect the source layout — `versions.json` at the source root → already
   versioned; only root-level `index.html` + `web/js/chapters.js` → flat.
2. Read the project identity from the source's `web/js/chapters.js`
   (`PROJECT_NAME`, `PROJECT_GITHUB_REPO`); for a versioned source use the
   latest version's `chapters.js`. Project dir = `slug(PROJECT_NAME)`.
3. Flat source — run the flat→versioned conversion (version dir from
   `ANALYZED_TAG`, else `ANALYZED_COMMIT`; see `reference/versioning.md`),
   landing the output at `<mono>/<project>/v<x>/`, and create
   `<mono>/<project>/index.html` (version selector) + `<mono>/<project>/versions.json`.
4. Versioned source — copy the source contents (except `README.md` /
   `LICENSE` / `.gitignore` / `.git/`) into `<mono>/<project>/`. Delete the
   leftover `<project>/selector.css` and confirm the version selector
   references `../selector.css`.
5. Inject the project dropdown into every version of the imported project:
   ship the current `web/js/versions.js` (with `initProjectSwitcher`), add
   `<select id="project-switcher" class="version-switcher" title="切换项目" hidden></select>`
   to each `index.html` topbar, and add the import + `initProjectSwitcher()`
   call to each `app.js`. Nav chrome only — never chapter `.md` content.
6. Register the project in repo-root `projects.json`; ensure repo-root
   `index.html` (project selector) + `selector.css` exist.
7. The source repo is NOT deleted — import copies.

## Error handling

- Project dir collision on a "new project" run → ask rename / append; never silently merge.
- `projects.json` corrupt or invalid → report and ask the user; never silently rebuild.
- Import moving many files → require user confirmation first.
- Selector page or viewer fails to fetch its manifest → that dropdown / list silently degrades; the rest is unaffected.
- Leftover `<project>/selector.css` from a versioned source → delete on import; the version selector uses `../selector.css`.
- Imported source repos are always kept, never deleted.
----- END reference/monorepo.md -----
````

- [ ] **Step 2: Verify**

Run: `grep -nE 'TBD|TODO|FIXME|BEGIN reference|END reference' reference/monorepo.md`
Expected: no output (marker lines must not be in the file).

- [ ] **Step 3: Commit**

```bash
git add reference/monorepo.md
git commit -m "Add mono-repo reference doc"
```

---

## Task 8: Rewrite SKILL.md for mono-repo

**Files:**
- Modify: `SKILL.md`

Make five edits. Make ONLY these changes.

- [ ] **Step 1: Replace the Phase 0 section**

In `SKILL.md`, the Phase 0 section spans from the line `## Phase 0: Detect mode + gather inputs (do this first)` through the line `Confirm before proceeding. Save inputs to memory if persistent.` (just before the `---` that precedes Phase 1). Replace that entire section with:

````text
## Phase 0: Detect mode + gather inputs (do this first)

The skill writes into a **mono-repo** that holds many projects, each with
many versions: `mono-repo / <project> / <version> / wiki`. See
`reference/monorepo.md`.

**Probe the output directory** to pick a mode:

| Detected | Mode | Meaning |
|----------|------|---------|
| No `projects.json`, directory empty / missing | new mono-repo | Create the repo + its first project |
| `projects.json` present, target project dir absent | new project | Add a project to an existing mono-repo |
| `projects.json` present, target project dir present | append version | Add a version to an existing project |

Ask the user **one question at a time** (no batches):

1. **Codebase path**: absolute path on disk (used to read source for `file:line` refs)
2. **Output directory**: the mono-repo path (existing or to-be-created)
3. **Project name + GitHub repo** (new mono-repo / new project only): e.g., `vllm` + `vllm-project/vllm`
4. **Wiki language** (new mono-repo / new project only): Chinese (default) / English / bilingual
5. **Lock version**: confirm `git rev-parse --short HEAD` of the codebase as the analyzed commit, or let the user specify a tag

In **new project / append version** mode, read `projects.json` (and the
project's `versions.json` when appending) and tell the user which
projects / versions already exist and what this run will add.

**Derive directory names**:
- Project dir = `slug(project name)` — lowercase, non-alphanumeric runs → `-`, trim `-`.
- Version dir = exact tag via `git describe --tags --exact-match HEAD`, else `<branch>-<shortSHA>`.

If a project dir collides but this run means "new project", ask the user
to rename or to treat it as "append version" — never silently merge. If a
version dir collides, ask to overwrite or rename.

To **import existing standalone wiki repos** into the mono-repo, see the
Import section after Phase 7.

Confirm before proceeding. Save inputs to memory if persistent.
````

- [ ] **Step 2: Replace the Phase 4 intro**

In `SKILL.md`, this exact block exists:

````text
## Phase 4: Set up the web viewer

All generated output for this version — `index.html`, every `.md` file,
and the `web/` directory — goes into the **version subdirectory `v<x>/`**,
not the repo root. Copy `templates/web/` (including `web/js/versions.js`)
into `v<x>/web/`, and copy `templates/index.html` into `v<x>/index.html`.
Then customize:
````

Replace it with:

````text
## Phase 4: Set up the web viewer

All generated output for this version — `index.html`, every `.md` file,
and the `web/` directory — goes into `<project>/<version>/` inside the
mono-repo. Copy `templates/web/` (including `web/js/versions.js`) into
`<project>/<version>/web/`, and copy `templates/index.html` into
`<project>/<version>/index.html`. Then customize:
````

- [ ] **Step 3: Replace the Phase 4 item 5**

In `SKILL.md`, this exact line exists:

```text
5. **The repo-root `index.html` (the version selector, from `templates/version-index.html`)** is the entry point. Test: `cd <output> && python3 -m http.server 8765` then visit `http://localhost:8765/`
```

Replace it with:

```text
5. **The repo-root `index.html` (the project selector, from `templates/project-index.html`)** is the entry point. Test: `cd <output> && python3 -m http.server 8765` then visit `http://localhost:8765/` — project selector → version selector → viewer.
```

- [ ] **Step 4: Replace the Phase 7 section and add the Import section**

In `SKILL.md`, the Phase 7 section spans from `## Phase 7: Publish (versioned)` through the line `See \`reference/versioning.md\` for the full naming rule and error handling.` (just before the `---` that precedes `## Important behaviors`). Replace that entire section with:

````text
## Phase 7: Publish (mono-repo)

The repo root holds the project selector + `projects.json`; each project
holds a version selector + `versions.json`; each version holds a wiki. See
`reference/monorepo.md`.

### New mono-repo mode

- Build `<project>/<version>/` — the full wiki from Phases 3-6.
- `<project>/index.html`: copy `templates/version-index.html`, replace `{{PROJECT_NAME}}`.
- `<project>/versions.json`: copy `templates/versions.json`, fill the single entry (`latest: true`).
- Repo-root `index.html`: copy `templates/project-index.html`, replace `{{MONOREPO_TITLE}}`.
- Repo-root `selector.css`: copy `templates/selector.css` (no edits).
- Repo-root `projects.json`: copy `templates/projects.json`, fill the single entry.
- `README.md` from `templates/readme.md.tmpl`; `LICENSE` from `templates/license.tmpl`; `.gitignore` from `templates/gitignore.tmpl`.
- `git init -b main && git add -A && git commit -m "initial release"`
- Push to the user's GitHub repo (confirm before pushing).
- **Enable GitHub Pages**: `gh api -X POST /repos/<owner>/<repo>/pages -f "source[branch]=main" -f "source[path]=/"`
- Live URL: `https://<owner>.github.io/<repo>/`

### New project mode

- Build `<project>/<version>/`.
- `<project>/index.html` (version selector) + `<project>/versions.json` (single entry, `latest: true`).
- Push a new entry to the **head** of the repo-root `projects.json` `projects` array.
- Repo-root `index.html` / `selector.css` are NOT touched.
- `git add -A && git commit -m "add wiki for <project>"` and push (confirm first).

### Append version mode

- Add `<project>/v<x>/`.
- Update `<project>/versions.json`: push the new entry to the **head**, set its `latest` to `true`, flip every other entry's `latest` to `false`.
- Update that project's entry in repo-root `projects.json` (`versions`, `latest`, `updated`) and move it to the head of the array.
- Repo-root `index.html` / `selector.css` and other projects are NOT touched.
- `git add -A && git commit -m "add <version> for <project>"` and push (confirm first).

See `reference/monorepo.md` for the naming rule and error handling.

---

## Importing existing standalone wiki repos

To bring already-generated standalone wiki repos into the mono-repo, run
the import flow. It is a separate entry point and can batch multiple
source repos. Before moving or copying many files, tell the user and get
confirmation.

For each source wiki repo:

1. **Detect the source layout** — `versions.json` at the source root →
   already versioned; only root-level `index.html` + `web/js/chapters.js` → flat.
2. **Read the project identity** from the source's `web/js/chapters.js`
   (`PROJECT_NAME`, `PROJECT_GITHUB_REPO`); for a versioned source use the
   latest version's `chapters.js`. Project dir = `slug(PROJECT_NAME)`.
3. **Flat source** — run the flat→versioned conversion (version dir from
   `ANALYZED_TAG`, else `ANALYZED_COMMIT`; see `reference/versioning.md`),
   landing the output at `<mono>/<project>/v<x>/`, and create
   `<mono>/<project>/index.html` + `<mono>/<project>/versions.json`.
4. **Versioned source** — copy the source contents (except `README.md` /
   `LICENSE` / `.gitignore` / `.git/`) into `<mono>/<project>/`. Delete the
   leftover `<project>/selector.css` — the version selector uses `../selector.css`.
5. **Inject the project dropdown** into every version of the imported
   project: ship the current `web/js/versions.js` (with `initProjectSwitcher`),
   add `<select id="project-switcher">` to each `index.html` topbar, and add
   the import + `initProjectSwitcher()` call to each `app.js`. Nav chrome
   only — never chapter `.md` content.
6. **Register the project** in repo-root `projects.json`; ensure repo-root
   `index.html` (project selector) + `selector.css` exist.
7. The source repo is **not deleted** — import copies.

See `reference/monorepo.md` for full details and error handling.
````

- [ ] **Step 5: Add monorepo.md to the Reference files list**

In `SKILL.md`, this exact line exists:

```text
- `reference/versioning.md` — multi-version layout, naming rule, fresh/append/migrate modes
```

Replace it with:

```text
- `reference/monorepo.md` — three-level mono-repo layout, run modes, import flow
- `reference/versioning.md` — the version layer: naming rule, versions.json, version selector
```

- [ ] **Step 6: Verify**

Run: `grep -nE 'TBD|TODO|FIXME' SKILL.md` — expect no output.
Read the Phase 0, Phase 4, Phase 7, and Import sections and confirm: Phase 0 has the three-mode table (new mono-repo / new project / append version); Phase 7 has the three matching subsections; the Import section is present; `reference/monorepo.md` is in the reference list.

- [ ] **Step 7: Commit**

```bash
git add SKILL.md
git commit -m "Rewrite SKILL.md for mono-repo layout"
```

---

## Task 9: Update reference/workflow.md

**Files:**
- Modify: `reference/workflow.md`

Make three edits.

- [ ] **Step 1: Replace the Phase 0 subsection**

In `reference/workflow.md`, this exact block exists:

````text
### Phase 0: Detect mode + gather inputs

Probe the output directory first — `versions.json` present → append;
root-level `index.html` + `web/js/chapters.js` but no `versions.json` →
migrate; otherwise → fresh. See `reference/versioning.md`.

Ask user (one at a time):
1. Codebase path
2. Output directory
3. Project name + GitHub repo (fresh only)
4. Language (fresh only)
5. Lock version (default = current HEAD)

Derive the version directory name: exact tag if any, else `<branch>-<shortSHA>`.
Save to memory.
````

Replace it with:

````text
### Phase 0: Detect mode + gather inputs

Probe the output directory — no `projects.json` → new mono-repo;
`projects.json` present and the target project dir absent → new project;
`projects.json` present and the target project dir present → append
version. See `reference/monorepo.md`.

Ask user (one at a time):
1. Codebase path
2. Output directory (the mono-repo path)
3. Project name + GitHub repo (new mono-repo / new project only)
4. Language (new mono-repo / new project only)
5. Lock version (default = current HEAD)

Derive names: project dir = `slug(project name)`; version dir = exact tag
if any, else `<branch>-<shortSHA>`. Save to memory.
````

- [ ] **Step 2: Replace the Phase 5 subsection**

In `reference/workflow.md`, this exact block exists:

`````text
### Phase 5: Web setup

All per-version output goes into the version subdirectory `v<x>/`.

```bash
# Copy web shell into the version subdirectory
mkdir -p <output>/v<x>
cp -R <skill>/templates/web <output>/v<x>/
cp <skill>/templates/index.html <output>/v<x>/index.html

# Edit v<x>/web/js/chapters.js: replace placeholders
#   PROJECT_GITHUB_REPO, ANALYZED_COMMIT, ANALYZED_TAG, ANALYZED_DATE
#   CHAPTERS array entries
#   TOURS array entries

# Edit v<x>/web/js/architecture.js: rewrite the 4-layer LAYERS array
# Edit v<x>/index.html: <title>

# Test
cd <output> && python3 -m http.server 8765
# Visit http://localhost:8765/  (version selector → pick a version)
```
`````

Replace it with:

`````text
### Phase 5: Web setup

All per-version output goes into `<project>/<version>/` inside the mono-repo.

```bash
# Copy web shell into the version subdirectory
mkdir -p <output>/<project>/v<x>
cp -R <skill>/templates/web <output>/<project>/v<x>/
cp <skill>/templates/index.html <output>/<project>/v<x>/index.html

# Edit <project>/v<x>/web/js/chapters.js: replace placeholders
#   PROJECT_GITHUB_REPO, ANALYZED_COMMIT, ANALYZED_TAG, ANALYZED_DATE
#   CHAPTERS array entries
#   TOURS array entries

# Edit <project>/v<x>/web/js/architecture.js: rewrite the 4-layer LAYERS array
# Edit <project>/v<x>/index.html: <title>

# Test
cd <output> && python3 -m http.server 8765
# Visit http://localhost:8765/  (project selector → version selector → viewer)
```
`````

- [ ] **Step 3: Replace the Phase 7 subsection**

In `reference/workflow.md`, the Phase 7 subsection spans from `### Phase 7: Publish (versioned)` through the line `Tell user: live URL is \`https://<owner>.github.io/<repo>/\`, first build takes 1-2 min.` (just before `## Quality checks`). Replace that entire subsection with:

`````text
### Phase 7: Publish (mono-repo)

**New mono-repo** — first project in a brand-new repo:

```bash
cd <output>
cp <skill>/templates/project-index.html index.html   # replace {{MONOREPO_TITLE}}
cp <skill>/templates/selector.css selector.css
cp <skill>/templates/projects.json projects.json      # fill the single entry
# <project>/index.html from templates/version-index.html (replace {{PROJECT_NAME}})
# <project>/versions.json from templates/versions.json (single entry)
git init -b main
git add -A
git commit -m "initial release"
git remote add origin <user's repo URL>
git push -u origin main
gh api -X POST /repos/<owner>/<repo>/pages \
  -f "build_type=legacy" \
  -f "source[branch]=main" \
  -f "source[path]=/"
```

**New project** — existing mono-repo: build a new `<project>/` (version
selector + `versions.json` + first `v<x>/`), push a new entry to the head
of `projects.json`, leave repo-root `index.html` / `selector.css`
untouched, then `git add -A && git commit && git push`.

**Append version** — existing project: add `<project>/v<x>/`, update
`<project>/versions.json` (head push, flip `latest`), update that
project's entry in `projects.json` (`versions` / `latest` / `updated`,
move to head), then `git add -A && git commit && git push`.

**Importing existing standalone wiki repos**: confirm with the user, then
for each source detect flat vs versioned layout, place its content under
`<mono>/<project>/`, inject the project dropdown, and register the project
in `projects.json`. Full steps in `reference/monorepo.md`.

Tell user: live URL is `https://<owner>.github.io/<repo>/`, first build takes 1-2 min.
`````

- [ ] **Step 4: Verify**

Run: `grep -nE 'TBD|TODO|FIXME' reference/workflow.md` — expect no output.
Run: `grep -c '^```' reference/workflow.md` — expect an even number (balanced fences).

- [ ] **Step 5: Commit**

```bash
git add reference/workflow.md
git commit -m "Update workflow doc for mono-repo layout"
```

---

## Task 10: Re-scope reference/versioning.md to the version layer

**Files:**
- Modify: `reference/versioning.md` (full-file replacement)

- [ ] **Step 1: Overwrite the file**

Replace the entire content of `reference/versioning.md` with the exact content between the markers (do not include the marker lines):

````text
----- BEGIN reference/versioning.md -----
# Versioning: the version layer

Inside the mono-repo, each project directory holds one or more **versions**
of that project's wiki: `<project>/<version>/`. This doc covers the version
layer — directory naming, the `versions.json` manifest, the version
selector page, and the in-viewer version dropdown. For the project layer
and the overall repo, see `reference/monorepo.md`.

## Where the version layer sits

```
<mono-repo>/<project>/
├── index.html        version selector (from templates/version-index.html)
├── versions.json     this project's version manifest
├── v0.22.0/          one complete, self-contained wiki
│   ├── index.html  *.md  web/
└── v0.21.1/
```

Each `v<x>/` is a complete wiki that runs on its own. Versions share no
files. Once generated, a version is frozen.

## versions.json

`<project>/versions.json` drives the project's version selector page and
the in-viewer version dropdown.

```json
{
  "project": "vLLM",
  "versions": [
    { "dir": "v0.22.0", "label": "v0.22.0", "commit": "abc1234",
      "target_ref": "v0.22.0", "date": "2026-05-18", "latest": true },
    { "dir": "v0.21.1", "label": "v0.21.1", "commit": "0867497",
      "target_ref": "v0.21.1", "date": "2026-04-01", "latest": false }
  ]
}
```

- `dir` — version subdirectory name, also the routing id.
- `label` — text shown in the dropdown and on the selector card. Defaults to `dir`.
- `commit` — short SHA of the analyzed target commit.
- `target_ref` — the target tag or branch name.
- `date` — generation date (ISO).
- `latest` — exactly one entry is `true`.

The array is newest-first. Appending a version pushes a new entry to the
head and flips the previous `latest` to `false`.

## Version directory naming

After locking the target version:

1. `git describe --tags --exact-match HEAD` succeeds → use that tag, e.g. `v0.22.0/`.
2. Otherwise → `<branch>-<shortSHA>`, e.g. `main-a1b2c3d/`. Branch from `git rev-parse --abbrev-ref HEAD`.
3. Replace `/` and other path-illegal characters with `-`.
4. If the derived directory already exists, STOP and ask the user: overwrite, or pick a different name. Never silently overwrite.

## Version selector page

`<project>/index.html` (from `templates/version-index.html`) fetches the
sibling `versions.json` and lists versions as cards. It links back to the
project selector via `../index.html` and loads `../selector.css`.

## In-viewer version dropdown

`web/js/versions.js` exports `initVersionSwitcher()`, which fetches
`../versions.json`, renders the topbar version dropdown, and on change
navigates to `../<dir>/index.html`. On fetch failure the dropdown hides
itself. (`versions.js` also exports `initProjectSwitcher()` — see
`reference/monorepo.md`.)

`STORAGE_PREFIX` in `chapters.js` includes `PROJECT_NAME` and the version
directory name, so multiple versions on the same origin do not collide in
localStorage.

## Converting an old flat-layout wiki to versioned

Pre-versioning wikis have a flat layout (no `versions.json`). The import
flow (`reference/monorepo.md`) converts them. The flat→versioned
conversion for one wiki:

1. Read the old `web/js/chapters.js` for `ANALYZED_TAG`, `ANALYZED_COMMIT`,
   `ANALYZED_DATE`. Derive the version directory name (prefer `ANALYZED_TAG`,
   else `ANALYZED_COMMIT`).
2. Move the flat wiki's `index.html`, all `.md`, and `web/` into `v<x>/`.
3. Patch `v<x>/web/js/chapters.js`: replace its old `STORAGE_PREFIX` block
   with the version-aware block — `getCurrentVersionDir()`,
   `getCurrentProjectDir()`, and the new `STORAGE_PREFIX` (identical to the
   current `templates/web/js/chapters.js`). REQUIRED: the injected
   `versions.js` imports those functions, or the viewer breaks on startup.
4. Inject the version dropdown and project dropdown into `v<x>/`: copy in
   `web/js/versions.js`, add `<select id="version-switcher">` and
   `<select id="project-switcher">` to the `index.html` topbar, add the
   imports + `initVersionSwitcher()` / `initProjectSwitcher()` calls to
   `web/js/app.js`. Nav chrome only — never the chapter `.md` content.
5. Create the project's `index.html` (version selector) + `versions.json`
   (single entry).

## Error handling

- Version dir collision → ask overwrite / rename; never silent overwrite.
- `versions.json` corrupt or invalid → report and ask the user.
- Viewer offline (no `versions.json` reachable) → the version dropdown hides itself.
----- END reference/versioning.md -----
````

- [ ] **Step 2: Verify**

Run: `grep -nE 'TBD|TODO|FIXME|BEGIN reference|END reference' reference/versioning.md`
Expected: no output.
Run: `grep -c '^```' reference/versioning.md` — expect an even number.

- [ ] **Step 3: Commit**

```bash
git add reference/versioning.md
git commit -m "Re-scope versioning.md to the version layer"
```

---

## Task 11: Update readme.md.tmpl for the mono-repo layout

**Files:**
- Modify: `templates/readme.md.tmpl`

- [ ] **Step 1: Replace the 多版本 section**

In `templates/readme.md.tmpl`, this exact block exists:

````text
## 多版本

本 wiki 按目标代码版本分目录存放，每个版本一份完整、自包含的 wiki：

- 仓库根的 `index.html` 是**版本选择页**，列出所有已生成的版本。
- 进入某个版本后，查看器顶栏有**版本下拉**，可直接切到其他版本。
- 每个版本的 `file:line` 链接锁定在该版本分析时的 commit，互不影响。
````

Replace it with:

````text
## 多项目 / 多版本

本仓库是一个 mono-repo，三级结构 `仓库 / 项目 / 版本 / wiki`：

- 仓库根的 `index.html` 是**项目选择页**，列出所有项目。
- 每个项目目录下的 `index.html` 是**版本选择页**，列出该项目的所有版本。
- 进入某个版本后，查看器顶栏有**项目下拉**和**版本下拉**，可直接切换。
- 每个版本的 `file:line` 链接锁定在该版本分析时的 commit，互不影响。
````

- [ ] **Step 2: Update the AI 协助声明 line**

In `templates/readme.md.tmpl`, this exact line exists:

```text
> **AI 协助声明**：本仓库的章节正文与可视化由 Claude（Anthropic）协助生成，作者审阅并迭代修订。本 wiki 按代码版本分目录存放——目标代码出新版时会生成新的版本目录，旧版本同时保留可查，见下方「多版本」。
```

Replace it with:

```text
> **AI 协助声明**：本仓库的章节正文与可视化由 Claude（Anthropic）协助生成，作者审阅并迭代修订。本仓库是 mono-repo——按「项目 / 版本」分目录存放多份 wiki，旧版本同时保留可查，见下方「多项目 / 多版本」。
```

- [ ] **Step 3: Verify**

Run: `grep -n '多项目 / 多版本' templates/readme.md.tmpl`
Expected: two matches — the section heading and the AI 协助声明 reference.

- [ ] **Step 4: Commit**

```bash
git add templates/readme.md.tmpl
git commit -m "Document mono-repo layout in README template"
```

---

## Final verification

- [ ] **Step 1: Confirm spec coverage**

Re-read `docs/specs/2026-05-18-codebase-wiki-monorepo-design.md` and confirm
each section maps to a task: layout (Tasks 6, 7), `projects.json` (Tasks 1,
7), project naming (Tasks 7, 8), three modes (Tasks 7, 8, 9), import flow
(Tasks 7, 8), project dropdown (Tasks 2, 3, 4), selector pages (Tasks 5, 6),
viewer / version-layer doc (Task 10), README (Task 11).

- [ ] **Step 2: Confirm JS validity and no placeholder leakage**

Run: `for f in templates/web/js/chapters.js templates/web/js/versions.js templates/web/js/app.js; do node --check "$f" && echo "OK $f"; done`
Expected: all three OK.
Run: `grep -rnE 'TBD|FIXME|implement later' SKILL.md reference/monorepo.md reference/versioning.md templates/project-index.html`
Expected: no output. (`{{PLACEHOLDER}}` tokens in templates are intentional.)

- [ ] **Step 3: Confirm the import graph**

Run: `grep -nE 'getCurrentProjectDir|initProjectSwitcher' templates/web/js/chapters.js templates/web/js/versions.js templates/web/js/app.js`
Expected: `chapters.js` exports `getCurrentProjectDir`; `versions.js` imports `getCurrentProjectDir` and exports `initProjectSwitcher`; `app.js` imports and calls `initProjectSwitcher`.

- [ ] **Step 4: Confirm the branch state**

Run: `git log --oneline main..monorepo`
Expected: 11 task commits plus the design-doc commit, all on `monorepo`.
