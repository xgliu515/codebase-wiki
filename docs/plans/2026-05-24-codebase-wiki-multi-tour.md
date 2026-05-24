# codebase-wiki Multi-tour Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users add one or more independent trace tours to an existing codebase-wiki wiki (e.g. add a "batched generate" tour to a wiki that already has a "single-request" tour) — via a new Phase 0 `add-tour` mode + grouped `TOURS` data model + per-group sidebar/home rendering.

**Architecture:** `TOURS` becomes an array of tour groups `[{slug, title, target, steps: [...]}]` instead of a flat step array. `normalizeTours()` shim wraps old flat shapes into a single group at runtime (backward compat). Sidebar renders one section per group. Home page renders one section + card grid per tour. Files named `tour-<slug>-NN-<step>.md`. URL hash format unchanged. Phase 0 detects "add tour" keywords and enters incremental flow that only generates the new tour's files + appends one group to TOURS.

**Tech Stack:** Pure HTML/CSS/JS, no build step, no framework. Markdown templates with `{{PLACEHOLDER}}` substitution by the skill controller in Phase 4.

**Spec:** `docs/specs/2026-05-24-codebase-wiki-multi-tour-design.md`

**Path conventions:** Plan file at `docs/plans/` (NOT `docs/superpowers/plans/`). Single-line commit messages, no Co-Authored-By trailer.

**Testing:** No automated tests (skill is markdown + templates, no JS test framework). Each task ends with a smoke check (`node --check` for JS, `grep` for content); final integration verification in Task 9.

---

## Task 1: Update `chapters.js` template — TOURS group schema + `normalizeTours()` helper

**Files:**
- Modify: `templates/web/js/chapters.js`

**Context:** This is the foundation. All other JS reads `TOURS` and (now) `normalizeTours()`. Layout decision: place `normalizeTours()` and the derivations AFTER the project constants (PROJECT_NAME / TRACE_TARGET) so they can reference TRACE_TARGET without TDZ issues. Old wikis using flat TOURS continue to work via the shim.

- [ ] **Step 1: Read current state**

```bash
sed -n '33,55p' /Users/xgliu/Documents/git/codebase-wiki/templates/web/js/chapters.js
```
Expected: lines 33-38 are the current flat TOURS placeholder block; lines 40, 53, 54 are TOUR_BY_ID / ALL_DOCS / CHAPTER_BY_ID derivations.

- [ ] **Step 2: Replace TOURS block + comment (lines 33-38)**

Before:
```js
// 单请求 trace 导览：tour-00 是 overview + tour-01..N 是步骤
export const TOURS = [
  { id: 'tour-00-overview',          num: '00', title: '导览总览',
    desc: '完整 trace 入口、8 段模板说明、N 步速览' },
  // ... add 15-20 step entries
];
```

After:
```js
// Trace 导览组: 每个 group 是一条独立的 tour, 跟一个最小请求穿过 {{PROJECT_NAME}} 全栈。
// 一个 wiki 可有多条 tour (e.g. single-request / batched / streaming), 每条自包含 overview + 15-20 步。
// `slug` 决定文件前缀, 在 wiki 内唯一; 文件命名 `tour-<slug>-NN-<step>.md`。
export const TOURS = [
  {
    slug: '{{PRIMARY_TOUR_SLUG}}',                    // kebab-case, 例如 'single-request'
    title: '{{PRIMARY_TOUR_TITLE}}',                  // 一句话, 用于侧栏 section header + tour overview h1
    target: '{{TRACE_TARGET}}',                       // 该 tour 跟的最简请求字符串
    steps: [
      { id: 'tour-{{PRIMARY_TOUR_SLUG}}-00-overview', num: '00', title: '导览总览',
        desc: '完整 trace 入口、8 段模板说明、N 步速览' },
      // ... add 15-20 step entries, each id 形如 'tour-{{PRIMARY_TOUR_SLUG}}-NN-<step-slug>'
    ],
  },
  // 后续 add-tour 调用 append 更多 group, 跟一个不同的最小请求 (e.g. batched, streaming, tool-call)
];
```

- [ ] **Step 3: Update derivations (current lines 40, 44-54)**

The current block:
```js
export const TOUR_BY_ID = Object.fromEntries(TOURS.map(t => [t.id, t]));

// 所有文档（章节 + addenda + tour），用于路由查找和搜索。
// addenda 被平铺进 ALL_DOCS，每个 addendum 项额外带 parentId，便于内容渲染时回链。
const FLATTENED_CHAPTERS = CHAPTERS.flatMap(c => {
  const entries = [c];
  if (Array.isArray(c.addenda)) {
    for (const a of c.addenda) {
      entries.push({ ...a, parentId: c.id, num: a.id.match(/^(\d+[a-z]?)/)?.[1] ?? c.num });
    }
  }
  return entries;
});
export const ALL_DOCS = [...FLATTENED_CHAPTERS, ...TOURS];
export const CHAPTER_BY_ID = Object.fromEntries(ALL_DOCS.map(c => [c.id, c]));
```

**Cut** this entire block from its current location (around lines 40-54). It will be **re-inserted lower** in Step 5 after `normalizeTours()` is defined and after the project constants are initialized.

- [ ] **Step 4: After cutting, the section between TOURS and PROJECT_NAME should be empty**

Verify:
```bash
sed -n '33,60p' /Users/xgliu/Documents/git/codebase-wiki/templates/web/js/chapters.js
```
Expected: new TOURS block from Step 2, then a blank line, then directly the `// ===` divider that introduces the project info section.

- [ ] **Step 5: Insert `normalizeTours()` + derivations IMMEDIATELY UNDER the DO-NOT-REMOVE banner**

Locate the existing banner (around line 73-79):
```js
// =========================================================
// ⚠️ DO NOT REMOVE OR REWRITE BELOW THIS LINE
// The viewer's other JS files (utils.js / app.js / sidebar.js / glossary.js etc.)
// import these helpers. If you delete or alter them the viewer breaks at module load
// with `does not provide an export named 'getRepoMode'`-style errors.
// Only the constants ABOVE this banner need per-project edits.
// =========================================================
```

Insert the new block **immediately after this banner block**, **before** `// 当前版本目录名` (which currently starts `getCurrentVersionDir`):

```js

// 多 tour 支持: 把 TOURS 标准化成 group 形态。
// 旧 wiki 的 TOURS 是扁平 step 数组, 自动包成单 group; 新 schema 原样返回。
export function normalizeTours(tours) {
  if (tours.length === 0 || (tours[0] && typeof tours[0].steps !== 'undefined')) return tours;
  // 旧 schema: 扁平 step 数组. 包成单 group, slug 用 'main', title=null (运行时由 strings.js 兜底)
  return [{ slug: 'main', title: null, target: TRACE_TARGET || '', steps: tours }];
}

// 派生: 扁平所有 tour step (跨 group), 用于路由/搜索/上下章导航
const _NORMALIZED_TOURS = normalizeTours(TOURS);
const FLATTENED_TOUR_STEPS = _NORMALIZED_TOURS.flatMap(g => g.steps);
export const TOUR_BY_ID = Object.fromEntries(FLATTENED_TOUR_STEPS.map(s => [s.id, s]));

// 章节 + addenda 平铺 (addenda 由 Q&A flow 自动维护)
const FLATTENED_CHAPTERS = CHAPTERS.flatMap(c => {
  const entries = [c];
  if (Array.isArray(c.addenda)) {
    for (const a of c.addenda) {
      entries.push({ ...a, parentId: c.id, num: a.id.match(/^(\d+[a-z]?)/)?.[1] ?? c.num });
    }
  }
  return entries;
});
export const ALL_DOCS = [...FLATTENED_CHAPTERS, ...FLATTENED_TOUR_STEPS];
export const CHAPTER_BY_ID = Object.fromEntries(ALL_DOCS.map(c => [c.id, c]));

```

**Rationale for placement**: `normalizeTours` and the derivations are auto-computed from `TOURS` / `CHAPTERS` — they're NOT per-project edits. Placing them under the DO-NOT-REMOVE banner makes the banner's promise ("Only the constants ABOVE this banner need per-project edits") accurate. At module-evaluation time, this block runs AFTER `TRACE_TARGET` is initialized (which is above the banner) so the `TRACE_TARGET || ''` reference inside `normalizeTours` is safe.

- [ ] **Step 6: Smoke check**

```bash
node --check /Users/xgliu/Documents/git/codebase-wiki/templates/web/js/chapters.js
```
Expected: silent success (parse OK).

```bash
grep -E "^export (const TOURS|function normalizeTours|const TOUR_BY_ID|const ALL_DOCS|const CHAPTER_BY_ID)" /Users/xgliu/Documents/git/codebase-wiki/templates/web/js/chapters.js
```
Expected: 5 lines, in order: TOURS, normalizeTours, TOUR_BY_ID, ALL_DOCS, CHAPTER_BY_ID.

```bash
grep -c "{{PRIMARY_TOUR_SLUG}}\|{{PRIMARY_TOUR_TITLE}}" /Users/xgliu/Documents/git/codebase-wiki/templates/web/js/chapters.js
```
Expected: ≥3 (placeholders appear in slug, title, and step id template).

- [ ] **Step 7: Commit**

```bash
git add templates/web/js/chapters.js
git commit -m "chapters.js template: TOURS as group array + normalizeTours() compat shim"
```

---

## Task 2: Update `sidebar.js` — render one section per tour group

**Files:**
- Modify: `templates/web/js/sidebar.js`

**Context:** Old sidebar renders a single section header `${T.sidebar_tour_head}` then flat tour steps. New behavior: iterate normalized tours, one section per group with the group's `title` as header (fall back to `T.sidebar_tour_head` when `title` is null — that's the migrated-old-wiki case). Imports `normalizeTours` from chapters.js (Task 1 product).

- [ ] **Step 1: Update import line**

Locate (around line 1):
```js
import { CHAPTERS, TOURS, CHAPTER_BY_ID, STORAGE_PREFIX } from './chapters.js';
```

Replace with:
```js
import { CHAPTERS, TOURS, CHAPTER_BY_ID, STORAGE_PREFIX, normalizeTours } from './chapters.js';
```

- [ ] **Step 2: Replace tour-rendering block**

Locate the existing block (around lines 40-46):
```js
  // Tour 段
  if (TOURS && TOURS.length) {
    html += `<div class="sidebar-head">${T.sidebar_tour_head}</div>`;
    for (const t of TOURS) {
      const active = t.id === currentChapterId ? 'active' : '';
      html += `<a class="ch-item ${active}" href="#/${t.id}"><span class="ch-num">${t.num}</span>${t.title}</a>`;
    }
  }
```

Replace with:
```js
  // Tour 段: 每个 tour group 一个 section
  for (const tour of normalizeTours(TOURS)) {
    if (!tour.steps || tour.steps.length === 0) continue;
    const headLabel = tour.title || T.sidebar_tour_head;
    html += `<div class="sidebar-head">${escapeAttr(headLabel)}</div>`;
    for (const step of tour.steps) {
      const active = step.id === currentChapterId ? 'active' : '';
      html += `<a class="ch-item ${active}" href="#/${step.id}"><span class="ch-num">${step.num}</span>${step.title}</a>`;
    }
  }
```

Note: `escapeAttr` is already defined in this file (used for `c.id` escaping). Reuse it.

- [ ] **Step 3: Smoke check**

```bash
node --check /Users/xgliu/Documents/git/codebase-wiki/templates/web/js/sidebar.js
```
Expected: silent success.

```bash
grep -nE "normalizeTours|for \(const tour of" /Users/xgliu/Documents/git/codebase-wiki/templates/web/js/sidebar.js
```
Expected: shows the import + the new `for (const tour of normalizeTours(TOURS))` loop.

```bash
grep -c "T.sidebar_tour_head" /Users/xgliu/Documents/git/codebase-wiki/templates/web/js/sidebar.js
```
Expected: 1 (used as fallback when `tour.title` is null).

- [ ] **Step 4: Commit**

```bash
git add templates/web/js/sidebar.js
git commit -m "sidebar.js: render one section per tour group via normalizeTours"
```

---

## Task 3: Update `content.js` — `renderHome()` per-group + primary tour for "推荐第一遍"

**Files:**
- Modify: `templates/web/js/content.js`

**Context:** Home page currently has one "Trace 导览(N 步)" section + a single card grid for all tour steps + a "推荐第一遍这样学" CTA block that points to `tour-00-overview`. New behavior: iterate normalized tours, one section + card grid per tour. The "推荐第一遍" CTA always uses `TOURS[0]` (primary tour).

- [ ] **Step 1: Update import line**

Locate (around line 7):
```js
import { CHAPTER_BY_ID, TOURS, getRepoMode, PROJECT_NAME, PROJECT_TAGLINE, PROJECT_FOCUS, TRACE_TARGET,
         ANALYZED_COMMIT, ANALYZED_TAG, ANALYZED_DATE, PROJECT_GITHUB_REPO } from './chapters.js';
```

Add `normalizeTours` to the import list:
```js
import { CHAPTER_BY_ID, TOURS, getRepoMode, PROJECT_NAME, PROJECT_TAGLINE, PROJECT_FOCUS, TRACE_TARGET,
         ANALYZED_COMMIT, ANALYZED_TAG, ANALYZED_DATE, PROJECT_GITHUB_REPO, normalizeTours } from './chapters.js';
```

- [ ] **Step 2: Update `renderHome()` — derive normalized tours + primary**

Locate the function (around line 106) and its current opening:
```js
export function renderHome(contentEl, chapters) {
  const stepCount = Math.max(TOURS.length - 1, 0);   // 减去 tour-00 总览
  const chapterCount = chapters.length;
  const firstStep = TOURS.find(t => t.id !== 'tour-00-overview');
```

Replace these 4 lines with:
```js
export function renderHome(contentEl, chapters) {
  const tours = normalizeTours(TOURS);
  const primary = tours[0] || { steps: [], target: TRACE_TARGET };
  const primaryStepCount = Math.max(primary.steps.length - 1, 0);   // 减去 overview
  const primaryFirstStep = primary.steps.find(s => !s.id.endsWith('-00-overview'));
  const primaryOverview = primary.steps.find(s => s.id.endsWith('-00-overview')) || primary.steps[0];
  const chapterCount = chapters.length;
```

- [ ] **Step 3: Update the "推荐第一遍这样学" block + arch caption to use primary**

Locate (around lines 121-129, looking for the `推荐第一遍这样学` h2 and the `#/tour-00-overview` link):

```html
    <section style="background:var(--accent-soft);border:1px solid var(--accent);border-radius:12px;padding:18px 22px;margin:24px 0 28px">
      <h2 style="margin:0 0 6px;font-size:20px;color:var(--accent);">${T.home_trace_h2(PROJECT_NAME)}</h2>
      <p style="margin:0 0 12px;color:var(--text-soft);font-size:14px;">
        ${T.home_trace_lede(stepCount, PROJECT_NAME, escapeHTML(TRACE_TARGET))}
      </p>
      <a href="#/tour-00-overview" style="display:inline-block;background:var(--accent);color:white;padding:8px 16px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">${T.home_trace_cta}</a>
      ${firstStep ? `<a href="#/${firstStep.id}" style="display:inline-block;margin-left:8px;color:var(--accent);padding:8px 16px;border-radius:6px;text-decoration:none;font-size:14px;">${T.home_trace_sample}</a>` : ''}
    </section>
```

Replace with:
```html
    <section style="background:var(--accent-soft);border:1px solid var(--accent);border-radius:12px;padding:18px 22px;margin:24px 0 28px">
      <h2 style="margin:0 0 6px;font-size:20px;color:var(--accent);">${T.home_trace_h2(PROJECT_NAME)}</h2>
      <p style="margin:0 0 12px;color:var(--text-soft);font-size:14px;">
        ${T.home_trace_lede(primaryStepCount, PROJECT_NAME, escapeHTML(primary.target || TRACE_TARGET))}
      </p>
      ${primaryOverview ? `<a href="#/${primaryOverview.id}" style="display:inline-block;background:var(--accent);color:white;padding:8px 16px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">${T.home_trace_cta}</a>` : ''}
      ${primaryFirstStep ? `<a href="#/${primaryFirstStep.id}" style="display:inline-block;margin-left:8px;color:var(--accent);padding:8px 16px;border-radius:6px;text-decoration:none;font-size:14px;">${T.home_trace_sample}</a>` : ''}
    </section>
```

- [ ] **Step 4: Replace tour section block with per-group iteration**

Locate (around lines 144-158):
```html
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
```

Replace with:
```html
    ${tours.map(tour => `
      <section style="margin-top:24px;">
        <h2 style="font-size:20px;margin-bottom:8px;">${escapeHTML(tour.title || T.home_tour_h2(Math.max(tour.steps.length - 1, 0)))}</h2>
        <p style="color:var(--text-soft);margin-top:0;font-size:14px;">
          ${T.home_tour_lede(PROJECT_NAME)}
        </p>
        <div class="chapter-grid">
          ${tour.steps.map(s => `
            <a class="chapter-card" href="#/${s.id}" style="border-left:3px solid var(--accent)">
              <div class="chapter-card-num">TOUR ${s.num}</div>
              <div class="chapter-card-title">${s.title}</div>
              <div class="chapter-card-desc">${s.desc}</div>
            </a>
          `).join('')}
        </div>
      </section>
    `).join('')}
```

- [ ] **Step 5: Smoke check**

```bash
node --check /Users/xgliu/Documents/git/codebase-wiki/templates/web/js/content.js
```
Expected: silent success.

```bash
grep -nE "normalizeTours|primary\.|tours\.map|primaryFirstStep|primaryOverview" /Users/xgliu/Documents/git/codebase-wiki/templates/web/js/content.js
```
Expected: shows the new derivations + per-tour map loop.

```bash
grep -c "TOURS\.map\|TOURS\.find\|tour-00-overview" /Users/xgliu/Documents/git/codebase-wiki/templates/web/js/content.js
```
Expected: 0 (all hardcoded `tour-00-overview` strings + flat `TOURS.map` should be gone; the only `TOURS` reference now is in the `normalizeTours(TOURS)` call).

- [ ] **Step 6: Commit**

```bash
git add templates/web/js/content.js
git commit -m "content.js renderHome: per-tour sections + primary tour for 推荐第一遍 CTA"
```

---

## Task 4: Update `strings.js` — add `sidebar_tour_default_head` key

**Files:**
- Modify: `templates/web/js/strings.js`

**Context:** Current `sidebar_tour_head` is the static label "单请求 Trace 导览" / "Single-request trace tour". New behavior: when a tour has explicit `title`, use that; when `title` is null (only happens for migrated old wikis via `normalizeTours()` fallback), fall back to `sidebar_tour_head`. So **no new key is strictly needed** — `sidebar_tour_head` itself plays the fallback role. This task instead ADDS optional new keys for clarity in future home page customization.

Actually: spec calls for `sidebar_tour_default_head` as the fallback name in case the renaming clarifies intent. Since `sidebar_tour_head` already serves the same purpose with current wording, we'll **rename** for semantic clarity ONLY if it doesn't break references — but it's used in sidebar.js. Renaming would touch sidebar.js too.

**Decision:** keep `sidebar_tour_head` as-is (no rename, no new key). The `tour.title || T.sidebar_tour_head` fallback in sidebar.js is enough. Task 4 becomes a **no-op verification** + commit-empty (skipped).

- [ ] **Step 1: Verify `sidebar_tour_head` exists in both languages**

```bash
grep -nE "sidebar_tour_head" /Users/xgliu/Documents/git/codebase-wiki/templates/web/js/strings.js
```
Expected: exactly 2 matches (zh table + en table).

```bash
node --check /Users/xgliu/Documents/git/codebase-wiki/templates/web/js/strings.js
```
Expected: silent success.

- [ ] **Step 2: No file changes; no commit**

This task confirms `strings.js` requires no edits for the multi-tour feature. The existing `sidebar_tour_head` key serves dual purpose (static section header in single-tour wikis + fallback when `tour.title` is null).

---

## Task 5: Update `tour-step-prompt.md` — add 4 new placeholders

**Files:**
- Modify: `templates/tour-step-prompt.md`

**Context:** Tour step generation agents currently get `{{PROJECT_NAME}}`, `{{LANGUAGE}}`, `{{CODEBASE_PATH}}`, `{{OUTPUT_DIR}}`, `{{COMMIT_SHORT}}` etc. — but the output filename pattern `tour-NN-...md` is hardcoded for the single-tour world. New behavior: agents need to know which tour group they're writing for, so the filename gets the slug prefix.

- [ ] **Step 1: Update the template block (lines 7-52)**

Locate the opening of the template:
```
你正在为 {{PROJECT_NAME}} 的"单请求 trace 导览"写 N 个步骤。

【必读】严格按这两份建立的风格 + 模板写：
- `{{OUTPUT_DIR}}/tour-00-overview.md`（全局大纲 + N 步速览 + 状态变量表）
- `{{OUTPUT_DIR}}/tour-XX-...md`（已写好的样品步骤，是要你照搬的 tone 和结构）
```

Replace with:
```
你正在为 {{PROJECT_NAME}} 的 trace 导览 "{{TOUR_TITLE}}" 写 N 个步骤。

这条 tour 跟的是 `{{TOUR_TARGET}}` (一个最简请求), 共 {{TOUR_STEP_COUNT}} 步 (从 overview + N 步)。
本 tour 的 slug 是 `{{TOUR_SLUG}}` — 文件名前缀。

【必读】严格按这两份建立的风格 + 模板写：
- `{{OUTPUT_DIR}}/tour-{{TOUR_SLUG}}-00-overview.md`（本 tour 大纲 + 步骤速览 + 状态变量表）
- `{{OUTPUT_DIR}}/tour-{{TOUR_SLUG}}-XX-...md`（同一 tour 已写好的样品步骤）
```

- [ ] **Step 2: Update output-path pattern in the step block (lines 35-46)**

Locate:
```
【你要写的步骤】

## 步骤 NN：{{STEP_TITLE}}
- 输出文件：`{{OUTPUT_DIR}}/tour-NN-{{SHORT_SLUG}}.md`
```

Replace with:
```
【你要写的步骤】

## 步骤 NN：{{STEP_TITLE}}
- 输出文件：`{{OUTPUT_DIR}}/tour-{{TOUR_SLUG}}-NN-{{SHORT_SLUG}}.md`
```

- [ ] **Step 3: Update the cross-link instruction (line 30)**

Locate:
```
- 第 7 段是知识网——必须用 markdown 链接到参考章节对应小节
```

Replace with:
```
- 第 7 段是知识网——必须用 markdown 链接到参考章节对应小节, 也可以链接到本 tour 其他步骤 (见下方 {{TOUR_STEP_LIST}})
```

- [ ] **Step 4: Add the new `{{TOUR_STEP_LIST}}` block after the per-step instructions**

After the `(重复以上块 1-4 次，根据 agent 负责的 step 数)` line (around line 47), insert before the `---` separator:

```

【整条 tour 的步骤清单】(用于"分支与延伸"段引用本 tour 其他步骤)

{{TOUR_STEP_LIST}}

```

(The controller will substitute `{{TOUR_STEP_LIST}}` with a markdown bullet list of all steps in this tour.)

- [ ] **Step 5: Update the "Use guidance" section (lines 54+)**

Append a new bullet at the end of the existing list:

```
- **Multi-tour placeholders**: `{{TOUR_SLUG}}` (kebab-case tour id, drives filename prefix), `{{TOUR_TITLE}}` (human-readable name), `{{TOUR_TARGET}}` (the minimal request this tour follows), `{{TOUR_STEP_COUNT}}` (total step count incl. overview), `{{TOUR_STEP_LIST}}` (markdown bullet list of all steps; controller injects). Used so each step file's filename prefixes the tour slug and so cross-step links can target other steps in the same tour.
```

- [ ] **Step 6: Smoke check**

```bash
grep -oE "\{\{[A-Z_]+\}\}" /Users/xgliu/Documents/git/codebase-wiki/templates/tour-step-prompt.md | sort -u
```
Expected: includes `{{TOUR_SLUG}}`, `{{TOUR_TITLE}}`, `{{TOUR_TARGET}}`, `{{TOUR_STEP_COUNT}}`, `{{TOUR_STEP_LIST}}` among the placeholders.

```bash
grep -c "tour-NN-\|tour-00-overview" /Users/xgliu/Documents/git/codebase-wiki/templates/tour-step-prompt.md
```
Expected: 0 (no remaining hardcoded `tour-NN-...` filename pattern; all use `{{TOUR_SLUG}}` prefix).

- [ ] **Step 7: Commit**

```bash
git add templates/tour-step-prompt.md
git commit -m "tour-step-prompt: add TOUR_SLUG/TITLE/TARGET/STEP_COUNT/STEP_LIST placeholders for multi-tour"
```

---

## Task 6: Create `tour-overview-prompt.md`

**Files:**
- Create: `templates/tour-overview-prompt.md`

**Context:** Dedicated agent prompt for the per-tour overview file (`tour-<slug>-00-overview.md`). Distinct from `tour-step-prompt.md` because (1) overview has 3 sections, not 8; (2) overview references all steps + other tours.

- [ ] **Step 1: Write the file**

````markdown
# Tour overview generation agent prompt template

Use this when dispatching an agent to write the per-tour overview file `tour-<slug>-00-overview.md`. One overview per tour.

## Template

```
你在为 {{PROJECT_NAME}} 写一条 trace 导览的 overview 页面。

这条 tour 的信息:
- 标题: {{TOUR_TITLE}}
- slug: {{TOUR_SLUG}}
- 跟的最小请求: {{TOUR_TARGET}}
- 总步骤数: {{TOUR_STEP_COUNT}} (含本 overview)

本 wiki 已有的其他 tour: {{OTHER_TOURS}}

输出文件: `{{OUTPUT_DIR}}/tour-{{TOUR_SLUG}}-00-overview.md`

【硬性要求】
- {{LANGUAGE}}, GitHub flavored markdown, 禁用 emoji
- 总长 ~150 行
- 不要写 H1 (本页 H1 已由 viewer 注入 `{{TOUR_TITLE}}`)
- 直接以 H2 开头, 3 段结构 (见下)

## 输出结构 (严格 3 段)

### 1. 这条 tour 跟的是什么

H2 标题: "## 这条 tour 跟的是什么" (英文 wiki: "## What this tour follows")

1-2 段:
- 具体描述 `{{TOUR_TARGET}}` 这个请求是什么意思 / 用户实际怎么用 / 一句话调用例子
- 与其他 tour 的区别 — 如果 {{OTHER_TOURS}} 有内容, 显式说"与 X tour 的不同在于...":强调代码路径差异, 不是"这是 batched 版本"这种重言
- 为什么这条 tour 值得单独写 (i.e. 这个场景独有的代码路径 / 优化 / 抽象, 在 reference 章节里也有但全栈走法值得线性看一遍)

### 2. 8 段模板速览

H2 标题: "## 每一步的写法" (英文 wiki: "## How each step is structured")

照搬下面这段 (内容不变, 只翻译标题部分按 LANGUAGE):

每一步都按 8 段模板写, 让设计读起来像"问题的合理后果"而不是结论:

1. **当前情境** — trace 到这一步时, 数据结构 / 已发生的事
2. **问题** — 这一步要解决什么需求
3. **朴素思路** — 第一直觉做法
4. **为什么朴素思路会崩** — 具体的失败模式, 不要空泛
5. **{{PROJECT_NAME}} 的做法** — 实际设计 (有 ASCII 图 / SVG 时画出来)
6. **代码位置** — `file:line` refs, 按阅读顺序
7. **分支与延伸** — 链回 reference 章节 / 本 tour 其他步骤
8. **走完这一步你脑子里应该多了什么** — 3-5 条 takeaway

8 段模板详见 `reference/8-section-template.md`。

### 3. 本 tour 的步骤列表

H2 标题: "## 步骤列表" (英文 wiki: "## Step list")

紧接 controller 注入的步骤表 (DO NOT 重新生成, 原样照抄):

{{STEP_TABLE}}

(典型的步骤表是一个 markdown 表格, 列 = `步骤 / 标题 / 一句话本步要讲的内容`。)

---

完成后简短报告: 文件路径 + 三段标题 + 步骤数, <100 字。
```

## Use guidance

- **One agent per tour overview** — overview is one file, single dispatch
- **Run AFTER step agents** — overview's section 1 references "what this tour does", but section 3 is just the step table which is fixed; so technically overview can run in parallel with step agents. We recommend running it after for consistency.
- **`{{STEP_TABLE}}` is injected verbatim** — controller builds the table from the Phase 2 step plan; the agent does NOT regenerate it. This prevents drift between overview's claimed step list and the actual generated steps.
- **`{{OTHER_TOURS}}` format**: if no other tours, pass `(no other tours yet)`. Otherwise, a markdown bullet list of `<slug>: <title> — follows <target>` for each other tour.

## Quality verification

- All 3 sections present with the expected H2 headers
- Section 1 explicitly contrasts with other tours (when other tours exist)
- Section 3 is the literal `{{STEP_TABLE}}` content unchanged
- No 我研究了 / 接下来 / etc. process narration
- Length close to 150 lines
````

- [ ] **Step 2: Smoke check**

```bash
test -f /Users/xgliu/Documents/git/codebase-wiki/templates/tour-overview-prompt.md && echo OK
```
Expected: `OK`.

```bash
grep -oE "\{\{[A-Z_]+\}\}" /Users/xgliu/Documents/git/codebase-wiki/templates/tour-overview-prompt.md | sort -u
```
Expected: includes `{{PROJECT_NAME}}`, `{{TOUR_TITLE}}`, `{{TOUR_SLUG}}`, `{{TOUR_TARGET}}`, `{{TOUR_STEP_COUNT}}`, `{{OTHER_TOURS}}`, `{{OUTPUT_DIR}}`, `{{LANGUAGE}}`, `{{STEP_TABLE}}`.

- [ ] **Step 3: Commit**

```bash
git add templates/tour-overview-prompt.md
git commit -m "Add tour-overview-prompt template for per-tour overview agent dispatch"
```

---

## Task 7: Update `reference/trace-tour-design.md` — Multi-tour sections

**Files:**
- Modify: `reference/trace-tour-design.md`

**Context:** Add two appendix sections describing the multi-tour mental model + naming convention. Keep existing content intact.

- [ ] **Step 1: Append two new sections at end of file**

Append to `/Users/xgliu/Documents/git/codebase-wiki/reference/trace-tour-design.md`:

```markdown

## Multi-tour design

A single wiki can contain multiple independent trace tours, each following a different minimum-viable request. Examples for vLLM:

- **`single-request`** — `llm.generate(["hi"], max_tokens=3)` — the canonical full-stack walk-through
- **`batched`** — `llm.generate(["a","b","c"], max_tokens=3)` — batched fan-out, scheduler batching, decode interleaving
- **`streaming`** — `llm.generate(..., stream=True)` — yield path, event handlers, terminal flush
- **`tool-call`** — `llm.chat(..., tools=[...])` — function-calling round-trip with tool_use stop tokens

Each tour is **self-contained**: its own overview file + 15-20 step files (variant tours / subsystem deep-dives can be shorter, 8-12 steps).

Tours **share reference chapters** — chapter 03 on the scheduler can be referenced by both `single-request` and `batched` tours, with each tour citing different `file:line` ranges relevant to its scenario.

Tours **do not import each other's steps** — duplicate ~10-15% content between tours is acceptable (each step is read linearly within its tour and benefits from being self-contained).

Add tours via the codebase-wiki skill's `add-tour` mode (Phase 0 detects the keyword `add tour` / `加 tour`). One tour per skill invocation; to add multiple tours, invoke the skill multiple times.

## Naming convention

**Tour slugs** must be kebab-case and unique within a wiki. Pick a name that describes the scenario, not the position:

- ✅ `single-request`, `batched-generate`, `streaming`, `tool-call`, `multimodal`
- ❌ `main`, `tour1`, `first`, `default`

The slug becomes the file prefix: `tour-<slug>-NN-<step>.md`. URL hashes are `#/tour-<slug>-NN-<step>`.

**Reserved fallback slug**: `main` is used **only** by the automatic compat shim when migrating an old wiki (pre-multi-tour) into the group schema — the user does not normally create a tour with this slug.

**Step slugs** inside a tour follow `<short-descriptor>` form (kebab-case, ~1-3 words): `cli-parse`, `prompt-fanout`, `decode-loop`. Combined: `tour-batched-09-decode-interleave.md`.
```

- [ ] **Step 2: Smoke check**

```bash
grep -nE "^## (Multi-tour design|Naming convention)" /Users/xgliu/Documents/git/codebase-wiki/reference/trace-tour-design.md
```
Expected: 2 matches (one for each new section).

- [ ] **Step 3: Commit**

```bash
git add reference/trace-tour-design.md
git commit -m "reference/trace-tour-design: add Multi-tour design + Naming convention appendices"
```

---

## Task 8: Update `SKILL.md` — Phase 0/2/3/4 for add-tour mode

**Files:**
- Modify: `SKILL.md`

**Context:** Largest doc change. Five logical edits in one file. Use Edit tool with surgical replacements (not full-file rewrite).

- [ ] **Step 1: Phase 0 detection table — add 4th row**

Locate the Phase 0 detection table around line 25-30:

```markdown
| Detected | Mode | Meaning |
|----------|------|---------|
| No `projects.json`, directory empty / missing | new mono-repo | Create the repo + its first project |
| `projects.json` present, target project dir absent | new project | Add a project to an existing mono-repo |
| `projects.json` present, target project dir present | append version | Add a version to an existing project |
```

Replace with:

```markdown
| Detected | Mode | Meaning |
|----------|------|---------|
| No `projects.json`, directory empty / missing | new mono-repo | Create the repo + its first project |
| `projects.json` present, target project dir absent | new project | Add a project to an existing mono-repo |
| `projects.json` present, target project dir present, user prompt does NOT contain "add tour" / "加 tour" | append version | Add a version to an existing project |
| `projects.json` present, target project dir present, user prompt CONTAINS "add tour" / "加 tour" / "添加 trace tour" | **add-tour** | Append an additional trace tour to the current version (see `reference/trace-tour-design.md` Multi-tour design) |
```

- [ ] **Step 2: Phase 0 question list — add LANGUAGE & PRIMARY_TOUR_SLUG/TITLE for fresh wikis + add-tour question branch**

Locate the Phase 0 numbered question list around line 32-39. Currently:

```markdown
Ask the user **one question at a time** (no batches):

1. **Codebase path**: absolute path on disk (used to read source for `file:line` refs)
2. **Output directory**: the mono-repo path (existing or to-be-created)
3. **Project name + GitHub repo** (new mono-repo / new project only): e.g., `vllm` + `vllm-project/vllm`
4. **LANGUAGE** (new mono-repo / new project only): `zh-CN` (default) | `en`. Drives `<html lang>`, `{{TITLE_SUFFIX}}`, which README/glossary template to copy, and the `{{LANGUAGE}}` value passed to chapter/addendum prompts (`zh-CN` → `简体中文`, `en` → `English`). `bilingual` is no longer offered — pick one. The bilingual `strings.js` ships unmodified for both.
5. **Lock version**: confirm `git rev-parse --short HEAD` of the codebase as the analyzed commit, or let the user specify a tag
```

Replace with:

```markdown
Ask the user **one question at a time** (no batches):

1. **Codebase path**: absolute path on disk (used to read source for `file:line` refs)
2. **Output directory**: the mono-repo path (existing or to-be-created)
3. **Project name + GitHub repo** (new mono-repo / new project only): e.g., `vllm` + `vllm-project/vllm`
4. **LANGUAGE** (new mono-repo / new project only): `zh-CN` (default) | `en`. Drives `<html lang>`, `{{TITLE_SUFFIX}}`, which README/glossary template to copy, and the `{{LANGUAGE}}` value passed to chapter/addendum prompts (`zh-CN` → `简体中文`, `en` → `English`). `bilingual` is no longer offered — pick one. The bilingual `strings.js` ships unmodified for both.
5. **Lock version**: confirm `git rev-parse --short HEAD` of the codebase as the analyzed commit, or let the user specify a tag
6. **PRIMARY_TOUR_SLUG + PRIMARY_TOUR_TITLE** (new mono-repo / new project only): kebab-case slug + human title for the wiki's primary trace tour. Default slug auto-derived from TRACE_TARGET (e.g. `llm.generate(...)` → `single-request`); default title `"单请求 Trace 导览"` (zh-CN) / `"Single-request trace tour"` (en). Substituted into `templates/web/js/chapters.js` `{{PRIMARY_TOUR_SLUG}}` / `{{PRIMARY_TOUR_TITLE}}` placeholders. See `reference/trace-tour-design.md` Multi-tour design.

**add-tour mode (Phase 0 question 6-9 instead)**:

When the detected mode is `add-tour`, skip questions 3-5 and instead ask:

6. **Target project**: pick from the projects in `projects.json`
7. **Target version**: default `latest` (whichever entry in the project's `versions.json` has `"latest": true`); user can pick a specific version dir
8. **New tour slug**: kebab-case, unique within this wiki's existing `chapters.js` TOURS (skill reads the file and rejects conflicts). E.g. `batched`, `streaming`, `tool-call`
9. **New tour title + TRACE_TARGET**: one-line human title (e.g. `"Batched generate trace tour"`) + the minimal request string this tour follows (e.g. `llm.generate(["a","b","c"], max_tokens=3)`)
```

- [ ] **Step 3: Phase 2 — split into "fresh tour" + "add-tour" branches**

Locate Phase 2 around line 76:

```markdown
## Phase 2: Design the trace tour

Pick **one minimum-viable use case** that exercises the full stack. Examples:

- vllm: `LLM("Qwen2.5-7B").generate(["hello"], max_tokens=3)`
- hermes-agent: a single CLI message → tool call → response
- a web framework: one HTTP request from socket accept to response write
- a database: `SELECT * FROM t WHERE id=1` from parse to row return

Criteria for picking:
- **Minimum complexity**: no advanced features (TP, multimodal, quant for vllm; no agents-of-agents for hermes; no JOIN for database)
- **Real**: must actually work end-to-end, not contrived
- **Touches all layers**: skipping a layer means a trace step is empty

Confirm with user. Then **list ~15-20 steps** as a state-evolution table (see `reference/trace-tour-design.md`).
```

Replace with:

```markdown
## Phase 2: Design the trace tour(s)

### Fresh wiki (new mono-repo / new project mode)

Pick **one minimum-viable use case** for the wiki's primary tour, then list ~15-20 steps as a state-evolution table. Examples:

- vllm: `LLM("Qwen2.5-7B").generate(["hello"], max_tokens=3)`
- hermes-agent: a single CLI message → tool call → response
- a web framework: one HTTP request from socket accept to response write
- a database: `SELECT * FROM t WHERE id=1` from parse to row return

Criteria for picking:
- **Minimum complexity**: no advanced features (TP, multimodal, quant for vllm; no agents-of-agents for hermes; no JOIN for database)
- **Real**: must actually work end-to-end, not contrived
- **Touches all layers**: skipping a layer means a trace step is empty

Confirm with user. Output: a state-evolution table (see `reference/trace-tour-design.md`).

### add-tour mode (incremental)

Phase 0 already collected the new tour's slug / title / TRACE_TARGET. In Phase 2:

1. Read the existing wiki context (`chapters.js` CHAPTERS list + existing TOURS) — do NOT re-explore the codebase
2. Check slug uniqueness (Phase 0 already did, but re-confirm against the actual file)
3. Design the new tour's step list (~15-20 steps for full-stack tours; 8-12 for variant / subsystem tours). Use the same state-evolution table format as fresh-wiki tours.
4. Confirm step list with user before Phase 3

Output: a state-evolution table for this single new tour.
```

- [ ] **Step 4: Phase 3 — split into "fresh" + "add-tour"**

Locate Phase 3 around line 100:

```markdown
## Phase 3: Generate content

Use **parallel agents** (dispatching-parallel-agents skill). For each agent, give:

- The chapter/step **inputs** (which files, what to cover)
- The template (`templates/chapter-prompt.md` or `templates/tour-step-prompt.md`)
- Strict format rules (8-section template for tour; standard markdown for chapters)
- Output path
- The `{{LANGUAGE}}` value: `简体中文` for `zh-CN` LANGUAGE, `English` for `en` LANGUAGE — drives whether the agent writes Chinese or English content

Recommended dispatch:
- 5-6 agents for chapters (group adjacent chapters per agent)
- 5-6 agents for tour steps (group adjacent steps per agent)
- All in **one parallel batch** (single message, multiple Agent tool uses)

**Quality bar**: each chapter ~800-1500 lines, each tour step ~120-200 lines. `file:line` refs everywhere. Code excerpts 5-30 lines max.
```

Replace with:

```markdown
## Phase 3: Generate content

### Fresh wiki

Use **parallel agents** (dispatching-parallel-agents skill). For each agent, give:

- The chapter/step **inputs** (which files, what to cover)
- The template (`templates/chapter-prompt.md` or `templates/tour-step-prompt.md`)
- Strict format rules (8-section template for tour; standard markdown for chapters)
- Output path
- The `{{LANGUAGE}}` value: `简体中文` for `zh-CN` LANGUAGE, `English` for `en` LANGUAGE — drives whether the agent writes Chinese or English content
- For tour step agents: `{{TOUR_SLUG}}`, `{{TOUR_TITLE}}`, `{{TOUR_TARGET}}`, `{{TOUR_STEP_COUNT}}`, `{{TOUR_STEP_LIST}}` — controller fills these from Phase 0's PRIMARY_TOUR_SLUG / PRIMARY_TOUR_TITLE and Phase 2's step table

Recommended dispatch:
- 5-6 agents for chapters (group adjacent chapters per agent)
- 5-6 agents for tour steps (group adjacent steps per agent)
- 1 agent for the tour overview file (`tour-<slug>-00-overview.md`) using `templates/tour-overview-prompt.md` — controller provides `{{STEP_TABLE}}` verbatim from Phase 2 so the overview doesn't drift from generated steps
- All in **one parallel batch** (single message, multiple Agent tool uses)

**Quality bar**: each chapter ~800-1500 lines, each tour step ~120-200 lines, tour overview ~150 lines. `file:line` refs everywhere. Code excerpts 5-30 lines max.

### add-tour mode

Same dispatch pattern but **only for the new tour**:

- N/3 parallel agents writing 3-5 steps each (`templates/tour-step-prompt.md`)
- 1 agent for the new tour's overview (`templates/tour-overview-prompt.md`)
- Each tour step agent gets the **existing wiki's `chapters.js`** so they can link back to the right CHAPTERS in section 7 (分支与延伸)
- Each agent gets `{{TOUR_SLUG}}` = Phase 0's new-tour slug, `{{TOUR_TITLE}}` = new-tour title, `{{TOUR_TARGET}}` = new-tour TRACE_TARGET, `{{LANGUAGE}}` = the existing wiki's LANGUAGE (read from `<html lang>` of the wiki's `index.html`)
- The overview agent additionally receives `{{OTHER_TOURS}}` = a bullet list of the existing tours in `chapters.js` TOURS (after normalization), e.g. `"single-request: Single-request trace tour — follows llm.generate([\"hi\"], ...)"`

**Do NOT regenerate** any existing chapter or tour step. Reference chapters and the existing tour stay untouched.
```

- [ ] **Step 5: Phase 4 step 1 — update chapters.js placeholder list + add add-tour migration step**

Locate Phase 4 step 1 around line 120-130:

```markdown
1. **`web/js/chapters.js`** (the only JS file requiring per-project edits — all other
   `web/js/*.js` import the constants below, so do **not** hardcode the project name anywhere else).
   **Edit ONLY the constants in the upper section** (PROJECT_NAME / PROJECT_GITHUB_REPO / ANALYZED_* / PROJECT_TAGLINE / PROJECT_FOCUS / TRACE_TARGET / CHAPTERS / TOURS).
   **Do NOT remove or rewrite the helper functions in the lower half** (`getCurrentVersionDir`, `getCurrentProjectDir`, `STORAGE_PREFIX` IIFE, `REPO_ROOT_KEY`, `getRepoMode`, `getRepoRoot`, `setRepoRoot`) — `utils.js` / `app.js` / `sidebar.js` / `glossary.js` import them and the viewer will fail at module load (`does not provide an export named 'getRepoMode'`) if they're truncated or simplified:
```

Replace with:

```markdown
1. **`web/js/chapters.js`** (the only JS file requiring per-project edits — all other
   `web/js/*.js` import the constants below, so do **not** hardcode the project name anywhere else).
   **Edit ONLY the constants in the upper section** (PROJECT_NAME / PROJECT_GITHUB_REPO / ANALYZED_* / PROJECT_TAGLINE / PROJECT_FOCUS / TRACE_TARGET / CHAPTERS / TOURS).
   **Do NOT remove or rewrite the helper functions in the lower half** (`normalizeTours`, `getCurrentVersionDir`, `getCurrentProjectDir`, `STORAGE_PREFIX` IIFE, `REPO_ROOT_KEY`, `getRepoMode`, `getRepoRoot`, `setRepoRoot`) — `utils.js` / `app.js` / `sidebar.js` / `content.js` / `glossary.js` import them and the viewer will fail at module load (`does not provide an export named 'getRepoMode'`) if they're truncated or simplified.

   **TOURS schema** (new wikis): TOURS is an array of tour **groups**, each with `slug` / `title` / `target` / `steps[]`. The primary tour's slug/title come from Phase 0 (`{{PRIMARY_TOUR_SLUG}}` / `{{PRIMARY_TOUR_TITLE}}`). See `reference/trace-tour-design.md` Multi-tour design.

   **add-tour mode**: edit the existing wiki's `chapters.js` in place — **append** a new tour group to the TOURS array. If the existing TOURS is the **old flat shape** (pre-multi-tour wiki), first migrate in place: wrap the existing flat steps into a single group with `slug: 'main'`, `title: '单请求 Trace 导览'` (zh-CN wiki) or `'Single-request trace tour'` (en wiki) — read `<html lang>` from the wiki's `index.html` to decide — `target: <existing TRACE_TARGET>`, `steps: [<existing flat steps verbatim>]`. **Do NOT rename existing step files** — preserve URL compatibility. Then append the new tour group as a second array entry.

   In add-tour mode, the wiki's `sidebar.js` and `content.js` must also be at the new-template version (they use `normalizeTours` and per-group rendering). If the wiki's chrome predates multi-tour (no `normalizeTours` import), copy `templates/web/js/sidebar.js` and `templates/web/js/content.js` over the wiki's versions. Verify with `grep "normalizeTours" <wiki>/web/js/sidebar.js <wiki>/web/js/content.js` — expect 1 match each.
```

- [ ] **Step 6: Phase 4 step 7 verification — add multi-tour checks**

Locate the existing Phase 4 step 7 (the `Scaffold-time verification` block) around line 165-180. Find:

```bash
   # (b) chapters.js still exports all the helpers the viewer needs
   node --check <output>/<project>/<version>/web/js/chapters.js
   grep -cE '^export (function (getCurrentVersionDir|getCurrentProjectDir|getRepoMode|getRepoRoot|setRepoRoot)|const STORAGE_PREFIX)' <output>/<project>/<version>/web/js/chapters.js
   # Expected: 6  (5 functions + STORAGE_PREFIX). If less, the agent truncated the lower half — restore from templates/web/js/chapters.js.
```

Update the expected count and grep to include `normalizeTours`:

```bash
   # (b) chapters.js still exports all the helpers the viewer needs (including normalizeTours)
   node --check <output>/<project>/<version>/web/js/chapters.js
   grep -cE '^export (function (normalizeTours|getCurrentVersionDir|getCurrentProjectDir|getRepoMode|getRepoRoot|setRepoRoot)|const STORAGE_PREFIX)' <output>/<project>/<version>/web/js/chapters.js
   # Expected: 7  (6 functions + STORAGE_PREFIX). If less, the agent truncated the lower half — restore from templates/web/js/chapters.js.
```

Also append a new check (d) for tour group integrity (only in non-add-tour modes — fresh wikis):

```bash
   # (d) For fresh-wiki / new-project mode: TOURS is in group shape with one entry
   node -e "import('<output>/<project>/<version>/web/js/chapters.js').then(m => { const t = m.TOURS; if (!t[0]?.steps) throw new Error('TOURS not in group shape'); console.log('OK', t.length, 'tour(s)'); })"
   # Expected: prints "OK 1 tour(s)" for fresh, "OK 2 tour(s)" after first add-tour, etc.
```

- [ ] **Step 7: Smoke check**

```bash
grep -cE "add-tour|add tour|加 tour|multi-tour|Multi-tour|normalizeTours" /Users/xgliu/Documents/git/codebase-wiki/SKILL.md
```
Expected: ≥10 (mentions across Phase 0 detection, questions, Phase 2 + 3 + 4 sections).

```bash
grep -nE "^## Phase [0-7]:" /Users/xgliu/Documents/git/codebase-wiki/SKILL.md
```
Expected: shows all phase headers; verify Phase 0/2/3/4 didn't lose their original heading structure.

- [ ] **Step 8: Commit**

```bash
git add SKILL.md
git commit -m "SKILL.md: add-tour mode (Phase 0 detection + Phase 2/3/4 incremental flow + verify checks)"
```

---

## Task 9: Manual integration verification

**Files:** none (test/verify only)

This task has no code changes — it runs the spec's 5-step verification plan.

- [ ] **Step 1: Backward-compat smoke for existing wikis**

```bash
cd /Users/xgliu/Documents/git/codebase-wikis
python3 -m http.server 8769 &
SERVER_PID=$!
sleep 1
for path in /vllm/086749736/ /sglang/6ccc5b807/ /llama-cpp/b9209/ /dwarfstar-4/c9dd949/ /dwarfstar-4/f91c12b/ /hermes-agent/f36c89cd5/ /openclaw/v2026.5.18/ /openclaw/v2026.5.22/ /opencode/v1.15.10/ /pi/v4868222e/; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:8769${path}")
  echo "  ${path} → ${code}"
done
kill $SERVER_PID
```
Expected: all 200. Existing wikis remain untouched (this plan only modifies skill templates; live wikis aren't regenerated). **This is a hard gate** — if any old wiki returns non-200, something else broke.

**This step does NOT visually verify** that old wikis still render correctly — that requires opening them in a browser and checking sidebar / tour navigation. The user should do that for at least one zh wiki and one en wiki (which there isn't one yet — openclaw v2026.5.22 is the closest English wiki).

- [ ] **Step 2: Fresh wiki dry-run (manual, skipped unless user runs end-to-end skill)**

This step requires invoking the full codebase-wiki skill end-to-end on a small target codebase. Implementer cannot run this from inside the plan. Mark as user-deferred verification:

Document the expected behavior for when user does run it:
- Phase 0 questions 6 (PRIMARY_TOUR_SLUG + PRIMARY_TOUR_TITLE) appears
- Generated `chapters.js` has new TOURS group schema with one entry
- Generated tour step files named `tour-<slug>-NN-<step>.md`
- Generated overview file named `tour-<slug>-00-overview.md`
- Sidebar shows one section labeled with the tour title; home page shows one section with the same title

- [ ] **Step 3: add-tour dry-run (manual, skipped unless user runs end-to-end skill)**

Same constraint — requires full skill invocation in add-tour mode. Document expected behavior:

- Phase 0 detects `add tour` / `加 tour` keyword and asks questions 6-9 (target project / version / slug / title+target)
- chapters.js TOURS array grows by one entry (or is migrated then grown for old-shape wikis)
- New tour files appear at `tour-<new-slug>-NN-...md`
- Existing tour files unchanged
- Sidebar shows TWO sections; home page shows two sections + two card grids
- The first section / first home block still maps to TOURS[0] (the primary tour)

- [ ] **Step 4: Static smoke on all modified templates**

```bash
cd /Users/xgliu/Documents/git/codebase-wiki
node --check templates/web/js/chapters.js
node --check templates/web/js/sidebar.js
node --check templates/web/js/content.js
node --check templates/web/js/strings.js
echo "JS templates parse OK"

# Verify all new placeholders are consistent
echo
echo "=== tour-step-prompt placeholders ==="
grep -oE "\{\{[A-Z_]+\}\}" templates/tour-step-prompt.md | sort -u
echo
echo "=== tour-overview-prompt placeholders ==="
grep -oE "\{\{[A-Z_]+\}\}" templates/tour-overview-prompt.md | sort -u
echo
echo "=== chapters.js placeholders ==="
grep -oE "\{\{[A-Z_]+\}\}" templates/web/js/chapters.js | sort -u
```

Expected:
- All 4 JS files parse silently
- `tour-step-prompt` lists includes TOUR_SLUG / TOUR_TITLE / TOUR_TARGET / TOUR_STEP_COUNT / TOUR_STEP_LIST plus existing placeholders
- `tour-overview-prompt` lists similar + STEP_TABLE + OTHER_TOURS
- `chapters.js` placeholders include PRIMARY_TOUR_SLUG and PRIMARY_TOUR_TITLE

- [ ] **Step 5: URL hash + glossary smoke**

For an existing wiki (e.g. `vllm/086749736`), confirm a tour step URL still resolves:
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8769/vllm/086749736/tour-01-cli-boot.md
```
Expected: 200 (existing flat-named tour files are untouched).

- [ ] **Step 6: Final integration commit/push**

If all checks pass:

```bash
git log --oneline -12  # show all task commits
git push origin main
```

If anything fails, stop and report — do not push.

---

## Done criteria

- [ ] All 9 tasks complete with green smoke checks
- [ ] 7 commits on `main` (Tasks 1, 2, 3, 5, 6, 7, 8 — Task 4 is no-op, Task 9 is verification only)
- [ ] Pushed to origin/main
- [ ] Existing 10 wikis at `/Users/xgliu/Documents/git/codebase-wikis/` still return 200 on root + version paths
- [ ] All 4 modified JS templates pass `node --check`
- [ ] New placeholders in `chapters.js`, `tour-step-prompt.md`, `tour-overview-prompt.md` are consistent and complete
- [ ] User runs a fresh-wiki end-to-end + an add-tour end-to-end at their leisure, confirming Step 2 & 3 above
