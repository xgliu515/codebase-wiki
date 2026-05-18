# Codebase-Wiki Versioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the codebase-wiki skill produce multi-version wiki repos — each target-code version gets a self-contained subdirectory, with a top-level version selector and an in-viewer version dropdown.

**Architecture:** Each version lives in its own `v<x>/` subdirectory containing a complete, self-contained wiki (`index.html` + `.md` + `web/`). A top-level `index.html` is a static selector page; `versions.json` is the single source of truth driving both the selector and the in-viewer dropdown. The skill detects three modes when run — fresh / append / migrate — and the migrate mode upgrades old flat-layout wikis.

**Tech Stack:** Vanilla ES modules (no build step), HTML/CSS, JSON. The skill itself is markdown instruction files. This repo has no automated test framework; verification is JSON validation, browser checks against fixtures, and consistency review against the spec.

**Spec:** `docs/specs/2026-05-18-codebase-wiki-versioning-design.md`

**Branch:** `versioning` (already created). All commits land here. Use single-line commit messages with no trailer, matching this repo's existing convention.

---

## File Structure

### New files

| File | Responsibility |
|------|----------------|
| `templates/versions.json` | Example `versions.json` the skill copies and fills. |
| `templates/version-index.html` | Top-level version selector page (becomes `<output>/index.html`). |
| `templates/selector.css` | Styles for the selector page; self-contained, theme via `prefers-color-scheme`. |
| `templates/web/js/versions.js` | In-viewer version dropdown module. |
| `reference/versioning.md` | Reference doc: layout, naming rule, three modes, migration. |

### Modified files

| File | Change |
|------|--------|
| `templates/web/js/chapters.js` | Add `getCurrentVersionDir()`; make `STORAGE_PREFIX` version-aware. |
| `templates/index.html` | Add `<select id="version-switcher">` to the topbar. |
| `templates/web/js/app.js` | Import and call `initVersionSwitcher()`. |
| `templates/web/css/style.css` | Add `.version-switcher` styling. |
| `SKILL.md` | Rewrite Phase 0 (three-mode detection), Phase 4 (output to `v<x>/`), Phase 7 (versioned publish). |
| `reference/workflow.md` | Update Phase 0 / Phase 5 / Phase 7 to match. |
| `templates/readme.md.tmpl` | Add a short multi-version note. |

---

## Task 1: versions.json example template

**Files:**
- Create: `templates/versions.json`

- [ ] **Step 1: Write the file**

Create `templates/versions.json` with this exact content:

```json
{
  "project": "{{PROJECT_NAME}}",
  "versions": [
    {
      "dir": "{{VERSION_DIR}}",
      "label": "{{VERSION_LABEL}}",
      "commit": "{{COMMIT_SHORT}}",
      "target_ref": "{{TARGET_REF}}",
      "date": "{{DATE_ISO}}",
      "latest": true
    }
  ]
}
```

- [ ] **Step 2: Verify it is valid JSON**

Run: `python3 -m json.tool templates/versions.json`
Expected: the file content is echoed back pretty-printed, no error.

- [ ] **Step 3: Commit**

```bash
git add templates/versions.json
git commit -m "Add versions.json manifest template"
```

---

## Task 2: Version-aware STORAGE_PREFIX in chapters.js

**Files:**
- Modify: `templates/web/js/chapters.js:53-55`

- [ ] **Step 1: Replace the STORAGE_PREFIX block**

The current end of `chapters.js` (lines 53-55) reads:

```js
// localStorage key 前缀：由 PROJECT_NAME 自动派生，避免多个 wiki 互相覆盖
export const STORAGE_PREFIX =
  (PROJECT_NAME.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'codebase') + '-wiki';
```

Replace it with:

```js
// 当前版本目录名：取 URL 路径里最后一个非 .html 段，例如
//   /xxx-wiki/v0.22.0/index.html  →  'v0.22.0'
// 用于版本切换下拉与 localStorage 隔离。非版本化布局下返回空串。
export function getCurrentVersionDir() {
  const segs = location.pathname.split('/').filter(Boolean);
  if (segs.length && /\.html?$/i.test(segs[segs.length - 1])) segs.pop();
  return segs.length ? segs[segs.length - 1] : '';
}

// localStorage key 前缀：由 PROJECT_NAME 派生，并追加版本目录名做隔离，
// 避免同源下多个版本的查看器互相覆盖阅读状态。
export const STORAGE_PREFIX = (() => {
  const base = (PROJECT_NAME.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'codebase') + '-wiki';
  const ver = getCurrentVersionDir();
  return ver ? `${base}-${ver}` : base;
})();
```

- [ ] **Step 2: Verify the module still parses**

Run: `node --check templates/web/js/chapters.js`
Expected: no output, exit code 0 (syntax OK).

- [ ] **Step 3: Verify the derivation logic**

Run:
```bash
node -e "global.location={pathname:'/xxx-wiki/v0.22.0/index.html'}; const s=g=>{const a=g.split('/').filter(Boolean); if(a.length&&/\.html?$/i.test(a[a.length-1]))a.pop(); return a.length?a[a.length-1]:'';}; console.log(s(location.pathname));"
```
Expected: prints `v0.22.0`.

- [ ] **Step 4: Commit**

```bash
git add templates/web/js/chapters.js
git commit -m "Make STORAGE_PREFIX version-aware in web viewer"
```

---

## Task 3: versions.js dropdown module

**Files:**
- Create: `templates/web/js/versions.js`

- [ ] **Step 1: Write the module**

Create `templates/web/js/versions.js` with this exact content:

```js
import { getCurrentVersionDir } from './chapters.js';

// =========================================================
// 版本切换下拉
// 运行时 fetch 顶层 ../versions.json，在顶栏渲染版本下拉。
// 切换版本 = 跳到目标版本首页（不做跨版本深链映射）。
// fetch 失败（如本地单目录打开、非版本化布局）时静默隐藏下拉。
// =========================================================

export async function initVersionSwitcher() {
  const sel = document.getElementById('version-switcher');
  if (!sel) return;

  let manifest;
  try {
    const resp = await fetch('../versions.json', { cache: 'no-cache' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    manifest = await resp.json();
  } catch {
    sel.hidden = true;
    return;
  }

  const versions = Array.isArray(manifest && manifest.versions) ? manifest.versions : [];
  if (versions.length < 1) {
    sel.hidden = true;
    return;
  }

  const current = getCurrentVersionDir();
  sel.innerHTML = '';
  for (const v of versions) {
    const opt = document.createElement('option');
    opt.value = v.dir;
    opt.textContent = (v.label || v.dir) + (v.latest ? '  (latest)' : '');
    if (v.dir === current) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.hidden = false;

  sel.addEventListener('change', () => {
    const dir = sel.value;
    if (dir && dir !== current) {
      location.href = `../${dir}/index.html`;
    }
  });
}
```

- [ ] **Step 2: Verify the module parses**

Run: `node --check templates/web/js/versions.js`
Expected: no output, exit code 0.

- [ ] **Step 3: Browser smoke test with a fixture**

Create a temporary fixture and serve it:
```bash
mkdir -p /tmp/vtest/v1 /tmp/vtest/v2
cp -R templates/web /tmp/vtest/v1/
cp -R templates/web /tmp/vtest/v2/
printf '{"project":"T","versions":[{"dir":"v2","label":"v2","commit":"bbb","target_ref":"v2","date":"2026-05-18","latest":true},{"dir":"v1","label":"v1","commit":"aaa","target_ref":"v1","date":"2026-04-01","latest":false}]}' > /tmp/vtest/versions.json
printf '<!doctype html><select id="version-switcher" hidden></select><script type="module">import {initVersionSwitcher} from "./web/js/versions.js"; initVersionSwitcher();</script>' > /tmp/vtest/v1/index.html
cd /tmp/vtest && python3 -m http.server 8799
```
Open `http://localhost:8799/v1/index.html` in a browser. Open DevTools.
Expected: the `<select>` becomes visible with two options — `v2  (latest)` and `v1`; `v1` is selected. Choosing `v2` navigates to `/v2/index.html`. No console errors.
Stop the server (Ctrl-C) and run `rm -rf /tmp/vtest` when done.

- [ ] **Step 4: Commit**

```bash
git add templates/web/js/versions.js
git commit -m "Add version switcher dropdown module"
```

---

## Task 4: Wire the dropdown into the viewer

**Files:**
- Modify: `templates/index.html:16-20`
- Modify: `templates/web/js/app.js` (import line + `main()` body)
- Modify: `templates/web/css/style.css` (after the `.brand-sub` rule, ~line 80)

- [ ] **Step 1: Add the select element to the topbar**

In `templates/index.html`, the topbar currently reads:

```html
  <header class="topbar">
    <div class="brand">
      <a href="#/">{{PROJECT_NAME}}<span class="brand-sub"> Wiki</span></a>
    </div>
    <div class="search-wrap">
```

Replace with:

```html
  <header class="topbar">
    <div class="brand">
      <a href="#/">{{PROJECT_NAME}}<span class="brand-sub"> Wiki</span></a>
    </div>
    <select id="version-switcher" class="version-switcher" title="切换版本" hidden></select>
    <div class="search-wrap">
```

- [ ] **Step 2: Add the import to app.js**

In `templates/web/js/app.js`, the imports end at line 8 (`import { initGlossary } from './glossary.js';`). Add a new line directly after it:

```js
import { initVersionSwitcher } from './versions.js';
```

- [ ] **Step 3: Call initVersionSwitcher in main()**

In `templates/web/js/app.js`, the `main()` function has this block (the repo-root button wiring), ending with:

```js
    if (updated === null) return;
    setRepoRoot(updated);
    showToast(updated.trim() ? '已切到本地 VSCode 模式。刷新生效' : '已切到 GitHub 模式。刷新生效');
  });

  // 键盘
  initKeybindings();
```

Replace that tail with:

```js
    if (updated === null) return;
    setRepoRoot(updated);
    showToast(updated.trim() ? '已切到本地 VSCode 模式。刷新生效' : '已切到 GitHub 模式。刷新生效');
  });

  // 版本切换下拉（无 versions.json 时自动隐藏，不阻塞启动）
  initVersionSwitcher();

  // 键盘
  initKeybindings();
```

- [ ] **Step 4: Add dropdown styling**

In `templates/web/css/style.css`, the `.brand-sub` rule (lines 76-80) is:

```css
.brand-sub {
  color: var(--text-soft);
  font-weight: 500;
  font-size: 14px;
}
```

Add directly after it:

```css
.version-switcher {
  margin-left: 14px;
  background: var(--bg-soft);
  color: var(--text-soft);
  border: 1px solid var(--border);
  border-radius: 8px;
  height: 30px;
  padding: 0 8px;
  font-family: var(--font-sans);
  font-size: 13px;
  cursor: pointer;
}
.version-switcher:hover { color: var(--text); border-color: var(--text-faint); }
```

- [ ] **Step 5: Verify app.js parses**

Run: `node --check templates/web/js/app.js`
Expected: no output, exit code 0.

- [ ] **Step 6: Browser smoke test**

Run:
```bash
mkdir -p /tmp/vtest2/v1 /tmp/vtest2/v2
cp -R templates/web /tmp/vtest2/v1/
cp -R templates/web /tmp/vtest2/v2/
sed 's/{{PROJECT_NAME}}/Demo/g' templates/index.html > /tmp/vtest2/v1/index.html
cp /tmp/vtest2/v1/index.html /tmp/vtest2/v2/index.html
printf '{"project":"Demo","versions":[{"dir":"v2","label":"v2","commit":"bbb","target_ref":"v2","date":"2026-05-18","latest":true},{"dir":"v1","label":"v1","commit":"aaa","target_ref":"v1","date":"2026-04-01","latest":false}]}' > /tmp/vtest2/versions.json
cd /tmp/vtest2 && python3 -m http.server 8798
```
Open `http://localhost:8798/v1/index.html`. (The viewer body will error because `chapters.js` still has `{{...}}` placeholders — that is expected and unrelated.) In the topbar, confirm: the version dropdown appears next to the brand, shows `v2  (latest)` and `v1`, `v1` selected; selecting `v2` navigates to `/v2/index.html`.
Stop the server and run `rm -rf /tmp/vtest2`.

- [ ] **Step 7: Commit**

```bash
git add templates/index.html templates/web/js/app.js templates/web/css/style.css
git commit -m "Wire version switcher into the web viewer"
```

---

## Task 5: Top-level version selector page

**Files:**
- Create: `templates/version-index.html`
- Create: `templates/selector.css`

- [ ] **Step 1: Write the selector page**

Create `templates/version-index.html` with this exact content:

```html
<!DOCTYPE html>
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
</head>
<body>
  <main class="selector">
    <h1>{{PROJECT_NAME}} <span>中文参考 Wiki</span></h1>
    <p class="subtitle">选择一个代码版本查看对应的 wiki。</p>
    <ul id="version-list" class="version-list"></ul>
    <p id="empty" class="empty" hidden>未找到 versions.json，或其中没有任何版本。</p>
  </main>
  <script>
    (async function () {
      const listEl = document.getElementById('version-list');
      const emptyEl = document.getElementById('empty');
      try {
        const resp = await fetch('versions.json', { cache: 'no-cache' });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const manifest = await resp.json();
        const versions = Array.isArray(manifest && manifest.versions) ? manifest.versions : [];
        if (!versions.length) { emptyEl.hidden = false; return; }
        for (const v of versions) {
          const li = document.createElement('li');
          const a = document.createElement('a');
          a.href = v.dir + '/index.html';
          a.className = 'version-card';
          a.innerHTML =
            '<div class="vc-head"><span class="vc-label"></span>' +
            (v.latest ? '<span class="vc-badge">latest</span>' : '') + '</div>' +
            '<dl class="vc-meta">' +
            '<div><dt>目标</dt><dd class="vc-ref"></dd></div>' +
            '<div><dt>commit</dt><dd class="vc-commit"></dd></div>' +
            '<div><dt>日期</dt><dd class="vc-date"></dd></div>' +
            '</dl>';
          a.querySelector('.vc-label').textContent = v.label || v.dir;
          a.querySelector('.vc-ref').textContent = v.target_ref || '—';
          a.querySelector('.vc-commit').textContent = v.commit || '—';
          a.querySelector('.vc-date').textContent = v.date || '—';
          li.appendChild(a);
          listEl.appendChild(li);
        }
      } catch (err) {
        emptyEl.hidden = false;
        emptyEl.textContent = '加载 versions.json 失败：' + (err.message || err);
      }
    })();
  </script>
</body>
</html>
```

- [ ] **Step 2: Write the selector stylesheet**

Create `templates/selector.css` with this exact content:

```css
/* 顶层版本选择页样式 —— 与查看器主题独立，自包含一份变量。 */
:root {
  --bg: #fafaf9;
  --bg-elev: #ffffff;
  --border: #e3dfd8;
  --text: #1f2024;
  --text-soft: #5b5d63;
  --accent: #c2410c;
  --font-sans: system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #16181d; --bg-elev: #1d2027; --border: #2e3340;
    --text: #e8e9ec; --text-soft: #a8acb5; --accent: #fb923c;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: var(--font-sans);
  background: var(--bg);
  color: var(--text);
  line-height: 1.6;
}
.selector {
  max-width: 720px;
  margin: 0 auto;
  padding: 64px 24px;
}
.selector h1 {
  font-size: 28px;
  margin: 0 0 4px;
  color: var(--accent);
}
.selector h1 span { color: var(--text-soft); font-weight: 500; font-size: 20px; }
.subtitle { color: var(--text-soft); margin: 0 0 32px; }
.version-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 14px; }
.version-card {
  display: block;
  padding: 18px 20px;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: 12px;
  text-decoration: none;
  color: inherit;
  transition: border-color .15s, transform .15s;
}
.version-card:hover { border-color: var(--accent); transform: translateY(-2px); }
.vc-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.vc-label { font-size: 18px; font-weight: 700; }
.vc-badge {
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  background: var(--accent);
  padding: 2px 8px;
  border-radius: 999px;
}
.vc-meta { display: flex; flex-wrap: wrap; gap: 6px 28px; margin: 0; }
.vc-meta div { display: flex; gap: 8px; }
.vc-meta dt { color: var(--text-soft); font-size: 13px; margin: 0; }
.vc-meta dd { margin: 0; font-size: 13px; font-family: monospace; }
.empty { color: var(--text-soft); }
```

- [ ] **Step 3: Browser smoke test**

Run:
```bash
mkdir -p /tmp/vtest3
sed 's/{{PROJECT_NAME}}/Demo/g' templates/version-index.html > /tmp/vtest3/index.html
cp templates/selector.css /tmp/vtest3/
printf '{"project":"Demo","versions":[{"dir":"v0.22.0","label":"v0.22.0","commit":"bbb1234","target_ref":"v0.22.0","date":"2026-05-18","latest":true},{"dir":"v0.21.1","label":"v0.21.1","commit":"aaa9876","target_ref":"v0.21.1","date":"2026-04-01","latest":false}]}' > /tmp/vtest3/versions.json
cd /tmp/vtest3 && python3 -m http.server 8797
```
Open `http://localhost:8797/`.
Expected: two cards — `v0.22.0` with a `latest` badge, `v0.21.1` without; each shows target / commit / date; hovering lifts the card; clicking a card navigates to `<dir>/index.html` (404 is fine — the dirs do not exist in the fixture). No console errors.
Stop the server and run `rm -rf /tmp/vtest3`.

- [ ] **Step 4: Commit**

```bash
git add templates/version-index.html templates/selector.css
git commit -m "Add top-level version selector page"
```

---

## Task 6: reference/versioning.md

**Files:**
- Create: `reference/versioning.md`

- [ ] **Step 1: Write the reference doc**

Create `reference/versioning.md` with this exact content:

````markdown
# Versioning: multi-version wiki layout

A wiki repo holds one or more versions of the target codebase, each as a
self-contained subdirectory. This doc defines the layout, the version
directory naming rule, the three run modes, and the migration path for
old flat-layout wikis.

## Repo layout

```
xxx-wiki/                       (git repo, GitHub Pages serves from main /)
├── index.html                  top-level version selector (from templates/version-index.html)
├── selector.css                selector page styles (from templates/selector.css)
├── versions.json               version manifest — the single source of truth
├── README.md  LICENSE  .gitignore
├── v0.22.0/                    one complete, self-contained wiki
│   ├── index.html              per-version viewer entry (from templates/index.html)
│   ├── 01-...md ... 12-glossary-and-faq.md
│   ├── tour-00-overview.md ... tour-NN-*.md
│   └── web/  (css/  js/)
├── v0.21.1/                    previous version, same structure, fully independent
└── main-a1b2c3d/               no-tag example
```

Each `v<x>/` is a complete wiki that runs on its own. Versions share no
files. Once generated, a version is frozen — later skill upgrades never
touch it (the one exception: migration injects the version dropdown into
a migrated old version, see below).

## versions.json

The top-level `versions.json` drives both the selector page and the
in-viewer dropdown. Schema:

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

The array is newest-first. Adding a version means pushing a new entry to
the head and flipping the previous `latest` to `false`.

## Version directory naming

After locking the target version (Phase 0), derive the directory name:

1. If `git describe --tags --exact-match HEAD` succeeds → use that tag, e.g. `v0.22.0/`.
2. Otherwise → `<branch>-<shortSHA>`, e.g. `main-a1b2c3d/`. Branch is `git rev-parse --abbrev-ref HEAD`.
3. Replace any `/` and other path-illegal characters with `-`.
4. If the derived directory already exists, STOP and ask the user: overwrite it, or pick a different name. Never silently overwrite.

## Three run modes

When the skill runs, probe the output directory:

| Detected | Mode | Action |
|----------|------|--------|
| Directory missing / empty, no `versions.json` | fresh | Build a new v2-layout repo |
| `versions.json` present | append | Add one `v<x>/` |
| Root-level `index.html` + `web/js/chapters.js`, no `versions.json` | migrate | Migrate the old wiki, then append |

### Fresh mode

`git init -b main` → write top-level `index.html`, `selector.css`,
`README.md`, `LICENSE`, `.gitignore` → build the first `v<x>/` → write
`versions.json` (single entry, `latest: true`) → commit → enable Pages.

### Append mode

Repo already exists → add a new `v<x>/` → push a new entry to the head of
`versions.json` and flip the prior `latest` to `false` → top-level
`index.html` / `selector.css` are NOT touched → commit and push.

### Migrate mode

The old flat-layout wiki has no `versions.json`. Migration must be
confirmed by the user before running (it `git mv`s many files):

1. Read the old `web/js/chapters.js` for `ANALYZED_TAG`, `ANALYZED_COMMIT`,
   `ANALYZED_DATE`, `PROJECT_NAME`, `PROJECT_GITHUB_REPO`. Derive the
   directory name via the naming rule (prefer `ANALYZED_TAG`, else `ANALYZED_COMMIT`).
2. `git mv` the root-level old wiki — `index.html`, all `.md`, `web/` —
   into `v<derived>/`. Keep `README.md`, `LICENSE`, `.gitignore`, `.git/`
   at the root. `git mv` preserves history.
3. Inject the version dropdown into the migrated version's viewer:
   - Copy the new `web/js/versions.js` into `v<derived>/web/js/`.
   - Add the `<select id="version-switcher" class="version-switcher" title="切换版本" hidden></select>`
     element to that directory's `index.html` topbar, right after the `.brand` div.
   - Add `import { initVersionSwitcher } from './versions.js';` to that
     directory's `web/js/app.js` and a `initVersionSwitcher();` call in `main()`.
   - Add the `.version-switcher` CSS rule to that directory's `web/css/style.css`.
   - Touch only navigation chrome — never the chapter `.md` content.
4. Write the top-level `index.html` (selector), `selector.css`, and
   `versions.json` (single entry = the migrated version).
5. Continue in append mode to add the new version (the new version
   becomes `latest`; the migrated version flips to `false`).

## Error handling

- Derived directory already exists → ask overwrite / rename; never silent overwrite.
- `versions.json` corrupt or invalid → report and ask the user; never silently rebuild.
- Migration → require user confirmation before `git mv`.
- Viewer offline (no `versions.json` reachable) → the dropdown hides itself; the rest of the viewer is unaffected.
- Branch name contains a slash (e.g. `feature/x`) → replace with `-` before appending the short SHA.
````

- [ ] **Step 2: Verify the doc has no leftover placeholders**

Run: `grep -nE 'TBD|TODO|FIXME' reference/versioning.md`
Expected: no output (exit code 1).

- [ ] **Step 3: Commit**

```bash
git add reference/versioning.md
git commit -m "Add versioning reference doc"
```

---

## Task 7: Rewrite SKILL.md Phase 0 / 4 / 7

**Files:**
- Modify: `SKILL.md` (Phase 0 section, Phase 4 intro, Phase 7 section, Reference files list)

- [ ] **Step 1: Replace Phase 0**

In `SKILL.md`, the Phase 0 section currently reads:

```markdown
## Phase 0: Gather inputs (do this first)

Ask the user **one question at a time** (no batches):

1. **Codebase path**: absolute path on disk (used to read source for `file:line` refs)
2. **Project name + GitHub repo**: e.g., `vllm` + `vllm-project/vllm`
3. **Output directory**: where to put the generated wiki (suggest `<sibling>/<project>-wiki`)
4. **Wiki language**: Chinese (default) / English / bilingual
5. **Lock version**: confirm `git rev-parse --short HEAD` of the codebase as the analyzed commit, or let user specify a tag

Confirm before proceeding. Save these to memory if persistent (so next session knows).
```

Replace the entire section with:

```markdown
## Phase 0: Detect mode + gather inputs (do this first)

A wiki repo holds **multiple versions** of the target codebase, one
self-contained `v<x>/` subdirectory each. See `reference/versioning.md`.

**First, probe the output directory** to pick a mode:

| Detected | Mode | Meaning |
|----------|------|---------|
| Directory missing / empty, no `versions.json` | fresh | Build a new versioned repo |
| `versions.json` present | append | Add a new version to an existing wiki |
| Root-level `index.html` + `web/js/chapters.js`, no `versions.json` | migrate | Old flat-layout wiki — migrate, then append |

Ask the user **one question at a time** (no batches):

1. **Codebase path**: absolute path on disk (used to read source for `file:line` refs)
2. **Output directory**: where the wiki repo is / will be
3. **Project name + GitHub repo** (fresh mode only — append/migrate reuse the existing value): e.g., `vllm` + `vllm-project/vllm`
4. **Wiki language** (fresh mode only): Chinese (default) / English / bilingual
5. **Lock version**: confirm `git rev-parse --short HEAD` of the codebase as the analyzed commit, or let user specify a tag

In **append / migrate** mode, read the existing `versions.json` (append)
or old `web/js/chapters.js` (migrate) and tell the user which versions
already exist and which one this run will add.

**Derive the version directory name** from the locked version:
`git describe --tags --exact-match HEAD` → use the tag (`v0.22.0/`);
otherwise `<branch>-<shortSHA>` (`main-a1b2c3d/`). If that directory
already exists, ask the user to overwrite or rename — never silently overwrite.

Confirm before proceeding. Save inputs to memory if persistent.
```

- [ ] **Step 2: Replace the Phase 4 intro**

In `SKILL.md`, the Phase 4 section starts with:

```markdown
## Phase 4: Set up the web viewer

Copy the **entire `templates/web/` directory** to the output. Then customize:
```

Replace those three lines with:

```markdown
## Phase 4: Set up the web viewer

All generated output for this version — `index.html`, every `.md` file,
and the `web/` directory — goes into the **version subdirectory `v<x>/`**,
not the repo root. Copy `templates/web/` (including `web/js/versions.js`)
into `v<x>/web/`, and copy `templates/index.html` into `v<x>/index.html`.
Then customize:
```

- [ ] **Step 3: Replace Phase 7**

In `SKILL.md`, the Phase 7 section currently reads:

```markdown
## Phase 7: Publish

- `README.md`: use `templates/readme.md.tmpl` as starting point. Fill placeholders.
- `LICENSE`: copy `templates/license.tmpl` (MIT).
- `.gitignore`: copy `templates/gitignore.tmpl`.
- `git init -b main && git add -A && git commit -m "initial release"`
- Push to user's GitHub repo (confirm before pushing).
- **Enable GitHub Pages** via `gh api -X POST /repos/<owner>/<repo>/pages -f "source[branch]=main" -f "source[path]=/"`
- Live URL: `https://<owner>.github.io/<repo>/`
```

Replace the entire section with:

```markdown
## Phase 7: Publish (versioned)

The repo root holds the version selector + manifest; each version lives
in its own `v<x>/`. See `reference/versioning.md`.

### Fresh mode

- `v<x>/`: the full wiki built in Phases 3-6.
- Top-level `index.html`: copy `templates/version-index.html`, replace `{{PROJECT_NAME}}`.
- Top-level `selector.css`: copy `templates/selector.css` (no edits).
- Top-level `versions.json`: copy `templates/versions.json`, fill the single entry (`latest: true`).
- `README.md`: from `templates/readme.md.tmpl`; `LICENSE` from `templates/license.tmpl`; `.gitignore` from `templates/gitignore.tmpl`.
- `git init -b main && git add -A && git commit -m "initial release"`
- Push to the user's GitHub repo (confirm before pushing).
- **Enable GitHub Pages**: `gh api -X POST /repos/<owner>/<repo>/pages -f "source[branch]=main" -f "source[path]=/"`
- Live URL: `https://<owner>.github.io/<repo>/`

### Append mode

- Add the new `v<x>/` directory.
- Edit `versions.json`: push the new entry to the **head** of the `versions`
  array, set its `latest` to `true`, and flip every other entry's `latest` to `false`.
- Do **not** touch the top-level `index.html` / `selector.css` — they are
  static and driven by `versions.json`.
- `git add -A && git commit -m "add wiki for <version>"` and push (confirm first).

### Migrate mode

Before any file move, **tell the user** which directory the old wiki will
move into and **get confirmation**. Then:

- Read the old `web/js/chapters.js` (`ANALYZED_TAG` / `ANALYZED_COMMIT` /
  `ANALYZED_DATE` / `PROJECT_NAME` / `PROJECT_GITHUB_REPO`) and derive the
  migrated version's directory name.
- `git mv` the root-level `index.html`, all `.md`, and `web/` into
  `v<derived>/`. Keep `README.md` / `LICENSE` / `.gitignore` at the root.
- Inject the version dropdown into `v<derived>/`: copy in
  `web/js/versions.js`, add the `<select id="version-switcher">` to its
  `index.html` topbar, add the import + `initVersionSwitcher()` call to its
  `web/js/app.js`, and add the `.version-switcher` rule to its
  `web/css/style.css`. Do not touch chapter `.md` content.
- Write the top-level `index.html`, `selector.css`, and `versions.json`
  (single entry = the migrated version).
- Then proceed exactly as **append mode** to add this run's new version.

See `reference/versioning.md` for the full naming rule and error handling.
```

- [ ] **Step 4: Add versioning.md to the Reference files list**

In `SKILL.md`, the Reference files list has this line:

```markdown
- `reference/workflow.md` — complete step-by-step
```

Add directly after it:

```markdown
- `reference/versioning.md` — multi-version layout, naming rule, fresh/append/migrate modes
```

- [ ] **Step 5: Verify SKILL.md against the spec**

Read `SKILL.md` and confirm: Phase 0 has the three-mode table; Phase 4
says output goes into `v<x>/`; Phase 7 has fresh / append / migrate
subsections; the naming rule (tag, else `<branch>-<shortSHA>`) appears;
`reference/versioning.md` is listed. Run `grep -nE 'TBD|TODO|FIXME' SKILL.md`
— expect no output.

- [ ] **Step 6: Commit**

```bash
git add SKILL.md
git commit -m "Rewrite SKILL.md phases for versioned output"
```

---

## Task 8: Update reference/workflow.md

**Files:**
- Modify: `reference/workflow.md` (Phase 0, Phase 5, Phase 7 subsections)

- [ ] **Step 1: Replace the Phase 0 subsection**

In `reference/workflow.md`, the Phase 0 subsection reads:

```markdown
### Phase 0: Gather inputs

Ask user (one at a time):
1. Codebase path
2. Project name + GitHub repo
3. Output directory
4. Language (Chinese / English / bilingual)
5. Lock version (default = current HEAD)

Save to memory.
```

Replace with:

```markdown
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
```

- [ ] **Step 2: Replace the Phase 5 subsection heading and intro**

In `reference/workflow.md`, the Phase 5 subsection starts:

````markdown
### Phase 5: Web setup

```bash
# Copy web shell
cp -R <skill>/templates/web/* <output>/
cp <skill>/templates/web/index.html <output>/
```
````

Replace those lines with:

````markdown
### Phase 5: Web setup

All per-version output goes into the version subdirectory `v<x>/`.

```bash
# Copy web shell into the version subdirectory
mkdir -p <output>/v<x>
cp -R <skill>/templates/web <output>/v<x>/
cp <skill>/templates/index.html <output>/v<x>/index.html
```
````

- [ ] **Step 3: Replace the Phase 7 subsection**

In `reference/workflow.md`, the Phase 7 subsection reads:

````markdown
### Phase 7: Publish

```bash
cd <output>
git init -b main
git add -A
git commit -m "initial release"
git remote add origin <user's repo URL>
git push -u origin main

# Enable GitHub Pages
gh api -X POST /repos/<owner>/<repo>/pages \
  -f "build_type=legacy" \
  -f "source[branch]=main" \
  -f "source[path]=/"
```

Tell user: live URL is `https://<owner>.github.io/<repo>/`, first build takes 1-2 min.
````

Replace the entire subsection with:

````markdown
### Phase 7: Publish (versioned)

**Fresh mode** — new repo:

```bash
cd <output>
cp <skill>/templates/version-index.html index.html   # replace {{PROJECT_NAME}}
cp <skill>/templates/selector.css selector.css
cp <skill>/templates/versions.json versions.json      # fill the single entry
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

**Append mode** — existing wiki repo: add the new `v<x>/`, push a new
entry to the head of `versions.json` and flip the prior `latest` to
`false`, leave the top-level `index.html` / `selector.css` untouched,
then `git add -A && git commit && git push`.

**Migrate mode** — old flat-layout wiki: confirm with the user, `git mv`
the old root content into `v<derived>/`, inject the version dropdown
there, scaffold the top-level files + `versions.json`, then proceed as
append mode. Full steps in `reference/versioning.md`.

Tell user: live URL is `https://<owner>.github.io/<repo>/`, first build takes 1-2 min.
````

- [ ] **Step 4: Verify**

Run: `grep -nE 'TBD|TODO|FIXME' reference/workflow.md`
Expected: no output. Read the Phase 0 / 5 / 7 subsections and confirm they
match the spec (three modes, output into `v<x>/`, fresh/append/migrate publish).

- [ ] **Step 5: Commit**

```bash
git add reference/workflow.md
git commit -m "Update workflow doc for versioned output"
```

---

## Task 9: Update readme.md.tmpl

**Files:**
- Modify: `templates/readme.md.tmpl` (the AI 协助声明 line + a new section)

- [ ] **Step 1: Update the AI 协助声明 line**

In `templates/readme.md.tmpl`, this line:

```markdown
> **AI 协助声明**：本仓库的章节正文与可视化由 Claude（Anthropic）协助生成，作者审阅并迭代修订。上游主线演进很快——本 wiki 的行号锁定在上面的 commit，未来代码更新后想看新版的同名实现，自己 grep 一下。
```

Replace with:

```markdown
> **AI 协助声明**：本仓库的章节正文与可视化由 Claude（Anthropic）协助生成，作者审阅并迭代修订。本 wiki 按代码版本分目录存放——目标代码出新版时会生成新的版本目录，旧版本同时保留可查，见下方「多版本」。
```

- [ ] **Step 2: Add a 多版本 section**

In `templates/readme.md.tmpl`, find the 怎么看 section, which starts:

```markdown
## 怎么看

### 在线预览（推荐）

**<https://{{OWNER}}.github.io/{{PROJECT}}-wiki/>**
```

Insert a new section directly before `## 怎么看`:

```markdown
## 多版本

本 wiki 按目标代码版本分目录存放，每个版本一份完整、自包含的 wiki：

- 仓库根的 `index.html` 是**版本选择页**，列出所有已生成的版本。
- 进入某个版本后，查看器顶栏有**版本下拉**，可直接切到其他版本。
- 每个版本的 `file:line` 链接锁定在该版本分析时的 commit，互不影响。

```

- [ ] **Step 3: Verify**

Run: `grep -n '多版本' templates/readme.md.tmpl`
Expected: matches the new section heading and the AI 协助声明 reference.

- [ ] **Step 4: Commit**

```bash
git add templates/readme.md.tmpl
git commit -m "Document multi-version layout in README template"
```

---

## Final verification

- [ ] **Step 1: Confirm all spec requirements are covered**

Re-read `docs/specs/2026-05-18-codebase-wiki-versioning-design.md` and
confirm each section maps to a task: directory layout (Tasks 5, 6, 7),
`versions.json` (Tasks 1, 6), naming rule (Tasks 6, 7), three modes
(Tasks 6, 7, 8), migration (Tasks 6, 7), viewer dropdown (Tasks 3, 4),
selector page (Task 5), `STORAGE_PREFIX` isolation (Task 2), file change
list (all tasks).

- [ ] **Step 2: Confirm no placeholders leaked into deliverables**

Run: `grep -rnE 'TBD|FIXME|implement later' SKILL.md reference/ templates/version-index.html templates/selector.css templates/web/js/versions.js`
Expected: no output. (`{{PLACEHOLDER}}` tokens in templates are intentional and expected.)

- [ ] **Step 3: Confirm the branch state**

Run: `git log --oneline versioning ^main`
Expected: 9 task commits plus the design-doc commit, all on `versioning`.
