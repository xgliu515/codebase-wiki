# codebase-wiki i18n (zh-CN / en) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-class English wiki support to the codebase-wiki skill — UI chrome (~45 strings), CSS typography, README, glossary schema, and Phase 0 LANGUAGE input — without touching the 8 already-generated Chinese wikis.

**Architecture:** zh/en binary switch driven by `<html lang>`. Bilingual UI strings live in a single `templates/web/js/strings.js` that exports `T` (the active language table). `html[lang^="en"]` CSS selector overrides font stack and line-height. README and glossary-format have `.en.` template variants. Phase 0 adds `LANGUAGE` field; `{{LANG}}` placeholder feeds the HTML `lang` attribute and `{{TITLE_SUFFIX}}` feeds the page title.

**Tech Stack:** Pure HTML/CSS/JS, no build step, no framework. Markdown templates with `{{PLACEHOLDER}}` substitution by the skill controller in Phase 4/5.

**Spec:** `docs/specs/2026-05-24-codebase-wiki-i18n-design.md`

**Path conventions:** Plan file at `docs/plans/` (NOT `docs/superpowers/plans/`). Single-line commit messages, no Co-Authored-By trailer.

**Testing:** No automated tests (skill is markdown + templates, no JS test framework). Each task ends with a manual smoke check; final integration verification in Task 14.

---

## Task 1: Create `strings.js` with full bilingual dictionary

**Files:**
- Create: `templates/web/js/strings.js`

- [ ] **Step 1: Write the file**

`````js
// templates/web/js/strings.js
// Bilingual UI string table. Runtime picks language from <html lang>.
// Per-project content (chapter titles, layer names) lives in chapters.js / architecture.js, NOT here.

export const STRINGS = {
  zh: {
    // <title> suffix — also embedded at scaffold time via {{TITLE_SUFFIX}} in index.html
    title_suffix: '中文参考 Wiki',

    // Topbar
    search_placeholder: '搜索 (按 / 聚焦)',
    switch_project: '切换项目',
    switch_version: '切换版本',
    prev_chapter: '上一章 (k)',
    next_chapter: '下一章 (j)',
    toggle_theme: '切换主题 (t)',
    source_mode_btn_label: '源码',
    source_mode_title: '源码链接模式(默认 GitHub,可切到本地 VSCode)',

    // Loading / empty states
    loading: '加载中…',
    loading_chapter: (title) => `加载 ${title}…`,
    rendering: '⏳ 渲染中…',
    toc_title: '本页目录',
    toc_empty: '无目录',
    search_no_results: '无结果',
    click_to_expand: '点击放大',

    // Sidebar
    sidebar_home: '首页',
    sidebar_tour_head: '单请求 Trace 导览',
    sidebar_ref_head: (n) => `参考手册(${n} 章)`,
    sidebar_toggle_aria: '展开/收起',

    // Toasts / navigation
    toast_first: '已经是第一篇',
    toast_last: '已经是最后一篇',

    // Source-mode dialog (app.js repo-root-btn)
    source_mode_local: '本地 VSCode',
    source_mode_prompt: (mode, project) =>
      `当前模式:${mode}\n\n` +
      `留空(默认)→ 跳到 GitHub 上对应 commit、对应行号\n` +
      `输入本地 ${project} 仓库绝对路径 → 跳到本地 VSCode(需先装好 VSCode)\n\n` +
      `路径示例:/Users/你的名字/git/<仓库目录>`,
    source_mode_switched_local: '已切到本地 VSCode 模式。刷新生效',
    source_mode_switched_github: '已切到 GitHub 模式。刷新生效',

    // file-ref verb (content.js enhanceFileRefs)
    file_ref_verb_local: '在 VSCode 中打开',
    file_ref_verb_github: '在 GitHub 打开',

    // Error / not-found pages (content.js loadChapter)
    err_chapter_not_found_h1: '章节未找到',
    err_chapter_not_found_body: (id) => `未知章节 ID: <code>${id}</code>`,
    err_back_home: '回到首页',
    err_load_failed_h1: '加载失败',
    err_startup_failed_h1: '启动失败',

    // Home page (content.js renderHome)
    home_stats_summary: (steps, chapters) => `<strong>${steps}</strong> 步导览 + <strong>${chapters}</strong> 章参考`,
    home_stats_analyzed: '分析版本:',
    home_stats_focus: '聚焦:',
    home_trace_h2: (project) => `推荐第一遍这样学:跟一次最简请求穿过 ${project} 全栈`,
    home_trace_lede: (steps, project, traceTarget) =>
      `${steps} 步导览,按 <strong>问题 → 朴素思路为何崩 → ${project} 怎么解决</strong> 的逻辑链展开。` +
      `围绕 <code>${traceTarget}</code> 一个具体请求,逐层走完整个 ${project}。`,
    home_trace_cta: '→ 进入导览(建议第一次学先读这个)',
    home_trace_sample: '或直接看第 1 步样品',
    home_arch_h2: '架构总览',
    home_arch_play: '▶ 播放一次请求流',
    home_arch_reset: '重置',
    home_arch_caption: '点击任一层跳转到对应章节;点击"播放"看一次请求穿过四层。',
    home_tour_h2: (steps) => `单请求 Trace 导览(${steps} 步)`,
    home_tour_lede: (project) =>
      `每步约 150 行,按 8 段模板:当前情境 → 问题 → 朴素思路 → 为何崩 → ${project} 做法 → 代码位置 → 分支链接 → 学到了什么。`,
    home_ref_h2: (chapters) => `参考手册(${chapters} 章)`,
    home_ref_lede: '完整的子系统参考,作为导览的深度补充。每章独立,可随时跳转。',
    home_kbd_h2: '键盘快捷键',
    home_kbd_search: '聚焦搜索框',
    home_kbd_next_prev: '下一章 / 上一章',
    home_kbd_theme: '切换深色/浅色主题',
    home_kbd_home: '回首页',
    home_kbd_close: '关闭弹窗 / 搜索结果',

    // Addendum banner (content.js makeAddendumBanner)
    addendum_banner_q_prefix: '本节回答:',
    addendum_banner_back: (parent) => `↑ 回到 ${parent}`,

    // Glossary panel (glossary.js)
    gloss_back_btn: '‹ 返回',
    gloss_back_title: '返回上一个 (←)',
    gloss_close_title: '关闭 (Esc)',
    gloss_reset_btn: '重置',
    gloss_reset_title: '清除本地"已查看"记录',
    gloss_no_definition: '*(无定义)*',
    gloss_english_label: '英文原名',
    gloss_chinese_label: '中文译名',
    gloss_source_label: '代码位置',
  },

  en: {
    title_suffix: 'Wiki',

    search_placeholder: 'Search (press /)',
    switch_project: 'Switch project',
    switch_version: 'Switch version',
    prev_chapter: 'Previous (k)',
    next_chapter: 'Next (j)',
    toggle_theme: 'Toggle theme (t)',
    source_mode_btn_label: 'Source',
    source_mode_title: 'Source link mode (default GitHub, can switch to local VSCode)',

    loading: 'Loading…',
    loading_chapter: (title) => `Loading ${title}…`,
    rendering: '⏳ Rendering…',
    toc_title: 'On this page',
    toc_empty: 'No outline',
    search_no_results: 'No results',
    click_to_expand: 'Click to expand',

    sidebar_home: 'Home',
    sidebar_tour_head: 'Single-request trace tour',
    sidebar_ref_head: (n) => `Reference (${n} chapters)`,
    sidebar_toggle_aria: 'Expand / collapse',

    toast_first: 'Already at first',
    toast_last: 'Already at last',

    source_mode_local: 'Local VSCode',
    source_mode_prompt: (mode, project) =>
      `Current mode: ${mode}\n\n` +
      `Leave blank (default) → jump to GitHub at the locked commit and line\n` +
      `Enter local absolute path to ${project} repo → open in VSCode (requires VSCode installed)\n\n` +
      `Path example: /Users/<you>/git/<repo>`,
    source_mode_switched_local: 'Switched to local VSCode mode. Refresh to apply.',
    source_mode_switched_github: 'Switched to GitHub mode. Refresh to apply.',

    file_ref_verb_local: 'Open in VSCode',
    file_ref_verb_github: 'Open in GitHub',

    err_chapter_not_found_h1: 'Chapter not found',
    err_chapter_not_found_body: (id) => `Unknown chapter ID: <code>${id}</code>`,
    err_back_home: 'Back to home',
    err_load_failed_h1: 'Load failed',
    err_startup_failed_h1: 'Startup failed',

    home_stats_summary: (steps, chapters) => `<strong>${steps}</strong> tour steps + <strong>${chapters}</strong> reference chapters`,
    home_stats_analyzed: 'Analyzed version:',
    home_stats_focus: 'Focus:',
    home_trace_h2: (project) => `Recommended first read: trace one minimal request through ${project}`,
    home_trace_lede: (steps, project, traceTarget) =>
      `${steps}-step tour following the <strong>problem → naive idea → why it fails → ${project} solution</strong> arc. ` +
      `Built around one concrete <code>${traceTarget}</code> request walking the full ${project} stack.`,
    home_trace_cta: '→ Enter the tour (recommended first read)',
    home_trace_sample: 'Or jump to step 1 sample',
    home_arch_h2: 'Architecture overview',
    home_arch_play: '▶ Play one request flow',
    home_arch_reset: 'Reset',
    home_arch_caption: 'Click any layer to jump to that chapter; click "Play" to watch a request cross four layers.',
    home_tour_h2: (steps) => `Single-request trace tour (${steps} steps)`,
    home_tour_lede: (project) =>
      `~150 lines each, following the 8-section template: scene → problem → naive approach → why it fails → ${project} solution → code location → branch links → what you learned.`,
    home_ref_h2: (chapters) => `Reference (${chapters} chapters)`,
    home_ref_lede: 'Full subsystem reference as depth supplement to the tour. Each chapter is self-contained — jump in anywhere.',
    home_kbd_h2: 'Keyboard shortcuts',
    home_kbd_search: 'Focus search',
    home_kbd_next_prev: 'Next / previous chapter',
    home_kbd_theme: 'Toggle dark / light theme',
    home_kbd_home: 'Back to home',
    home_kbd_close: 'Close popup / search results',

    addendum_banner_q_prefix: 'This section answers: ',
    addendum_banner_back: (parent) => `↑ Back to ${parent}`,

    gloss_back_btn: '‹ Back',
    gloss_back_title: 'Back to previous (←)',
    gloss_close_title: 'Close (Esc)',
    gloss_reset_btn: 'Reset',
    gloss_reset_title: 'Clear local "viewed" history',
    gloss_no_definition: '*(no definition)*',
    gloss_english_label: 'Original name',
    gloss_chinese_label: '',           // empty: hides the row in English mode
    gloss_source_label: 'Source',
  },
};

export const T = STRINGS[document.documentElement.lang.startsWith('en') ? 'en' : 'zh'];
`````

- [ ] **Step 2: Manual smoke check**

```bash
node --check /Users/xgliu/Documents/git/codebase-wiki/templates/web/js/strings.js
```
Expected: silent success (file is valid ES module syntax). Node treats `.js` as CJS by default but `--check` only parses, so `import`/`export` are fine.

- [ ] **Step 3: Commit**

```bash
git add templates/web/js/strings.js
git commit -m "Add bilingual UI strings table for codebase-wiki viewer"
```

---

## Task 2: Update `index.html` — `{{LANG}}` and `data-i18n` attributes

**Files:**
- Modify: `templates/index.html`

- [ ] **Step 1: Read current state**

Confirm the file content from the prior known state (lang attr `zh-CN`, hardcoded Chinese in title/placeholder/button titles).

- [ ] **Step 2: Apply edits**

Replace `<html lang="zh-CN">` with:

```html
<html lang="{{LANG}}">
```

Replace the `<title>` line:

```html
<title>{{PROJECT_NAME}} 中文参考 Wiki</title>
```

with:

```html
<title>{{PROJECT_NAME}} {{TITLE_SUFFIX}}</title>
```

Replace the `<select id="project-switcher" ...>` line:

```html
<select id="project-switcher" class="version-switcher" title="切换项目" hidden></select>
```

with:

```html
<select id="project-switcher" class="version-switcher" data-i18n="switch_project" hidden></select>
```

Replace `<select id="version-switcher" ...>`:

```html
<select id="version-switcher" class="version-switcher" title="切换版本" hidden></select>
```

with:

```html
<select id="version-switcher" class="version-switcher" data-i18n="switch_version" hidden></select>
```

Replace the search input:

```html
<input id="search-input" type="search" placeholder="搜索 (按 /  聚焦)" autocomplete="off" spellcheck="false">
```

with:

```html
<input id="search-input" type="search" data-i18n-placeholder="search_placeholder" autocomplete="off" spellcheck="false">
```

Replace the toolbar buttons. Original:

```html
<button id="prev-chapter" title="上一章 (k)">‹</button>
<button id="next-chapter" title="下一章 (j)">›</button>
<button id="repo-root-btn" title="源码链接模式（默认 GitHub，可切到本地 VSCode）">源码</button>
<button id="theme-toggle" title="切换主题 (t)">🌓</button>
```

New:

```html
<button id="prev-chapter" data-i18n="prev_chapter">‹</button>
<button id="next-chapter" data-i18n="next_chapter">›</button>
<button id="repo-root-btn" data-i18n="source_mode_title" data-i18n-text="source_mode_btn_label">源码</button>
<button id="theme-toggle" data-i18n="toggle_theme">🌓</button>
```

Replace loading div:

```html
<div class="loading">加载中…</div>
```

with:

```html
<div class="loading" data-i18n-text="loading">加载中…</div>
```

Replace rightbar title:

```html
<div class="rightbar-title">本页目录</div>
```

with:

```html
<div class="rightbar-title" data-i18n-text="toc_title">本页目录</div>
```

- [ ] **Step 3: Add scaffold-time substitution note**

At the very top of the file (replace the existing top comment), add documentation of the new placeholders:

Original:

```html
<!--
  This file goes to <output>/<project>/<version>/index.html (the version subdirectory, sibling of web/).
  Replace {{PROJECT_NAME}} with the project name (e.g., "vLLM", "hermes-agent").
-->
```

New:

```html
<!--
  This file goes to <output>/<project>/<version>/index.html (the version subdirectory, sibling of web/).
  Replace at scaffold time:
    {{PROJECT_NAME}}   → project name (e.g., "vLLM", "hermes-agent")
    {{LANG}}           → "zh-CN" | "en"
    {{TITLE_SUFFIX}}   → "中文参考 Wiki" (zh) | "Wiki" (en)
  Runtime i18n: data-i18n[-text|-placeholder] attrs read by app.js applyI18n() from strings.js T table.
-->
```

- [ ] **Step 4: Manual smoke check**

```bash
grep -E "(zh-CN|加载中|本页目录|切换主题|搜索 \(按)" /Users/xgliu/Documents/git/codebase-wiki/templates/index.html
```
Expected: only the static fallback text inside element bodies (`加载中…`, `本页目录`, `源码`) appears — used as no-JS fallback before applyI18n runs. No `zh-CN` (replaced with `{{LANG}}`) and no Chinese in attribute values.

- [ ] **Step 5: Commit**

```bash
git add templates/index.html
git commit -m "Make index.html lang-aware: {{LANG}} attr + data-i18n hooks"
```

---

## Task 3: Update `app.js` — import T, applyI18n, replace runtime strings

**Files:**
- Modify: `templates/web/js/app.js`

- [ ] **Step 1: Add strings.js import**

After line 9 (`import { initVersionSwitcher, initProjectSwitcher } from './versions.js';`), insert:

```js
import { T } from './strings.js';
```

- [ ] **Step 2: Add applyI18n function**

Right above `async function main()` (around line 122-123), insert:

```js
// =========================================================
// i18n: 把 strings.js 的当前语言表写入 DOM
// =========================================================

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.title = T[el.dataset.i18n];
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = T[el.dataset.i18nPlaceholder];
  });
  document.querySelectorAll('[data-i18n-text]').forEach(el => {
    el.textContent = T[el.dataset.i18nText];
  });
}
```

- [ ] **Step 3: Call applyI18n at startup**

Inside `main()`, right after `initMermaid(savedTheme); initModal();` (currently lines 128-129), insert:

```js
  // i18n 注入(必须先于读取 DOM 文案的代码)
  applyI18n();
```

- [ ] **Step 4: Replace toast strings in gotoChapter**

Line 80:
```js
if (next < 0) { showToast('已经是第一篇'); return; }
```
→
```js
if (next < 0) { showToast(T.toast_first); return; }
```

Line 81:
```js
if (next >= ALL_DOCS.length) { showToast('已经是最后一篇'); return; }
```
→
```js
if (next >= ALL_DOCS.length) { showToast(T.toast_last); return; }
```

- [ ] **Step 5: Replace document.title at route home (line 52)**

Original:
```js
document.title = `${PROJECT_NAME} 中文参考 Wiki`;
```
→
```js
document.title = `${PROJECT_NAME} ${T.title_suffix}`.trim();
```

(Line 60 — chapter title — keeps the literal `Wiki` suffix; that string is generic and reads fine in both languages.)

- [ ] **Step 6: Replace repo-root-btn click handler (lines 135-148)**

Locate the existing handler:

```js
document.getElementById('repo-root-btn').addEventListener('click', () => {
    const cur = getRepoRoot();
    const mode = cur ? '本地 VSCode' : `GitHub (${PROJECT_NAME}@${ANALYZED_COMMIT})`;
    const updated = prompt(
      `当前模式：${mode}\n\n` +
      `留空（默认）→ 跳到 GitHub 上对应 commit、对应行号\n` +
      `输入本地 ${PROJECT_NAME} 仓库绝对路径 → 跳到本地 VSCode（需先装好 VSCode）\n\n` +
      `路径示例：/Users/你的名字/git/<仓库目录>`,
      cur
    );
    if (updated === null) return;
    setRepoRoot(updated);
    showToast(updated.trim() ? '已切到本地 VSCode 模式。刷新生效' : '已切到 GitHub 模式。刷新生效');
  });
```

Replace with:

```js
document.getElementById('repo-root-btn').addEventListener('click', () => {
    const cur = getRepoRoot();
    const mode = cur ? T.source_mode_local : `GitHub (${PROJECT_NAME}@${ANALYZED_COMMIT})`;
    const updated = prompt(T.source_mode_prompt(mode, PROJECT_NAME), cur);
    if (updated === null) return;
    setRepoRoot(updated);
    showToast(updated.trim() ? T.source_mode_switched_local : T.source_mode_switched_github);
  });
```

- [ ] **Step 7: Replace startup error display (line 175)**

Original:
```js
contentEl.innerHTML = `<div class="md"><h1>启动失败</h1><pre>${err.stack || err.message}</pre></div>`;
```
→
```js
contentEl.innerHTML = `<div class="md"><h1>${T.err_startup_failed_h1}</h1><pre>${err.stack || err.message}</pre></div>`;
```

- [ ] **Step 8: Manual smoke check**

```bash
grep -nE "['\"\`][一-鿿]" /Users/xgliu/Documents/git/codebase-wiki/templates/web/js/app.js
```
Expected: only Chinese in comment lines (` // 主题 `, ` // 路由 `, etc.). No Chinese inside string literals.

- [ ] **Step 9: Commit**

```bash
git add templates/web/js/app.js
git commit -m "Wire app.js to strings.js: applyI18n + replace runtime literals"
```

---

## Task 4: Update `content.js` — renderHome + loadChapter + helpers

**Files:**
- Modify: `templates/web/js/content.js`

- [ ] **Step 1: Add strings.js import**

After line 11 (`import { enhanceWithGlossary } from './glossary.js';`), insert:

```js
import { T } from './strings.js';
```

- [ ] **Step 2: Replace mermaid placeholder (line 21)**

Original:
```js
return `<div class="mermaid-block" data-source="${escapeHTML(text)}">⏳ 渲染中…</div>`;
```
→
```js
return `<div class="mermaid-block" data-source="${escapeHTML(text)}">${T.rendering}</div>`;
```

- [ ] **Step 3: Replace loadChapter error/loading strings (lines 59, 62, 70)**

Line 59 (chapter-not-found):
```js
contentEl.innerHTML = `<div class="md"><h1>章节未找到</h1><p>未知章节 ID: <code>${escapeHTML(chapterId)}</code></p><p><a href="#/">回到首页</a></p></div>`;
```
→
```js
contentEl.innerHTML = `<div class="md"><h1>${T.err_chapter_not_found_h1}</h1><p>${T.err_chapter_not_found_body(escapeHTML(chapterId))}</p><p><a href="#/">${T.err_back_home}</a></p></div>`;
```

Line 62 (loading):
```js
contentEl.innerHTML = `<div class="loading">加载 ${chap.title}…</div>`;
```
→
```js
contentEl.innerHTML = `<div class="loading">${T.loading_chapter(chap.title)}</div>`;
```

Line 70 (load-failed):
```js
contentEl.innerHTML = `<div class="md"><h1>加载失败</h1><pre>${escapeHTML(err.message)}</pre></div>`;
```
→
```js
contentEl.innerHTML = `<div class="md"><h1>${T.err_load_failed_h1}</h1><pre>${escapeHTML(err.message)}</pre></div>`;
```

- [ ] **Step 4: Replace renderHome function body (lines 106-188)**

Locate the entire `export function renderHome(contentEl, chapters) { ... }` block. Replace with:

`````js
export function renderHome(contentEl, chapters) {
  const stepCount = Math.max(TOURS.length - 1, 0);   // 减去 tour-00 总览
  const chapterCount = chapters.length;
  const firstStep = TOURS.find(t => t.id !== 'tour-00-overview');
  let html = `
    <div class="home-hero">
      <h1>${PROJECT_NAME} ${T.title_suffix}</h1>
      <p class="lede">${PROJECT_TAGLINE}</p>
      <div class="home-stats">
        <div class="stat">${T.home_stats_summary(stepCount, chapterCount)}</div>
        <div class="stat">${T.home_stats_analyzed} <a href="https://github.com/${PROJECT_GITHUB_REPO}/tree/${ANALYZED_COMMIT}" target="_blank" rel="noopener"><strong>${ANALYZED_TAG}</strong></a> <span style="color:var(--text-faint)">(${ANALYZED_DATE})</span></div>
        ${PROJECT_FOCUS ? `<div class="stat">${T.home_stats_focus} <strong>${PROJECT_FOCUS}</strong></div>` : ''}
      </div>
    </div>

    <section style="background:var(--accent-soft);border:1px solid var(--accent);border-radius:12px;padding:18px 22px;margin:24px 0 28px">
      <h2 style="margin:0 0 6px;font-size:20px;color:var(--accent);">${T.home_trace_h2(PROJECT_NAME)}</h2>
      <p style="margin:0 0 12px;color:var(--text-soft);font-size:14px;">
        ${T.home_trace_lede(stepCount, PROJECT_NAME, escapeHTML(TRACE_TARGET))}
      </p>
      <a href="#/tour-00-overview" style="display:inline-block;background:var(--accent);color:white;padding:8px 16px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">${T.home_trace_cta}</a>
      ${firstStep ? `<a href="#/${firstStep.id}" style="display:inline-block;margin-left:8px;color:var(--accent);padding:8px 16px;border-radius:6px;text-decoration:none;font-size:14px;">${T.home_trace_sample}</a>` : ''}
    </section>

    <section class="arch-section" id="arch-section">
      <h2>${T.home_arch_h2}
        <div class="arch-controls">
          <button id="arch-play-btn">${T.home_arch_play}</button>
          <button id="arch-reset-btn">${T.home_arch_reset}</button>
        </div>
      </h2>
      <p style="color:var(--text-soft);margin-top:0;">${T.home_arch_caption}</p>
      <div class="arch-svg-wrap" id="arch-svg-wrap">
        <!-- 由 architecture.js 注入 -->
      </div>
    </section>

    <section>
      <h2 style="font-size:20px;margin-bottom:8px;">${T.home_tour_h2(stepCount)}</h2>
      <p style="color:var(--text-soft);margin-top:0;font-size:14px;">
        ${T.home_tour_lede(PROJECT_NAME)}
      </p>
      <div class="chapter-grid">
        ${TOURS.map(t => `
          <a class="chapter-card" href="#/${t.id}" style="border-left:3px solid var(--accent)">
            <div class="chapter-card-num">TOUR ${t.num}</div>
            <div class="chapter-card-title">${t.title}</div>
            <div class="chapter-card-desc">${t.desc}</div>
          </a>
        `).join('')}
      </div>
    </section>

    <section style="margin-top:32px;">
      <h2 style="font-size:20px;margin-bottom:8px;">${T.home_ref_h2(chapterCount)}</h2>
      <p style="color:var(--text-soft);margin-top:0;font-size:14px;">
        ${T.home_ref_lede}
      </p>
      <div class="chapter-grid">
        ${chapters.map(c => `
          <a class="chapter-card" href="#/${c.id}">
            <div class="chapter-card-num">CHAPTER ${c.num}</div>
            <div class="chapter-card-title">${c.title}</div>
            <div class="chapter-card-desc">${c.desc}</div>
          </a>
        `).join('')}
      </div>
    </section>

    <section style="margin-top:32px;">
      <h2 style="font-size:20px;">${T.home_kbd_h2}</h2>
      <table class="md" style="font-size:13px;">
        <tr><td><span class="kbd">/</span></td><td>${T.home_kbd_search}</td></tr>
        <tr><td><span class="kbd">j</span> / <span class="kbd">k</span></td><td>${T.home_kbd_next_prev}</td></tr>
        <tr><td><span class="kbd">t</span></td><td>${T.home_kbd_theme}</td></tr>
        <tr><td><span class="kbd">g</span> <span class="kbd">h</span></td><td>${T.home_kbd_home}</td></tr>
        <tr><td><span class="kbd">Esc</span></td><td>${T.home_kbd_close}</td></tr>
      </table>
    </section>
  `;
  contentEl.innerHTML = `<div class="md">${html}</div>`;
}
`````

- [ ] **Step 5: Replace enhanceFileRefs verb (line 196)**

Original:
```js
const verb = isLocal ? '在 VSCode 中打开' : '在 GitHub 打开';
```
→
```js
const verb = isLocal ? T.file_ref_verb_local : T.file_ref_verb_github;
```

- [ ] **Step 6: Replace makeAddendumBanner (line 235)**

Original:
```js
function makeAddendumBanner(chap) {
  const parent = CHAPTER_BY_ID[chap.parentId];
  if (!parent) return '';
  const q = chap.question ? `<em>${escapeHTML(chap.question)}</em>` : '';
  const link = `<a href="#/${parent.id}">↑ 回到 ${escapeHTML(parent.title)}</a>`;
  return `<div class="addendum-banner">${q ? `本节回答:${q} · ` : ''}${link}</div>`;
}
```
→
```js
function makeAddendumBanner(chap) {
  const parent = CHAPTER_BY_ID[chap.parentId];
  if (!parent) return '';
  const q = chap.question ? `<em>${escapeHTML(chap.question)}</em>` : '';
  const link = `<a href="#/${parent.id}">${T.addendum_banner_back(escapeHTML(parent.title))}</a>`;
  return `<div class="addendum-banner">${q ? `${T.addendum_banner_q_prefix}${q} · ` : ''}${link}</div>`;
}
```

- [ ] **Step 7: Manual smoke check**

```bash
grep -nE "['\"\`][一-鿿]" /Users/xgliu/Documents/git/codebase-wiki/templates/web/js/content.js
```
Expected: only Chinese in comment lines (`// 配置`, `// 渲染首页`, `// 后处理` etc.) and in the `<!-- 由 architecture.js 注入 -->` literal HTML comment. No Chinese inside string literals or template tags.

- [ ] **Step 8: Commit**

```bash
git add templates/web/js/content.js
git commit -m "Route content.js viewer chrome through strings.js T table"
```

---

## Task 5: Update `sidebar.js` — replace 5 chrome strings

**Files:**
- Modify: `templates/web/js/sidebar.js`

- [ ] **Step 1: Add strings.js import**

After line 2 (`import { throttle } from './utils.js';`), insert:

```js
import { T } from './strings.js';
```

- [ ] **Step 2: Replace home link text (line 37)**

Original:
```js
html += `<a class="ch-item ${!currentChapterId ? 'active' : ''}" href="#/" style="margin-bottom:6px"><span class="ch-num">★</span>首页</a>`;
```
→
```js
html += `<a class="ch-item ${!currentChapterId ? 'active' : ''}" href="#/" style="margin-bottom:6px"><span class="ch-num">★</span>${T.sidebar_home}</a>`;
```

- [ ] **Step 3: Replace tour section head (line 41)**

Original:
```js
html += `<div class="sidebar-head">单请求 Trace 导览</div>`;
```
→
```js
html += `<div class="sidebar-head">${T.sidebar_tour_head}</div>`;
```

- [ ] **Step 4: Replace reference section head (line 49)**

Original:
```js
html += `<div class="sidebar-head" style="margin-top:14px">参考手册（${CHAPTERS.length} 章）</div>`;
```
→
```js
html += `<div class="sidebar-head" style="margin-top:14px">${T.sidebar_ref_head(CHAPTERS.length)}</div>`;
```

- [ ] **Step 5: Replace ch-toggle aria-label (line 63)**

Original:
```js
html += `<button class="ch-toggle" type="button" data-toggle="${escapeAttr(c.id)}" aria-label="展开/收起" aria-expanded="${isExpanded ? 'true' : 'false'}">${isExpanded ? '▾' : '▸'}</button>`;
```
→
```js
html += `<button class="ch-toggle" type="button" data-toggle="${escapeAttr(c.id)}" aria-label="${T.sidebar_toggle_aria}" aria-expanded="${isExpanded ? 'true' : 'false'}">${isExpanded ? '▾' : '▸'}</button>`;
```

- [ ] **Step 6: Replace empty-toc placeholder (line 106)**

Original:
```js
nav.innerHTML = `<div style="color:var(--text-faint);font-size:13px;">无目录</div>`;
```
→
```js
nav.innerHTML = `<div style="color:var(--text-faint);font-size:13px;">${T.toc_empty}</div>`;
```

- [ ] **Step 7: Manual smoke check**

```bash
grep -nE "['\"\`][一-鿿]" /Users/xgliu/Documents/git/codebase-wiki/templates/web/js/sidebar.js
```
Expected: only Chinese in comment lines (`// 当前激活项的 parentId`, `// 首页`, etc.). No Chinese inside string literals.

- [ ] **Step 8: Commit**

```bash
git add templates/web/js/sidebar.js
git commit -m "Route sidebar.js chrome through strings.js T table"
```

---

## Task 6: Update `glossary.js` — parser dual labels + panel buttons + render labels

**Files:**
- Modify: `templates/web/js/glossary.js`

- [ ] **Step 1: Add strings.js import**

At the top of the file, after existing imports (which should be minimal in glossary.js — confirm), insert:

```js
import { T } from './strings.js';
```

(If glossary.js has no imports, add this as line 1.)

- [ ] **Step 2: Extend parser regex (line 68) and switch cases (lines 71-74)**

Original (line 68):
```js
const m = line.match(/^-\s*(英文原名|中文译名|定义|代码位置)[：:]\s*(.*)$/);
```
→
```js
const m = line.match(/^-\s*(英文原名|中文译名|定义|代码位置|Original name|Definition|Source)[：:]\s*(.*)$/);
```

Original (lines 71-74 inside `if (m) { ... }`):
```js
if (key === '定义') definition = val;
else if (key === '代码位置') codeLocation = val;
else if (key === '中文译名') chineseName = val;
else if (key === '英文原名') englishName = val;
```
→
```js
if (key === '定义' || key === 'Definition') definition = val;
else if (key === '代码位置' || key === 'Source') codeLocation = val;
else if (key === '中文译名') chineseName = val;
else if (key === '英文原名' || key === 'Original name') englishName = val;
```

(`chineseName` stays zh-only — English glossaries have no Chinese translation field.)

- [ ] **Step 3: Replace panel button text (lines 249-260)**

Locate the `installPanel()` body that constructs `panel.innerHTML`. The current block is:

```js
panel.innerHTML = `
    <header class="gloss-panel-head">
      <button class="gloss-back" title="返回上一个 (←)" hidden>‹ 返回</button>
      <span class="gloss-trail"></span>
      <button class="gloss-close" title="关闭 (Esc)">×</button>
    </header>
    <div class="gloss-panel-body"></div>
    <footer class="gloss-panel-foot">
      <span class="gloss-counter"></span>
      <button class="gloss-clear-viewed" title="清除本地"已查看"记录">重置</button>
    </footer>
  `;
```

Replace with:

```js
panel.innerHTML = `
    <header class="gloss-panel-head">
      <button class="gloss-back" title="${T.gloss_back_title}" hidden>${T.gloss_back_btn}</button>
      <span class="gloss-trail"></span>
      <button class="gloss-close" title="${T.gloss_close_title}">×</button>
    </header>
    <div class="gloss-panel-body"></div>
    <footer class="gloss-panel-foot">
      <span class="gloss-counter"></span>
      <button class="gloss-clear-viewed" title="${T.gloss_reset_title}">${T.gloss_reset_btn}</button>
    </footer>
  `;
```

- [ ] **Step 4: Replace render labels (lines 337, 342, 343, 346)**

First, replace the no-definition fallback at line 337. Original:
```js
const defHtml = marked.parse(term.definition || '*（无定义）*');
```
→
```js
const defHtml = marked.parse(term.definition || T.gloss_no_definition);
```

Then the render block around lines 340-346. Original:
```js
      ${term.chineseName ? `<div><span class="gloss-meta">中文译名</span>${escapeHTML(term.chineseName)}</div>` : ''}
      ${term.englishName && term.englishName !== term.primary ? `<div><span class="gloss-meta">英文原名</span><code>${escapeHTML(term.englishName)}</code></div>` : ''}
    </div>
    <div class="gloss-definition md">${defHtml}</div>
    ${locHtml ? `<div class="gloss-location md"><span class="gloss-meta">代码位置</span>${locHtml}</div>` : ''}
```
→
```js
      ${term.chineseName && T.gloss_chinese_label ? `<div><span class="gloss-meta">${T.gloss_chinese_label}</span>${escapeHTML(term.chineseName)}</div>` : ''}
      ${term.englishName && term.englishName !== term.primary ? `<div><span class="gloss-meta">${T.gloss_english_label}</span><code>${escapeHTML(term.englishName)}</code></div>` : ''}
    </div>
    <div class="gloss-definition md">${defHtml}</div>
    ${locHtml ? `<div class="gloss-location md"><span class="gloss-meta">${T.gloss_source_label}</span>${locHtml}</div>` : ''}
```

Note the extra `&& T.gloss_chinese_label` guard on the chineseName row — when `T.gloss_chinese_label === ''` (en mode), the row stays hidden even if the term somehow has a Chinese name.

- [ ] **Step 5: Manual smoke check**

```bash
grep -nE "['\"\`][一-鿿]" /Users/xgliu/Documents/git/codebase-wiki/templates/web/js/glossary.js
```
Expected: Chinese only in the parser regex (`英文原名|中文译名|定义|代码位置`), switch cases (`'定义'`, `'代码位置'`, `'中文译名'`, `'英文原名'`), and comments. No Chinese in user-facing string literals.

- [ ] **Step 6: Commit**

```bash
git add templates/web/js/glossary.js
git commit -m "glossary.js: dual zh/en label parsing + route panel chrome through T"
```

---

## Task 7: Update `search.js` — replace `无结果` placeholder

**Files:**
- Modify: `templates/web/js/search.js`

- [ ] **Step 1: Add strings.js import**

After the existing import(s) at the top, insert:

```js
import { T } from './strings.js';
```

- [ ] **Step 2: Replace the placeholder (line 127)**

Original:
```js
panel.innerHTML = `<div style="padding:14px;color:var(--text-faint);">无结果</div>`;
```
→
```js
panel.innerHTML = `<div style="padding:14px;color:var(--text-faint);">${T.search_no_results}</div>`;
```

- [ ] **Step 3: Manual smoke check**

```bash
grep -nE "['\"\`][一-鿿]" /Users/xgliu/Documents/git/codebase-wiki/templates/web/js/search.js
```
Expected: Chinese only in comment lines and `console.warn('索引失败', ...)` (line 26 — dev console only, not user-facing).

- [ ] **Step 4: Commit**

```bash
git add templates/web/js/search.js
git commit -m "search.js: route no-results placeholder through strings.js T"
```

---

## Task 8: Update `style.css` — `html[lang^="en"]` overrides

**Files:**
- Modify: `templates/web/css/style.css`

- [ ] **Step 1: Insert lang-aware block**

After the `[data-theme="dark"]` block (which ends around line 42 with its closing `}`), insert:

```css
/* =========================================================
   English-only typography overrides
   Only fires when <html lang="en"> (zh path untouched).
   ========================================================= */

html[lang^="en"] body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI Variable", "Segoe UI",
               system-ui, "Helvetica Neue", Arial, sans-serif;
  line-height: 1.6;
}
html[lang^="en"] .md { line-height: 1.55; }
html[lang^="en"] .md h1 { letter-spacing: -0.01em; }
html[lang^="en"] .md h2 { letter-spacing: -0.005em; }
html[lang^="en"] .md .mermaid-block::after { content: "Click to expand"; }
```

- [ ] **Step 2: Manual smoke check**

```bash
grep -n "html\[lang" /Users/xgliu/Documents/git/codebase-wiki/templates/web/css/style.css
```
Expected: 5 lines matching the new `html[lang^="en"]` selectors.

- [ ] **Step 3: Commit**

```bash
git add templates/web/css/style.css
git commit -m "Add html[lang^=en] typography overrides for English wikis"
```

---

## Task 9: Update `addendum-prompt.md` — remove 简体中文 fallback

**Files:**
- Modify: `templates/addendum-prompt.md`

- [ ] **Step 1: Replace line 53**

Original:
```
- **{{LANGUAGE}}**: same as the wiki (Chinese / English / bilingual); detect from the parent chapter or fall back to "简体中文".
```
→
```
- **{{LANGUAGE}}**: same as the wiki ("简体中文" / "English" / "bilingual"); supplied from Phase 0 LANGUAGE input (no fallback — value is always explicitly injected by the skill controller).
```

- [ ] **Step 2: Manual smoke check**

```bash
grep -n "LANGUAGE" /Users/xgliu/Documents/git/codebase-wiki/templates/addendum-prompt.md
```
Expected: shows the new line without the `fall back to "简体中文"` phrasing.

- [ ] **Step 3: Commit**

```bash
git add templates/addendum-prompt.md
git commit -m "addendum-prompt: LANGUAGE comes from Phase 0, no fallback needed"
```

---

## Task 10: Create `readme.md.en.tmpl`

**Files:**
- Create: `templates/readme.md.en.tmpl`

- [ ] **Step 1: Read the Chinese template for structural reference**

```bash
cat /Users/xgliu/Documents/git/codebase-wiki/templates/readme.md.tmpl
```

This gives you the section structure, placeholders, and tone to mirror in English. Placeholders to preserve **verbatim**: `{{PROJECT_NAME}}`, `{{OWNER}}`, `{{PROJECT}}`, `{{COMMIT_SHORT}}`, `{{TAG_OR_DESCRIBE}}`, `{{DATE_ISO}}`, `{{UPSTREAM_URL}}`, `{{UPSTREAM_OWNER}}`, `{{MONOREPO_REPO}}`.

- [ ] **Step 2: Write the English template**

`````markdown
# {{PROJECT_NAME}} Wiki (unofficial study notes)

> **Analyzed version**: [`{{OWNER}}/{{PROJECT}}@{{COMMIT_SHORT}}`](https://github.com/{{OWNER}}/{{PROJECT}}/tree/{{COMMIT_SHORT}}) ({{TAG_OR_DESCRIBE}}, {{DATE_ISO}}). All `file:line` references and jump links are locked to this commit — the code you see when clicking is exactly the code this wiki was written against.
>
> **Disclaimer**: This repo is personal study notes from reading [{{PROJECT_NAME}}]({{UPSTREAM_URL}}) source code. **No affiliation with the official {{UPSTREAM_OWNER}} team**, not endorsed by them. All interpretations are mine and may be wrong — source code is authoritative.
>
> **AI assistance**: Chapter prose and visualizations were drafted with Claude (Anthropic), then reviewed and iterated by the author. This is a mono-repo — wikis live under `<project>/<version>/`, with older versions retained for browsing. See "Projects / Versions" below.

---

A wiki **for anyone seriously reading {{PROJECT_NAME}} source for the first time**:

- **10-15 reference chapters** covering subsystems comprehensively
- **15-20 step trace tour**: narrative-style — problem → naive solution → why it fails → actual design — following one minimum-viable real request through the entire stack
- **SVG figures**: hand-crafted, theme-aware, scale cleanly
- **Interactive web viewer**: term popups, full-text search, keyboard navigation, clickable architecture diagram, `file:line` deep-links to GitHub

## How to read

1. Open `https://{{OWNER}}.github.io/{{MONOREPO_REPO}}/{{PROJECT}}/` (or run the local viewer below).
2. First visit: read the **trace tour** end-to-end (~1-2 hours). Builds the mental model.
3. Second pass: use the **reference chapters** for depth on subsystems that interested you.
4. Hover any underlined term for a popup definition; click `file:line` codes to jump to GitHub.

## Run locally

```bash
git clone https://github.com/{{OWNER}}/{{MONOREPO_REPO}}.git
cd {{MONOREPO_REPO}}
python3 -m http.server 8765
# open http://localhost:8765/{{PROJECT}}/
```

## Chapter map

(populated by the skill — see the live viewer for the canonical list)

## Viewer features

- **3-column layout**: chapter nav (left) / content (middle) / page TOC with scrollspy (right)
- **Term highlight + popup**: terms in body text get a dashed underline; click opens the right-side panel with the definition. Definitions can link to other terms — popup recursively expands.
- **Full-text search**: press `/` to focus; results show chapter + snippet + match highlight.
- **Keyboard shortcuts**: `j` / `k` next / previous, `t` toggle theme, `g h` home, `Esc` close popup.
- **Source link mode**: by default `file:line` codes jump to GitHub at the locked commit. Click the **Source** topbar button to switch to local VSCode (requires VSCode installed and the project cloned locally).
- **Mermaid + KaTeX**: diagrams and math render inline; click a mermaid block to expand.

## Projects / Versions

This wiki lives in a mono-repo — see [`{{MONOREPO_REPO}}`](https://github.com/{{OWNER}}/{{MONOREPO_REPO}}) for the top-level project selector. Each project may have multiple snapshots over time; use the version switcher in the topbar.

## Contributing

- Found a bug or unclear passage → open an issue, please cite `file:line`
- Want to add a chapter or diagram → PR welcome, but open an issue first to coordinate

## License

MIT. The wiki content is the author's analysis of upstream {{PROJECT_NAME}} source code; you're free to re-use under MIT terms. Upstream {{PROJECT_NAME}} retains its own license.
`````

- [ ] **Step 3: Manual smoke check**

```bash
grep -E "\{\{[A-Z_]+\}\}" /Users/xgliu/Documents/git/codebase-wiki/templates/readme.md.en.tmpl | sort -u
```
Expected: all placeholders in the file are from the approved list (`{{PROJECT_NAME}}`, `{{OWNER}}`, `{{PROJECT}}`, `{{COMMIT_SHORT}}`, `{{TAG_OR_DESCRIBE}}`, `{{DATE_ISO}}`, `{{UPSTREAM_URL}}`, `{{UPSTREAM_OWNER}}`, `{{MONOREPO_REPO}}`). No stray ones.

- [ ] **Step 4: Commit**

```bash
git add templates/readme.md.en.tmpl
git commit -m "Add English README template for codebase-wiki scaffold"
```

---

## Task 11: Create `glossary-format.en.md`

**Files:**
- Create: `templates/glossary-format.en.md`

- [ ] **Step 1: Write the file**

`````markdown
# Glossary chapter format (English)

The last reference chapter (typically `12-glossary-and-faq.md`) must follow this structure so that the runtime glossary parser (`web/js/glossary.js`) can extract terms and provide the term-popup feature.

## Required structure

```markdown
# Chapter N: Glossary & FAQ

<intro paragraph>

---

## Part 1: Glossary

### TermName
- Original name: `OfficialEnglishName`
- Definition: <1-3 sentences>
- Source: `path/to/file.py:123` defines `class TermName`; `path/to/other.py:456` main caller.

### NextTermName
- Original name: `...`
- Definition: ...
- Source: ...

...
```

## Parser rules (DO NOT BREAK)

- Each term entry is a `### Heading` followed by 3 bullets in order: **Original name** / **Definition** / **Source**
- The H3 heading text can have parenthetical alternates: `### Backend (attention backend)` — both "Backend" and "attention backend" become matchable variants
- Multiple equivalents with slash: `### Guided Decoding / Structured Output` — both become primary terms
- Abbreviations in parens: `### Data Parallelism (DP)` — both full and abbreviation become variants
- The Original name field can include backticks for inline code styling

## Term selection

Aim for 30-60 terms. Include:
- Major class names (the things you'd grep for first)
- Concept names (PagedAttention, continuous batching, etc.)
- Abbreviations (TP, PP, DP, EP, MoE, MLA, KV)
- Special data structures (block table, slot mapping, schedulerOutput)
- Pipeline / phase names (prefill, decode, capture, profile_run)
- Adjacent tech (FlashAttention, FlashInfer, Mamba)
- Backends (Ray, multiproc)

DON'T include:
- Generic CS terms (cache, queue, mutex)
- Method names (handle_request)
- Module path names (vllm/v1/engine)

## Part 2: FAQ (10-15 questions)

```markdown
## Part 2: FAQ

### How does the V1 architecture differ from V0? Why was it rewritten?

<2-4 sentences with file:line refs>

### How do I add a new model? What interfaces must I implement?

<...>
```

H3 questions, answered in 2-4 sentences each, with `file:line` refs.

## Part 3: Cheat sheet appendix

```markdown
## Part 3: Debug & dev cheat sheet

### Environment variables

| Variable | Default | Effect |
|----------|---------|--------|
| `PROJECT_LOG_LEVEL` | `INFO` | Log level |
| ... | ... | ... |

### Benchmark / test commands

```bash
# Run a single test
pytest tests/path/to/test_x.py::test_y -v

# Benchmark throughput
...
```

### Test directory map

| Directory | Contents |
|-----------|----------|
| `tests/v1/...` | V1 architecture tests |
| ... | ... |
```

## Cross-references from glossary

Encourage `file:line` refs in definitions. They become clickable links in the wiki, helping readers verify the term's location in source.

## Note on Chinese translation field

This English schema **omits** the `- Chinese translation: ...` bullet that the Chinese schema (`glossary-format.md`) requires. The runtime parser tolerates both schemas; English glossaries simply won't render that field even if it appeared.
`````

- [ ] **Step 2: Manual smoke check**

```bash
grep -nE "[一-鿿]" /Users/xgliu/Documents/git/codebase-wiki/templates/glossary-format.en.md
```
Expected: zero matches (the file is fully English).

- [ ] **Step 3: Commit**

```bash
git add templates/glossary-format.en.md
git commit -m "Add English glossary-format schema (Original name/Definition/Source)"
```

---

## Task 12: Update `SKILL.md` — Phase 0 LANGUAGE + Phase 4 template selection

**Files:**
- Modify: `SKILL.md`

**Context for the implementer:** SKILL.md already mentions "Wiki language" informally at line 37 in Phase 0 as one of the questions to ask. That question becomes the **named LANGUAGE field** here, with two valid values (`zh-CN` | `en`), and Phase 4 gains explicit instructions for which templates to dispatch by language.

- [ ] **Step 1: Update Phase 0 question #4 (line 37)**

Original line 37:
```
4. **Wiki language** (new mono-repo / new project only): Chinese (default) / English / bilingual
```

Replace with:
```
4. **LANGUAGE** (new mono-repo / new project only): `zh-CN` (default) | `en`. Drives `<html lang>`, `{{TITLE_SUFFIX}}`, which README/glossary template to copy, and the `{{LANGUAGE}}` value passed to chapter/addendum prompts (`zh-CN` → `简体中文`, `en` → `English`). `bilingual` is no longer offered — pick one. The bilingual `strings.js` ships unmodified for both.
```

- [ ] **Step 2: Update Phase 4 step 3 (line 134)**

Original line 134 (existing numbered step 3 inside Phase 4):
```
3. **`index.html`**: replace the `{{PROJECT_NAME}}` placeholders (title + brand) with the project name
```

Replace with:
```
3. **`index.html`** placeholders to substitute at scaffold time:
   - `{{PROJECT_NAME}}` → project friendly name (title + brand)
   - `{{LANG}}` → `zh-CN` or `en` (matches Phase 0 LANGUAGE)
   - `{{TITLE_SUFFIX}}` → `中文参考 Wiki` (zh-CN) or `Wiki` (en)
   See the comment header at the top of `templates/index.html` for the canonical list.
```

- [ ] **Step 3: Add new Phase 4 step covering README + glossary template dispatch**

After Phase 4 step 5 (line 139), insert a new step 6:

```
6. **README + glossary chapter template dispatch by LANGUAGE**:
   - README source: `templates/readme.md.tmpl` if LANGUAGE is `zh-CN`, else `templates/readme.md.en.tmpl`. Copy to `<output>/<project>/<version>/README.md` and substitute placeholders.
   - Glossary chapter prompt: include `templates/glossary-format.md` (zh-CN) or `templates/glossary-format.en.md` (en) as the format spec sent to the glossary chapter agent.
   - `templates/web/js/strings.js` is language-agnostic (ships both zh and en) — copy verbatim into `<output>/<project>/<version>/web/js/strings.js`. No edit needed.
```

(Renumber the existing step 5 → 5, then the new step is 6.)

- [ ] **Step 4: Verify Phase 3 chapter-prompt LANGUAGE injection note**

```bash
grep -n "LANGUAGE\|{{LANGUAGE}}" /Users/xgliu/Documents/git/codebase-wiki/SKILL.md
```

Confirm Phase 3 (line 92-107 area) either already mentions, or has a place to add: "Pass `{{LANGUAGE}}` to each chapter agent prompt: `简体中文` (zh-CN) or `English` (en) — Phase 0's LANGUAGE field determines this."

If Phase 3 doesn't currently mention LANGUAGE injection, add a line at the end of the "Use parallel agents" paragraph (around line 94-95):

```
- **Pass LANGUAGE** (from Phase 0) to each agent prompt via the `{{LANGUAGE}}` placeholder: `简体中文` for `zh-CN`, `English` for `en`. This drives whether the agent writes Chinese or English content.
```

- [ ] **Step 5: Manual smoke check**

```bash
grep -nE "LANGUAGE|\{\{LANG" /Users/xgliu/Documents/git/codebase-wiki/SKILL.md
```
Expected: at least 4 distinct mentions — Phase 0 question 4 (new named field), Phase 3 agent dispatch note, Phase 4 step 3 (placeholders), Phase 4 step 6 (template dispatch). Original `{{LANGUAGE}}` mention in Phase 3 (if pre-existing) remains.

- [ ] **Step 6: Commit**

```bash
git add SKILL.md
git commit -m "SKILL.md: name LANGUAGE in Phase 0, wire template dispatch in Phase 4"
```

---

## Task 13: Update `reference/monorepo.md` + `reference/versioning.md`

**Files:**
- Modify: `reference/monorepo.md`
- Modify: `reference/versioning.md`

- [ ] **Step 1: Append section to `reference/monorepo.md`**

At the end of the file (after the existing import flow / project structure sections), append:

```markdown
## Language-mixed mono-repo

A mono-repo may contain both `zh-CN` and `en` projects. Each project's `<html lang>` is set independently when that project is scaffolded — the root mono-repo `<html lang>` (in `project-index.html`) is fixed at mono-repo creation time and defaults to `zh-CN`. If you want the project picker page itself in English, manually edit `project-index.html` after scaffold.

`projects.json` has no `language` field — language information is implicit in each project's own `index.html`. The viewer's project switcher works the same for both languages.

When importing an existing standalone wiki into a mono-repo, the imported wiki keeps whatever `<html lang>` it shipped with. No automatic upgrade to the i18n strings.js system — additive injection only, per the rule in this file.
```

- [ ] **Step 2: Append note to `reference/versioning.md`**

At the end of the file (after the version-list and switcher sections), append:

```markdown
## Cross-language versions

Different versions of the same project may technically use different languages (e.g. v1 in `zh-CN`, v2 in `en`), since each version is self-contained. This is **not recommended** in practice — the version switcher in the topbar will jump between languages, which is jarring. If you migrate a project from Chinese to English, treat it as a fresh project under a new directory rather than a new version of the existing one.
```

- [ ] **Step 3: Manual smoke check**

```bash
grep -n "Language-mixed\|Cross-language" /Users/xgliu/Documents/git/codebase-wiki/reference/monorepo.md /Users/xgliu/Documents/git/codebase-wiki/reference/versioning.md
```
Expected: one match in each file.

- [ ] **Step 4: Commit**

```bash
git add reference/monorepo.md reference/versioning.md
git commit -m "Document language-mixed mono-repos and cross-language version policy"
```

---

## Task 14: Manual integration verification

**Files:** none (test/verify only)

This task has no code changes — it runs the spec's 5-step verification plan to confirm the implementation works end-to-end.

- [ ] **Step 1: Backward-compat smoke (existing zh wikis)**

```bash
cd /Users/xgliu/Documents/git/codebase-wikis
python3 -m http.server 8765 &
SERVER_PID=$!
sleep 1
```

Open in browser (or curl just to confirm 200 responses):
- `http://localhost:8765/vllm/086749736/`
- `http://localhost:8765/sglang/6ccc5b807/`
- `http://localhost:8765/llama-cpp/<dir>/`

Visually confirm: chrome is Chinese (unchanged), font is PingFang stack (unchanged), term popup works, search works, version switcher works.

```bash
kill $SERVER_PID
```

**This is a hard gate** — if any old wiki shows broken behavior, the implementation has a bug; stop and investigate before proceeding.

- [ ] **Step 2: Build a fresh zh mock wiki**

Create a tiny test wiki to exercise the new templates without running a full skill invocation:

```bash
mkdir -p /tmp/i18n-test-zh/web/js /tmp/i18n-test-zh/web/css
cp /Users/xgliu/Documents/git/codebase-wiki/templates/index.html /tmp/i18n-test-zh/
cp /Users/xgliu/Documents/git/codebase-wiki/templates/web/css/style.css /tmp/i18n-test-zh/web/css/
cp /Users/xgliu/Documents/git/codebase-wiki/templates/web/js/*.js /tmp/i18n-test-zh/web/js/

# Substitute placeholders for zh
sed -i.bak 's/{{LANG}}/zh-CN/g; s/{{TITLE_SUFFIX}}/中文参考 Wiki/g; s/{{PROJECT_NAME}}/TestProj/g' /tmp/i18n-test-zh/index.html
```

Create a minimal `chapters.js`:

```bash
cat > /tmp/i18n-test-zh/web/js/chapters.js <<'EOF'
export const PROJECT_NAME = 'TestProj';
export const PROJECT_TAGLINE = 'A test wiki.';
export const PROJECT_FOCUS = '';
export const PROJECT_GITHUB_REPO = 'test/test';
export const ANALYZED_COMMIT = 'abc1234';
export const ANALYZED_TAG = 'v0.0';
export const ANALYZED_DATE = '2026-05-24';
export const TRACE_TARGET = 'GET /test';
export const CHAPTERS = [];
export const TOURS = [];
export const ALL_DOCS = [];
export const CHAPTER_BY_ID = {};
export function getRepoRoot() { return localStorage.getItem('test-repo-root') || ''; }
export function setRepoRoot(v) { localStorage.setItem('test-repo-root', v); }
export function getRepoMode() { return getRepoRoot() ? 'local' : 'github'; }
export function getCurrentVersionDir() { return ''; }
export function getCurrentProjectDir() { return ''; }
export const STORAGE_PREFIX = 'test-wiki';
EOF
```

Serve and open in browser:

```bash
cd /tmp/i18n-test-zh
python3 -m http.server 8766 &
TEST_PID=$!
sleep 1
open http://localhost:8766/
```

Visually confirm:
- Topbar chrome is Chinese (search placeholder `搜索 (按 / 聚焦)`, button tooltips `上一章 (k)` etc.)
- Loading message is Chinese (`加载中…`)
- Right TOC label `本页目录`
- Home page hero (h1 `TestProj 中文参考 Wiki`)
- Font is PingFang / system CJK stack
- No JS errors in console

```bash
kill $TEST_PID
```

- [ ] **Step 3: Build a fresh en mock wiki**

```bash
mkdir -p /tmp/i18n-test-en/web/js /tmp/i18n-test-en/web/css
cp /Users/xgliu/Documents/git/codebase-wiki/templates/index.html /tmp/i18n-test-en/
cp /Users/xgliu/Documents/git/codebase-wiki/templates/web/css/style.css /tmp/i18n-test-en/web/css/
cp /Users/xgliu/Documents/git/codebase-wiki/templates/web/js/*.js /tmp/i18n-test-en/web/js/
cp /tmp/i18n-test-zh/web/js/chapters.js /tmp/i18n-test-en/web/js/

# Substitute placeholders for en
sed -i.bak 's/{{LANG}}/en/g; s/{{TITLE_SUFFIX}}/Wiki/g; s/{{PROJECT_NAME}}/TestProj/g' /tmp/i18n-test-en/index.html

cd /tmp/i18n-test-en
python3 -m http.server 8767 &
TEST_PID=$!
sleep 1
open http://localhost:8767/
```

Visually confirm:
- `<html lang="en">` in page source
- All topbar chrome English (`Search (press /)`, `Previous (k)`, `Next (j)`, `Toggle theme (t)`, `Source`)
- Right TOC label `On this page`
- Loading message `Loading…`
- Home page hero `TestProj Wiki`, English stat labels, English keyboard shortcut table
- Font visibly different from zh case (SF Pro / Segoe UI, not PingFang)
- Line-height visibly tighter (less airy)
- No JS errors in console

```bash
kill $TEST_PID
```

- [ ] **Step 4: Runtime language switch smoke**

In the en test wiki (`http://localhost:8767/` re-served), open DevTools and run:

```js
document.documentElement.lang = 'zh-CN';
location.reload();
```

After reload: chrome should switch back to Chinese, font back to CJK stack. This confirms `<html lang>` is the single source of truth.

Revert with `document.documentElement.lang = 'en'; location.reload();` → English chrome returns.

- [ ] **Step 5: Glossary parser dual-label smoke**

In the en test wiki, manually add a chapter to `chapters.js` and write a glossary file using English schema. Or simpler: open browser DevTools and execute:

```js
const sample = `### TestTerm
- Original name: \`OfficialName\`
- Definition: A term used for testing.
- Source: \`test.py:1\` defines it.`;

// Manually exercise parseGlossaryMarkdown (find the exported parser if needed)
// or just visually confirm an actual generated en wiki later
```

For a more pragmatic check: write a small `.md` file with one English-schema term entry and one Chinese-schema term entry, place it in a test chapter, and confirm both render in the glossary panel without errors.

- [ ] **Step 6: Cleanup**

```bash
rm -rf /tmp/i18n-test-zh /tmp/i18n-test-en
```

- [ ] **Step 7: Final integration commit (if not already pushed)**

If everything passed:

```bash
git log --oneline -20  # confirm 13 commits from this plan are in order
git push origin main
```

If anything failed, stop and report the failure — do not push.

---

## Done criteria

- [ ] All 14 tasks complete with green smoke checks
- [ ] 13 commits in the log, each task as a single-line message
- [ ] Pushed to origin/main
- [ ] Existing 8 wikis at `/Users/xgliu/Documents/git/codebase-wikis/` open and behave identically to before
- [ ] Fresh zh mock wiki renders Chinese chrome with original fonts
- [ ] Fresh en mock wiki renders English chrome with SF Pro/Segoe UI fonts
- [ ] Runtime `<html lang>` swap + reload switches the chrome
