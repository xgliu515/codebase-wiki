# Codebase-Wiki Q&A Addenda Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fourth entry-point mode "Q&A addenda flow" to the codebase-wiki skill — users feed batched questions into an already-generated wiki, the skill auto-classifies each question to a parent chapter and dispatches agents to write addendum files (same quality bar as a reference chapter). Web viewer gains two-level nested sidebar + addendum banner.

**Architecture:** Skill-level changes (markdown instruction docs + a new prompt template) describe the runtime flow but produce no executable code. Template-level changes (`templates/web/js/*` + `templates/web/css/style.css`) one-time update the viewer to render nested addenda; backwards-compatible with wikis that have no `addenda` field. Data model: each `CHAPTERS[i]` may optionally carry `addenda: [{id, title, question}, ...]`; viewer flattens addenda into `ALL_DOCS` so routing / search / `j-k` navigation pick them up automatically.

**Tech Stack:** Vanilla ES modules (no build step), HTML/CSS, markdown instructions. No automated test framework in this repo; verification uses `node --check`, `grep`, `python3 -m json.tool`, and manual browser inspection at `python3 -m http.server`.

**Spec:** `docs/specs/2026-05-20-codebase-wiki-qa-addenda-design.md`

**Branch:** `qa-addenda` (create in Task 0). All commits land here. Use single-line commit subjects matching existing repo convention (see `git log --oneline`).

---

## File Structure

### New files

| File | Responsibility |
|------|----------------|
| `templates/addendum-prompt.md` | Agent prompt template for generating a single addendum. Same quality bar as `chapter-prompt.md`. |
| `reference/qa-addenda-flow.md` | Reference methodology doc: phase walkthrough, file naming, idempotency contract, error matrix. |

### Modified files

| File | Change |
|------|--------|
| `templates/web/css/style.css` | Add 4 CSS rules: `.ch-row`, `.ch-toggle`, `.ch-item.addendum`, `.ch-item.has-active-child`, `.addendum-banner`. |
| `templates/web/js/chapters.js` | Flatten `addenda` into `ALL_DOCS`; each flattened addendum carries `parentId`. Document the optional `addenda` field in CHAPTERS. |
| `templates/web/js/sidebar.js` | `renderChapterList` renders nested addenda + toggle chevron + auto-expand when active addendum is a child + localStorage persistence. |
| `templates/web/js/content.js` | `loadChapter` prepends an addendum banner (`本节回答…回到 <parent>`) when the loaded chapter has `parentId`. |
| `SKILL.md` | Insert a "Q&A addenda flow" section after "Importing existing standalone wiki repos". Add `reference/qa-addenda-flow.md` to the reference list. |

### Untouched (verified — these consume only `ALL_DOCS` / `CHAPTER_BY_ID`, so flattening covers them):

`templates/web/js/{app.js, search.js, glossary.js, diagrams.js, versions.js, architecture.js, utils.js}` — confirmed by reading the spec §7 and source.

---

## Task 0: Create branch

**Files:** (none — git operation only)

- [ ] **Step 1: Verify clean working tree**

Run: `git status`
Expected: `working tree clean` on branch `main`.

- [ ] **Step 2: Create and switch to the implementation branch**

```bash
git checkout -b qa-addenda
```

Expected: `Switched to a new branch 'qa-addenda'`.

- [ ] **Step 3: Verify branch**

Run: `git branch --show-current`
Expected: `qa-addenda`

(No commit yet — Task 1 will produce the first commit.)

---

## Task 1: Add CSS rules for addenda

**Files:**
- Modify: `templates/web/css/style.css` (append after the existing `.sidebar-head` rule, around line 210)

- [ ] **Step 1: Locate the insertion point**

Run: `grep -n "sidebar-head" templates/web/css/style.css`
Expected: shows the `.sidebar-head { ... }` rule ending around line 210. Note the exact line number of its closing `}`.

- [ ] **Step 2: Insert the new CSS block**

Append the following block immediately after the `.sidebar-head { ... }` rule (and before `/* ============== CONTENT ============== */`):

```css
/* ============== CHAPTER ADDENDA (sidebar nesting) ============== */
.ch-row {
  display: flex;
  align-items: stretch;
  gap: 2px;
}
.ch-row > .ch-item {
  flex: 1;
  min-width: 0;
}
.ch-toggle {
  background: transparent;
  border: none;
  color: var(--text-faint);
  cursor: pointer;
  width: 22px;
  font-size: 11px;
  line-height: 1;
  padding: 0;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: color .12s, background .12s;
  flex-shrink: 0;
}
.ch-toggle:hover {
  color: var(--accent);
  background: var(--bg-soft);
}
.ch-children {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin: 2px 0 4px 18px;
  padding-left: 8px;
  border-left: 1px solid var(--border);
}
.ch-children[hidden] {
  display: none;
}
.ch-item.addendum {
  font-size: 13px;
  padding: 5px 10px;
  color: var(--text-soft);
}
.ch-item.addendum .ch-num {
  font-size: 11px;
  width: 12px;
  color: var(--text-faint);
}
.ch-item.has-active-child:not(.active) {
  background: var(--bg-soft);
  color: var(--text);
}

/* Addendum banner at the top of an addendum page */
.md .addendum-banner {
  background: var(--accent-soft);
  border: 1px solid var(--accent);
  border-left-width: 3px;
  border-radius: 6px;
  padding: 10px 14px;
  font-size: 13px;
  color: var(--text-soft);
  margin: 0 0 1.4em;
}
.md .addendum-banner em {
  color: var(--text);
  font-style: normal;
  font-weight: 600;
}
.md .addendum-banner a {
  color: var(--accent);
  text-decoration: none;
  border-bottom: 1px dotted var(--accent);
  margin-left: 8px;
  white-space: nowrap;
}
.md .addendum-banner a:hover {
  border-bottom-style: solid;
}
```

- [ ] **Step 3: Verify the new rules are present**

Run: `grep -c "ch-toggle\|addendum-banner\|ch-children\|ch-item.addendum\|has-active-child" templates/web/css/style.css`
Expected: a number ≥ 8 (multiple matches across the lines).

- [ ] **Step 4: Verify CSS file is still readable (no obvious truncation)**

Run: `wc -l templates/web/css/style.css`
Expected: line count grew by ~70 lines compared to pre-edit (pre-edit was 761 lines, expect ~830-835).

- [ ] **Step 5: Commit**

```bash
git add templates/web/css/style.css
git commit -m "Add CSS rules for sidebar addenda nesting and banner"
```

---

## Task 2: Extend chapters.js to flatten addenda

**Files:**
- Modify: `templates/web/js/chapters.js` (lines 1-34 — the CHAPTERS comment + ALL_DOCS construction)

- [ ] **Step 1: Note the current ALL_DOCS construction**

Run: `sed -n '30,35p' templates/web/js/chapters.js`
Expected: shows
```
// 所有文档（章节 + tour），用于路由查找和搜索
export const ALL_DOCS = [...CHAPTERS, ...TOURS];
export const CHAPTER_BY_ID = Object.fromEntries(ALL_DOCS.map(c => [c.id, c]));
```

- [ ] **Step 2: Update the CHAPTERS example comment to show the optional `addenda` field**

In `templates/web/js/chapters.js`, replace the existing CHAPTERS example (lines 9-21) with:

```js
export const CHAPTERS = [
  // Example structure — replace with your real chapters
  { id: '01-architecture-overview',  num: '01', title: '架构总览',
    desc: '一句话概括本章在讲什么',
    layers: [1, 2, 3, 4] },
  { id: '02-...',                    num: '02', title: '...',
    desc: '...',
    layers: [] },
  // ... add 10-15 entries
  // 可选 addenda 字段（由 Q&A flow 自动维护，手工不需要写）:
  // { id: '03-scheduler', num: '03', title: 'Scheduler', desc: '...', layers: [2],
  //   addenda: [
  //     { id: '03a-fork-join-strategy', title: 'Fork-join 调度策略',
  //       question: '当请求被拆成多片并行调度时,合并阶段怎么处理?' },
  //   ]
  // },
  { id: '12-glossary-and-faq',       num: '12', title: '术语表与 FAQ',
    desc: '术语、FAQ、环境变量、命令速查',
    layers: [] },
];
```

(Use the Edit tool to replace the existing `export const CHAPTERS = [ ... ];` block exactly.)

- [ ] **Step 3: Update the ALL_DOCS / CHAPTER_BY_ID construction**

Replace the existing lines (around 32-34):

```js
// 所有文档（章节 + tour），用于路由查找和搜索
export const ALL_DOCS = [...CHAPTERS, ...TOURS];
export const CHAPTER_BY_ID = Object.fromEntries(ALL_DOCS.map(c => [c.id, c]));
```

with:

```js
// 所有文档（章节 + addenda + tour），用于路由查找和搜索。
// addenda 被平铺进 ALL_DOCS，每个 addendum 项额外带 parentId，便于内容渲染时回链。
const FLATTENED_CHAPTERS = CHAPTERS.flatMap(c => {
  const entries = [c];
  if (Array.isArray(c.addenda)) {
    for (const a of c.addenda) {
      entries.push({ ...a, parentId: c.id, num: c.num });
    }
  }
  return entries;
});
export const ALL_DOCS = [...FLATTENED_CHAPTERS, ...TOURS];
export const CHAPTER_BY_ID = Object.fromEntries(ALL_DOCS.map(c => [c.id, c]));
```

- [ ] **Step 4: Syntax check**

Run: `node --check templates/web/js/chapters.js`
Expected: no output (success). If error: open the file at the reported line and fix the syntax.

- [ ] **Step 5: Verify the flattening is correct via a quick Node REPL test**

Run:
```bash
node --input-type=module -e "
const m = await import('./templates/web/js/chapters.js');
console.log('CHAPTERS entries:', m.CHAPTERS.length);
console.log('ALL_DOCS entries:', m.ALL_DOCS.length);
console.log('CHAPTER_BY_ID has 01-architecture-overview:',
  '01-architecture-overview' in m.CHAPTER_BY_ID);
"
```

Note: this will fail because the file imports browser-only `location`. Skip this step if it errors — Step 4 already verifies syntax, and the flattening logic is straightforward.

If you want a deeper test, save a temporary `_test_chapters.mjs` that mocks `location` and re-exports CHAPTERS / ALL_DOCS — but this is optional, not required.

- [ ] **Step 6: Commit**

```bash
git add templates/web/js/chapters.js
git commit -m "Flatten optional addenda into ALL_DOCS with parentId"
```

---

## Task 3: Update sidebar.js for nested addenda rendering

**Files:**
- Modify: `templates/web/js/sidebar.js` (the entire `renderChapterList` function + add helpers)

- [ ] **Step 1: Read current sidebar.js**

Run: `cat templates/web/js/sidebar.js`
Expected: see the existing 84-line file. Identify the `renderChapterList` function (lines 4-28).

- [ ] **Step 2: Replace the imports and renderChapterList function**

Replace the top of `templates/web/js/sidebar.js` (lines 1-28) with:

```js
import { CHAPTERS, TOURS, CHAPTER_BY_ID, STORAGE_PREFIX } from './chapters.js';
import { throttle } from './utils.js';

const EXPANDED_KEY = `${STORAGE_PREFIX}-sidebar-expanded`;

function loadExpanded() {
  try {
    const raw = localStorage.getItem(EXPANDED_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function saveExpanded(set) {
  try {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify([...set]));
  } catch {}
}

function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export function renderChapterList(currentChapterId) {
  const list = document.getElementById('chapter-list');
  let html = '';

  // 当前激活项的 parentId（若激活的是 addendum）
  const activeChap = currentChapterId ? CHAPTER_BY_ID[currentChapterId] : null;
  const activeParentId = activeChap && activeChap.parentId ? activeChap.parentId : null;

  const expanded = loadExpanded();
  if (activeParentId) expanded.add(activeParentId);

  // 首页
  html += `<a class="ch-item ${!currentChapterId ? 'active' : ''}" href="#/" style="margin-bottom:6px"><span class="ch-num">★</span>首页</a>`;

  // Tour 段
  if (TOURS && TOURS.length) {
    html += `<div class="sidebar-head">单请求 Trace 导览</div>`;
    for (const t of TOURS) {
      const active = t.id === currentChapterId ? 'active' : '';
      html += `<a class="ch-item ${active}" href="#/${t.id}"><span class="ch-num">${t.num}</span>${t.title}</a>`;
    }
  }

  // 参考章节段（支持 addenda 嵌套）
  html += `<div class="sidebar-head" style="margin-top:14px">参考手册（${CHAPTERS.length} 章）</div>`;
  for (const c of CHAPTERS) {
    const hasAddenda = Array.isArray(c.addenda) && c.addenda.length > 0;
    const isActive = c.id === currentChapterId;
    const hasActiveChild = activeParentId === c.id;
    const isExpanded = hasAddenda && expanded.has(c.id);

    const classes = ['ch-item'];
    if (isActive) classes.push('active');
    if (hasActiveChild) classes.push('has-active-child');

    if (hasAddenda) {
      html += `<div class="ch-row">`;
      html += `<a class="${classes.join(' ')}" href="#/${c.id}"><span class="ch-num">${c.num}</span>${c.title}</a>`;
      html += `<button class="ch-toggle" type="button" data-toggle="${escapeAttr(c.id)}" aria-label="展开/收起">${isExpanded ? '▾' : '▸'}</button>`;
      html += `</div>`;
      html += `<div class="ch-children" data-children-of="${escapeAttr(c.id)}"${isExpanded ? '' : ' hidden'}>`;
      for (const a of c.addenda) {
        const aActive = a.id === currentChapterId ? 'active' : '';
        html += `<a class="ch-item addendum ${aActive}" href="#/${a.id}"><span class="ch-num">·</span>${a.title}</a>`;
      }
      html += `</div>`;
    } else {
      html += `<a class="${classes.join(' ')}" href="#/${c.id}"><span class="ch-num">${c.num}</span>${c.title}</a>`;
    }
  }

  list.innerHTML = html;

  // 绑定折叠/展开
  list.querySelectorAll('.ch-toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = btn.dataset.toggle;
      const children = list.querySelector(`.ch-children[data-children-of="${CSS.escape(id)}"]`);
      if (!children) return;
      const set = loadExpanded();
      if (set.has(id)) {
        set.delete(id);
        children.hidden = true;
        btn.textContent = '▸';
      } else {
        set.add(id);
        children.hidden = false;
        btn.textContent = '▾';
      }
      saveExpanded(set);
    });
  });
}
```

(Use the Edit tool. The replacement spans from line 1 through line 28 of the original file.)

- [ ] **Step 3: Syntax check**

Run: `node --check templates/web/js/sidebar.js`
Expected: no output.

- [ ] **Step 4: Verify expected new symbols are present**

Run: `grep -F "ch-toggle\|ch-children\|has-active-child\|EXPANDED_KEY\|loadExpanded\|saveExpanded\|addendum" templates/web/js/sidebar.js`
Expected: multiple lines match.

(Use a real grep without backslash escapes if your shell doesn't handle the alternation in the inline form; or run `grep -E "ch-toggle|ch-children|has-active-child|loadExpanded|saveExpanded|addendum" templates/web/js/sidebar.js`.)

- [ ] **Step 5: Verify existing functions still present (no accidental deletion)**

Run: `grep -n "^export function \|^function " templates/web/js/sidebar.js`
Expected: shows `renderChapterList`, `renderPageToc`, `bindScrollSpy`, `loadExpanded`, `saveExpanded`, `escapeAttr`, `escapeText`.

- [ ] **Step 6: Commit**

```bash
git add templates/web/js/sidebar.js
git commit -m "Render nested addenda with collapsible toggle in sidebar"
```

---

## Task 4: Update content.js to render addendum banner

**Files:**
- Modify: `templates/web/js/content.js` (the `loadChapter` function, around lines 56-97)

- [ ] **Step 1: Locate `loadChapter`**

Run: `grep -n "export async function loadChapter" templates/web/js/content.js`
Expected: shows `export async function loadChapter(chapterId, anchor, contentEl) {` at line 56.

- [ ] **Step 2: Insert banner rendering**

The current rendering pipeline is:
```js
  usedIds.clear();
  const html = marked.parse(md);
  contentEl.innerHTML = `<div class="md">${html}</div>`;
```

Replace these three lines (around lines 74-76) with:

```js
  usedIds.clear();
  const html = marked.parse(md);
  const bannerHtml = (chap.parentId)
    ? makeAddendumBanner(chap)
    : '';
  contentEl.innerHTML = `<div class="md">${bannerHtml}${html}</div>`;
```

- [ ] **Step 3: Add the `makeAddendumBanner` helper at the bottom of the file**

Append this function at the very end of `templates/web/js/content.js` (after `extractToc`):

```js
// =========================================================
// Addendum banner: shown at the top of an addendum page
// =========================================================

function makeAddendumBanner(chap) {
  const parent = CHAPTER_BY_ID[chap.parentId];
  if (!parent) return '';
  const q = chap.question ? `<em>${escapeHTML(chap.question)}</em>` : '';
  const link = `<a href="#/${parent.id}">↑ 回到 ${escapeHTML(parent.title)}</a>`;
  return `<div class="addendum-banner">${q ? `本节回答:${q} · ` : ''}${link}</div>`;
}
```

- [ ] **Step 4: Syntax check**

Run: `node --check templates/web/js/content.js`
Expected: no output.

- [ ] **Step 5: Verify the helper and call site are present**

Run:
```bash
grep -n "makeAddendumBanner\|bannerHtml\|addendum-banner" templates/web/js/content.js
```
Expected: at least 4 lines match (function definition, call, declaration of bannerHtml, banner CSS class string).

- [ ] **Step 6: Commit**

```bash
git add templates/web/js/content.js
git commit -m "Render addendum banner at top of addendum pages"
```

---

## Task 5: Browser smoke test for viewer changes

**Files:** (none — manual verification)

This task verifies Tasks 1-4 by hand against a real, existing wiki. Reuse the user's local mono-repo if one exists (e.g. `~/git/codebase-wikis/` or similar). If no local mono-repo is available, **skip** this task with a note in the final summary; the end-to-end Task 9 will still cover it.

- [ ] **Step 1: Locate a wiki to test against**

Run: `ls ~/git 2>/dev/null | grep -i wiki`
Or ask: "Do you have a local copy of a generated wiki I can sync the updated templates into for a visual smoke test?"

If yes, note its path as `$WIKI` (e.g. `/Users/you/git/codebase-wikis/vllm/v0.22.0/`).

If no, mark this task as skipped and continue to Task 6.

- [ ] **Step 2: Sync the updated viewer files into the test wiki**

Copy CSS + sidebar.js + content.js (the project-agnostic files). **Do NOT** copy `chapters.js` — that file holds project-specific data; instead, patch the wiki's existing one in step 3.

```bash
cp templates/web/css/style.css "$WIKI/web/css/style.css"
cp templates/web/js/sidebar.js "$WIKI/web/js/sidebar.js"
cp templates/web/js/content.js "$WIKI/web/js/content.js"
```

- [ ] **Step 3: Patch the test wiki's chapters.js — both the ALL_DOCS construction AND a mock addendum**

The wiki's existing `chapters.js` was generated before Task 2's change, so its `ALL_DOCS` is the old flat `[...CHAPTERS, ...TOURS]`. The new viewer code expects flattened addenda. Two edits in `$WIKI/web/js/chapters.js`:

(a) Add `addenda` to one CHAPTERS entry. Find an entry (e.g. one with `id: '03-...'`) and add:

```js
{ id: '03-...', num: '03', title: '...', desc: '...', layers: [...],
  addenda: [
    { id: '03a-test-addendum', title: '测试 addendum 标题',
      question: '这是一个测试问题:某个细节是怎么工作的?' },
  ]
},
```

(b) Replace the existing `ALL_DOCS` / `CHAPTER_BY_ID` lines with the new FLATTENED_CHAPTERS construction (the same block you wrote in Task 2 step 3). Find:

```js
export const ALL_DOCS = [...CHAPTERS, ...TOURS];
export const CHAPTER_BY_ID = Object.fromEntries(ALL_DOCS.map(c => [c.id, c]));
```

and replace with the same 12-line block from Task 2 step 3.

```js
{ id: '03-...', num: '03', title: '...', desc: '...', layers: [...],
  addenda: [
    { id: '03a-test-addendum', title: '测试 addendum 标题',
      question: '这是一个测试问题:某个细节是怎么工作的?' },
  ]
},
```

Also: update the same wiki's `chapters.js` lines for `ALL_DOCS` / `CHAPTER_BY_ID` to match Task 2's replacement (flattening logic). If the wiki's `chapters.js` was generated before Task 2, it still has the old flat construction.

- [ ] **Step 4: Create the mock addendum markdown file**

Create `$WIKI/03a-test-addendum.md` with:

```markdown
## 这是一个测试 addendum

用来人工验证 viewer 的二级嵌套与 banner 行为。

正文随便几行就行。<code>some-file.py:42</code> 会被 file:line 增强渲染。

末尾不应有"延伸阅读"段——那是 parent 章节的责任。
```

- [ ] **Step 5: Start local server**

```bash
cd "$WIKI" && python3 -m http.server 8765 &
```

Note the PID printed; you'll kill it at the end.

- [ ] **Step 6: Visual checks in browser**

Open `http://localhost:8765/` in a browser. Verify:

1. Sidebar: chapter `03-...` shows a `▸` chevron next to its name (because it has addenda).
2. Click the chevron → it flips to `▾` and the addendum row `· 测试 addendum 标题` appears indented below.
3. Click the addendum row → the page navigates to `#/03a-test-addendum`, the markdown loads.
4. Top of the addendum page shows the banner: `本节回答:这是一个测试问题... · ↑ 回到 <parent title>`.
5. Sidebar shows the parent chapter as `.has-active-child` (subtle background) and the addendum row as `.active`.
6. Click `↑ 回到 ...` in the banner → navigates back to the parent.
7. Press `j` while on the parent chapter → next page goes to the addendum (because flattening puts addendum right after parent in ALL_DOCS).
8. Press `j` again → goes to the next chapter.
9. Reload the page after expanding chapter 03 — confirm it stays expanded (localStorage persistence).
10. Type the addendum title in the search box → it appears in search results.

If any check fails, debug the corresponding task. Common pitfalls:
- Banner doesn't appear → check `chap.parentId` is being read from CHAPTER_BY_ID
- Toggle doesn't work → check the click handler is attached (DOM order matters; `list.innerHTML = html` must happen before `querySelectorAll`)
- Sidebar shows duplicate entries → ALL_DOCS flattening might be doubled

- [ ] **Step 7: Tear down server and restore the test wiki**

```bash
kill %1   # or kill the python3 -m http.server PID
git -C "$WIKI" checkout web/js/chapters.js
rm -f "$WIKI/03a-test-addendum.md"
```

(The wiki repo's git state should now be clean except for the CSS/JS file copies, which are intentional — those are template-level changes that benefit all versions.)

- [ ] **Step 8: No commit needed for this task**

The smoke-test changes were applied to a different repo (the wiki, not the skill); we didn't modify the skill repo. Continue to Task 6.

---

## Task 6: Write templates/addendum-prompt.md

**Files:**
- Create: `templates/addendum-prompt.md`

- [ ] **Step 1: Verify the existing `chapter-prompt.md` template is present (for style reference)**

Run: `wc -l templates/chapter-prompt.md`
Expected: 70 lines. You're matching this template's structure (Template → Use guidance → Best practices → Verification).

- [ ] **Step 2: Write the new file**

Create `templates/addendum-prompt.md` with this exact content:

````markdown
# Addendum generation agent prompt template

Use this template when dispatching an agent (general-purpose subagent_type) to generate one **addendum** — a deep-dive on a single question that hangs under an existing reference chapter. Same quality bar as a reference chapter (see `chapter-prompt.md`), but scoped to one specific question.

## Template

```
你正在为已生成的 {{PROJECT_NAME}} 参考 wiki 补充一个 addendum,回答用户提出的一个具体问题。

【关于项目】{{PROJECT_NAME}}, GitHub 仓库 {{PROJECT_GITHUB_REPO}}。

【代码版本锁定】{{PROJECT_GITHUB_REPO}}@{{ANALYZED_COMMIT}}。所有 file:line 引用必须基于这个 commit。

【源码位置】源码已 clone 在本地 {{SRC_REPO_PATH}}。**严禁** `cd` 或 `git checkout`。读源码统一用:
    git -C {{SRC_REPO_PATH}} show {{ANALYZED_COMMIT}}:<相对路径>

【挂靠章节】本 addendum 挂在 `{{PARENT_CHAPTER_ID}}.md` 之下,parent 章节的完整内容如下:

----- BEGIN PARENT CHAPTER -----
{{PARENT_CHAPTER_MD}}
----- END PARENT CHAPTER -----

【硬性要求】
- {{LANGUAGE}},GitHub flavored markdown,禁用 emoji
- 大量使用 `file:line` 引用(如 `path/to/file.py:123`),便于读者跳转;每个 file:line 必须在 {{ANALYZED_COMMIT}} 下可验证
- 嵌入简短代码片段(5-30 行),>30 行必须截断 + 用 `# ...` 表示省略
- 必要时按 problem-first 叙事:问题 → 朴素思路 → 为何崩 → 实际设计;单纯的 "how does X work" 类问题可以直接说明,不强加 problem-first
- **禁止重复 parent 章节已讲透的内容**(parent 内容见上方),只补 parent 没覆盖的细节或动机
- 写成完整终态文档:禁止 "我研究了..."、"接下来我会..." 等过程性叙述
- 既解释 "代码做了什么",更重要解释 "为什么这样设计"
- 篇幅:约 200-500 行 markdown(不含代码块行数)
- **顶部不写 H1 标题**(viewer 自己渲染 banner),从 H2 开始组织内容
- **末尾不要写 `## 延伸阅读` 段**——那是 parent 章节的事,本 addendum 不应反向引用

【输出路径】{{OUTPUT_PATH}}

【要回答的问题】
{{QUESTION}}

完成后简短报告:文件路径 + 主要小节列表 + 引用的 file:line 数量,<150 字。
```

## Use guidance

Required placeholders:

- **{{PROJECT_NAME}}**: from target wiki's `chapters.js` (`PROJECT_NAME`).
- **{{PROJECT_GITHUB_REPO}}**: from target wiki's `chapters.js` (`PROJECT_GITHUB_REPO`).
- **{{ANALYZED_COMMIT}}**: from target wiki's `chapters.js` (`ANALYZED_COMMIT`).
- **{{SRC_REPO_PATH}}**: absolute path on disk to the source code repo (user-supplied in Phase 0).
- **{{PARENT_CHAPTER_ID}}**: e.g. `03-scheduler`. Selected by Phase 1 auto-classification.
- **{{PARENT_CHAPTER_MD}}**: the full markdown of the parent chapter, read from `<target>/<PARENT_CHAPTER_ID>.md`.
- **{{LANGUAGE}}**: same as the wiki (Chinese / English / bilingual); detect from the parent chapter or fall back to "简体中文".
- **{{OUTPUT_PATH}}**: `<target>/<NN><letter>-<slug>.md` (see `reference/qa-addenda-flow.md` for naming).
- **{{QUESTION}}**: the raw user question text.

## Best practices

1. **One agent per question** — addenda are narrow by design; don't batch unrelated questions.
2. **Include the full parent chapter** — the "no repetition" rule needs the parent visible.
3. **Forbid `cd` and `checkout`** — explicit ban prevents the agent from corrupting the user's working tree.
4. **Specify length** — without it agents produce either 80-line stubs or 1200-line bloat.
5. **No H1, no 延伸阅读 footer** — these are owned by the viewer / parent chapter respectively.

## Verification after agent return

- File exists at `{{OUTPUT_PATH}}`; line count is in [200, 500] (excluding code block contents).
- At least 5 `file:line` refs present; spot-check 2-3 lines exist at `{{ANALYZED_COMMIT}}` via `git -C {{SRC_REPO_PATH}} show {{ANALYZED_COMMIT}}:<path>`.
- First non-blank line starts with `##` (no H1).
- File does **not** contain `## 延伸阅读` or `## Addenda` section.
- File does **not** start with process narration like `我研究了` / `我打开了`.

If any check fails:
- File too short / no refs → re-dispatch with stricter prompt (cite specific files to start from).
- Contains H1 or footer → either trim manually or re-dispatch with the constraint restated more loudly.
- Process narration → re-dispatch with `禁止"我研究了"、"我打开了"等过程性叙述` doubled.
````

- [ ] **Step 3: Verify file is well-formed markdown**

Run: `wc -l templates/addendum-prompt.md`
Expected: roughly 80 lines.

Run: `grep -c "^##" templates/addendum-prompt.md`
Expected: 4 H2 sections (Template, Use guidance, Best practices, Verification after agent return).

- [ ] **Step 4: Verify fence balance (markdown code fences must be balanced)**

Run: `grep -c "^\`\`\`" templates/addendum-prompt.md`
Expected: even number (each opening has a matching closing). The file uses 4-backtick fences for the outer "## Template" block to contain triple-backtick literals — check both 3-tick and 4-tick fences:

Run:
```bash
echo "3-tick fences: $(grep -c "^\`\`\`$\|^\`\`\`[a-z]" templates/addendum-prompt.md)"
echo "4-tick fences: $(grep -c "^\`\`\`\`$\|^\`\`\`\`[a-z]" templates/addendum-prompt.md)"
```
Each count must be even.

- [ ] **Step 5: Commit**

```bash
git add templates/addendum-prompt.md
git commit -m "Add agent prompt template for Q&A addendum generation"
```

---

## Task 7: Write reference/qa-addenda-flow.md

**Files:**
- Create: `reference/qa-addenda-flow.md`

- [ ] **Step 1: Verify the spec is available to reference**

Run: `wc -l docs/specs/2026-05-20-codebase-wiki-qa-addenda-design.md`
Expected: ~330 lines. This file describes the full flow; the reference doc condenses it.

- [ ] **Step 2: Write the new file**

Create `reference/qa-addenda-flow.md` with this exact content:

````markdown
# Q&A addenda flow: add focused deep-dives to an existing wiki

This flow lets a user ask a batch of questions about an already-generated
wiki and have the answers land as new markdown files attached to the
right chapters. It runs entirely against an existing
`<mono-repo>/<project>/<version>/` directory and the source code at the
wiki's locked `ANALYZED_COMMIT`. The flow is the fourth skill entry mode,
peer to new-monorepo / new-project / append-version / import.

For the design rationale and full spec see
`docs/specs/2026-05-20-codebase-wiki-qa-addenda-design.md`.

## Interaction model

Only two points need user input:

1. **Phase 0** — the user supplies the target wiki path, the source-code
   repo path, and a batch of questions.
2. **Phase 4** — the user confirms `git push` (or declines).

Everything between (chapter assignment, agent dispatch, content
generation, parent-chapter wiring, `chapters.js` update, local
`git commit`) is automatic. This matches the project's low-friction
philosophy (see memory `project_codebase_wiki_low_friction.md` in the
parent project memory).

## The four phases

### Phase 0: locate target wiki + source code

Ask the user (once, batched):

- **Target wiki path**: absolute `<mono>/<project>/<version>/` (or
  `<mono> + <project> + <version>` and derive). Verify
  `<path>/web/js/chapters.js` exists; reject otherwise.
- **Source repo path**: absolute path to the codebase's local git
  clone.
- **Questions**: paste in the conversation (separator: blank line OR
  `---`, both accepted) OR a path to a `questions.md` file (same
  separator rules).

Auto-extract from the target's `web/js/chapters.js`:

- `PROJECT_NAME` / `PROJECT_GITHUB_REPO` / `ANALYZED_COMMIT` /
  `ANALYZED_TAG` / `CHAPTERS`.

Reject if:

- Path doesn't exist or `chapters.js` missing.
- Wiki is not inside a mono-repo (no ancestor `projects.json`).
- `chapters.js` still contains `{{PROJECT_NAME}}`-style placeholders.
- `git -C <src> rev-parse <ANALYZED_COMMIT>` non-zero. **Do not auto
  `git fetch`** — tell the user to fetch manually and re-run.

Read source files via `git -C <src> show <ANALYZED_COMMIT>:<path>`. Do
not `cd` into the source repo and do not `git checkout`.

### Phase 1: auto-classify each question

In the main conversation (no agent dispatch; lightweight):

- Build context = each chapter's `{id, title, desc}` from `CHAPTERS`,
  **excluding** any chapter whose `id` matches `/glossary/i` (the
  glossary is structured data, not a free-form chapter).
- Ask the LLM to output a mapping `question_index → chapter_id` for the
  whole batch in one shot (one LLM call, all questions).
- If the LLM can't match a question to any chapter, fall back to
  `01-architecture-overview` and prepend a note to that addendum:
  `_本问题未匹配到具体章节,挂在架构总览之下_`.

Print the resulting assignment table for visibility — **do not** ask the
user to confirm. Move on.

### Phase 2: dispatch addendum generation agents

Use the dispatching-parallel-agents skill (one batch, 5-6 agents in
parallel). For each `(question, parent_chapter_id)` pair:

- Output path: `<target>/<NN><letter>-<slug>.md`. See "File naming"
  below.
- Prompt: from `templates/addendum-prompt.md` (fill all placeholders).
- Inputs include the full parent chapter markdown so the agent can
  avoid duplication.

Quality bar matches `chapter-prompt.md`:

- 200-500 lines (excluding code block contents).
- `file:line` refs verifiable at `ANALYZED_COMMIT`.
- 5-30 line code excerpts.
- Problem-first when applicable; not forced for simple "how X works".
- No H1 at top (viewer renders the banner).
- No `## 延伸阅读` footer (that's the parent chapter's job).

### Phase 3: wire up

Done in the main conversation (not agents) so the three changes stay
consistent.

1. **Parent chapter markdown**: append a `## 延伸阅读 / Addenda`
   section if absent; under it append `- [<addendum title>](./<output basename>) —— <truncated question>`. Idempotent: use the link target
   as dedup key.
2. **`<target>/web/js/chapters.js`**: locate the parent chapter object
   in the `CHAPTERS` array; push `{id, title, question}` into its
   `addenda` array (create the array if absent). Idempotent: use `id`
   as dedup key. Preserve all surrounding code untouched.
3. **No viewer code changes**. The template-level `sidebar.js` /
   `content.js` / `style.css` already render `addenda` and the banner;
   wikis without `addenda` degrade to the original flat sidebar.

### Phase 4: commit + push

1. From the mono-repo root, run:
   ```bash
   git add -A && git commit -m "Add N addenda for <project>/<version>"
   ```
2. Print the assignment table, the new file list, the new commit SHA.
3. Ask the user: "Push to origin?" — this is the only blocking
   confirmation. If yes: `git push`. If no: stop with a "left local"
   note.

## File naming

`<NN><letter>-<slug>.md`:

- `<NN>` = parent chapter's `num` (the existing two-digit prefix on its
  `id` and filename).
- `<letter>` = `a` then `b` then `c`, …; scan the target directory for
  existing `<NN>[a-z]-*.md` files and pick `max-letter + 1`.
- `<slug>` = a kebab-case summary of the question, 15-40 chars.
  Generated by the skill (LLM call same as Phase 1, or simple
  truncation of the question's salient nouns).

Example: question "fork-join 调度怎么合并?" attached to chapter
`03-scheduler` (num `03`) when no `03[a-z]-*.md` files exist yet →
output `03a-fork-join-merge.md`.

If 26 addenda already exist for one chapter, error out and tell the
user to either merge some addenda back into the parent or split the
parent. Reaching `z` is not expected in practice.

## Idempotency and re-runs

The flow is safe to re-run with the same inputs:

- File name conflict: a re-run picks the next letter, never overwrites.
- Parent's `## 延伸阅读`: dedup by link target — same link won't be
  appended twice.
- `chapters.js` `addenda` array: dedup by addendum `id`.
- `.qa-failed.log` (if any) records questions whose agents failed.
  This file is in `.gitignore` (add the rule on first failure).

## Error handling

| Situation | Detection | Behavior |
|-----------|-----------|----------|
| target path missing `web/js/chapters.js` | stat | bail with "not a wiki dir" |
| not in mono-repo | no ancestor `projects.json` | bail with "Q&A serves mono-repo wikis only" |
| `chapters.js` has unfilled placeholders | regex `\{\{[A-Z_]+\}\}` | bail with "wiki not finalized" |
| commit unreachable in source | `git rev-parse` non-zero | bail with "run `git fetch` and retry" |
| LLM can't match question to chapter | classification fallback | mount under `01-...`, prepend note |
| Agent produces no file | post-dispatch check | skip from commit, log to `.qa-failed.log` |
| Agent produces < 50 lines or 0 refs | post-dispatch check | same — skip + log |
| `git commit` fails (pre-commit hook) | non-zero exit | leave working tree alone, surface error to user |

## What this flow does NOT do

- Delete or rename addenda (manual edit of file + `chapters.js`).
- Attach a single addendum to multiple parents (each addendum has one
  parent only).
- Modify already-existing addenda based on a re-ask (just generates a
  new one with the next letter).
- Auto-push to remote (push always requires user confirmation).
- Attach addenda to tour steps or to the glossary chapter (reference
  chapters only, glossary excluded).
- Auto `git fetch` in the source repo (the user controls when remote
  state changes).
````

- [ ] **Step 3: Verify file structure**

Run:
```bash
wc -l reference/qa-addenda-flow.md
grep -c "^##" reference/qa-addenda-flow.md
```
Expected: ~150 lines, with 7-8 H2 headings.

- [ ] **Step 4: Verify fence balance**

Run: `grep -c "^\`\`\`" reference/qa-addenda-flow.md`
Expected: even number.

- [ ] **Step 5: Commit**

```bash
git add reference/qa-addenda-flow.md
git commit -m "Add reference doc for Q&A addenda flow"
```

---

## Task 8: Update SKILL.md to introduce the Q&A flow

**Files:**
- Modify: `SKILL.md` (insert a new section after the import section; add to reference list at end)

- [ ] **Step 1: Locate the insertion point — between import section and "Important behaviors"**

Run: `grep -n "^## " SKILL.md`
Expected: among the matches are `## Importing existing standalone wiki repos` and `## Important behaviors`. Note the line number of `## Important behaviors`.

- [ ] **Step 2: Insert the new section before `## Important behaviors`**

Use the Edit tool. Find this exact text in `SKILL.md`:

```
---

## Important behaviors
```

Replace it with:

```
---

## Q&A addenda flow

To add focused deep-dives to an already-generated wiki (mono-repo only),
run the **Q&A addenda flow** — a fourth entry mode peer to
new-monorepo / new-project / append-version / import. Between user
input and the final `git push` decision the flow is fully autonomous.

For each Q&A run:

1. **Phase 0 — locate target + source**: ask for the target wiki path
   `<mono>/<project>/<version>/`, the source-code repo path, and a
   batch of questions (paste or `questions.md`). Read the target's
   `web/js/chapters.js` to extract `PROJECT_GITHUB_REPO` and
   `ANALYZED_COMMIT`. Verify the commit is reachable via
   `git -C <src> rev-parse <ANALYZED_COMMIT>` — **do not** auto-fetch.
   Read source files via `git -C <src> show <ANALYZED_COMMIT>:<path>`
   (no `cd`, no `checkout`).

2. **Phase 1 — auto-classify**: one LLM call maps each question to a
   parent chapter (`CHAPTERS` entries whose `id` does not match
   `/glossary/i`). Unmatched questions fall back to
   `01-architecture-overview` with a prepended note. Print the
   assignment table; do **not** confirm with the user.

3. **Phase 2 — dispatch agents**: one agent per question, 5-6 in
   parallel via the dispatching-parallel-agents skill, prompted from
   `templates/addendum-prompt.md`. Output path
   `<target>/<NN><letter>-<slug>.md`. Same quality bar as
   `templates/chapter-prompt.md` — verifiable `file:line` refs, 200-500
   lines, no H1, no `## 延伸阅读` footer.

4. **Phase 3 — wire up**: append `- [...](./...)` to parent chapter's
   `## 延伸阅读 / Addenda` section (idempotent by link target); push
   `{id, title, question}` into the parent chapter's `addenda` array in
   `web/js/chapters.js` (idempotent by id). No viewer code changes —
   the templates already support `addenda`.

5. **Phase 4 — commit + push**: from the mono-repo root,
   `git add -A && git commit -m "Add N addenda for <project>/<version>"`.
   Ask the user before `git push` — the only blocking confirmation.

The web viewer code in `templates/web/` already supports the `addenda`
field: `sidebar.js` renders nested toggles, `content.js` renders an
addendum banner at the top of each addendum page, and `chapters.js`
flattens addenda into `ALL_DOCS` so routing / search / `j-k` navigation
pick them up. Existing wikis with no `addenda` field degrade to the
original flat sidebar — no migration needed.

See `reference/qa-addenda-flow.md` for the full flow, file-naming rule,
idempotency contract, and error handling matrix.

---

## Important behaviors
```

- [ ] **Step 3: Add `reference/qa-addenda-flow.md` to the reference list at the bottom**

Find the existing reference list at the end of `SKILL.md`:

```
## Reference files

- `reference/8-section-template.md` — the problem-first tour step structure
- `reference/trace-tour-design.md` — how to pick a trace target + step list
- `reference/chapter-planning.md` — how to cut any codebase into ~12 chapters
- `reference/workflow.md` — complete step-by-step
- `reference/monorepo.md` — three-level mono-repo layout, run modes, import flow
- `reference/versioning.md` — the version layer: naming rule, versions.json, version selector
- `templates/svg-style-guide.md` — colors, conventions, naming for figures
- `templates/chapter-prompt.md` — agent prompt for reference chapter generation
- `templates/tour-step-prompt.md` — agent prompt for tour step generation
- `examples/vllm-wiki.md` — pointer to the reference implementation at github.com/xgliu515/vllm-wiki
```

Insert two new lines (one for the flow doc, one for the prompt template), preserving the alphabetical-ish ordering:

```
- `reference/8-section-template.md` — the problem-first tour step structure
- `reference/trace-tour-design.md` — how to pick a trace target + step list
- `reference/chapter-planning.md` — how to cut any codebase into ~12 chapters
- `reference/workflow.md` — complete step-by-step
- `reference/monorepo.md` — three-level mono-repo layout, run modes, import flow
- `reference/versioning.md` — the version layer: naming rule, versions.json, version selector
- `reference/qa-addenda-flow.md` — Q&A addenda flow: phases, file naming, idempotency, errors
- `templates/svg-style-guide.md` — colors, conventions, naming for figures
- `templates/chapter-prompt.md` — agent prompt for reference chapter generation
- `templates/tour-step-prompt.md` — agent prompt for tour step generation
- `templates/addendum-prompt.md` — agent prompt for single-addendum generation
- `examples/vllm-wiki.md` — pointer to the reference implementation at github.com/xgliu515/vllm-wiki
```

- [ ] **Step 4: Verify the new content is present and well-formed**

Run:
```bash
grep -c "^## " SKILL.md
grep -F "Q&A addenda flow" SKILL.md
grep -F "qa-addenda-flow.md" SKILL.md
grep -F "addendum-prompt.md" SKILL.md
```
Expected: the H2 count grew by 1 (was 8, now 9); all three filenames appear at least twice (in body + in reference list).

- [ ] **Step 5: Verify SKILL.md is still well-formed markdown**

Run: `wc -l SKILL.md`
Expected: line count grew by ~55 lines compared to before (Task 8 inserts ~55 lines net).

Run: `grep -c "^\`\`\`" SKILL.md`
Expected: even number.

- [ ] **Step 6: Commit**

```bash
git add SKILL.md
git commit -m "Document Q&A addenda flow as the fourth skill entry mode"
```

---

## Task 9: End-to-end verification

**Files:** (none — manual / inspection only)

This task verifies that the seven preceding tasks compose into a usable feature, per spec §10 test plan. It is a checklist, not a sequence of edits.

- [ ] **Step 1: Verify all expected new and modified files exist with the expected commit history**

Run: `git log --oneline main..qa-addenda`
Expected: 7 commits (or 7 + skipped Task 5), in order matching Tasks 1, 2, 3, 4, 6, 7, 8.

Run: `git diff --stat main..qa-addenda`
Expected: 7 files changed:
- New: `templates/addendum-prompt.md`, `reference/qa-addenda-flow.md`
- Modified: `templates/web/css/style.css`, `templates/web/js/chapters.js`, `templates/web/js/sidebar.js`, `templates/web/js/content.js`, `SKILL.md`

- [ ] **Step 2: Cross-check the spec — every requirement in `docs/specs/2026-05-20-codebase-wiki-qa-addenda-design.md` is covered**

Spec section coverage matrix:

| Spec section | Covered by task |
|--------------|----------------|
| §3 Interaction model | Task 7 (qa-addenda-flow.md), Task 8 (SKILL.md) |
| §4 Phase 0 | Task 7, Task 8 |
| §4 Phase 1 | Task 7, Task 8 |
| §4 Phase 2 | Task 6 (prompt), Task 7, Task 8 |
| §4 Phase 3 wire-up | Task 7, Task 8 |
| §4 Phase 4 commit + push | Task 7, Task 8 |
| §5 File naming | Task 7 |
| §5 chapters.js shape | Task 2 |
| §5 ALL_DOCS / CHAPTER_BY_ID | Task 2 |
| §5 parent chapter "延伸阅读" | Task 7 (rules); Task 8 (SKILL.md) |
| §6 addendum-prompt.md | Task 6 |
| §7 viewer changes | Tasks 1, 3, 4 |
| §7 backward compatibility | Task 2 (`Array.isArray(c.addenda)` guard) |
| §8 errors & idempotency | Task 7 |
| §9 file changes list | Tasks 1-8 (1:1 mapping) |
| §10 test plan | Task 5 (smoke), Task 9 (this step) |

Walk through each row; for any "?" or gap, locate the gap and fix it before marking complete.

- [ ] **Step 3: Type/identifier consistency scan**

Verify these symbols match across all files:

```bash
grep -rE "FLATTENED_CHAPTERS|EXPANDED_KEY|loadExpanded|saveExpanded|makeAddendumBanner|addendum-banner|ch-toggle|ch-children|has-active-child" templates/ reference/ SKILL.md
```
Expected: each identifier appears in its definition file AND in the file that uses it (e.g. `EXPANDED_KEY` defined in `sidebar.js`, not referenced elsewhere — OK; `addendum-banner` in CSS + content.js — both should appear; `ch-toggle` in CSS + sidebar.js — both should appear).

- [ ] **Step 4: Run the spec's T1-T5 manually if a local wiki is available**

If you have a local `~/git/codebase-wikis/` (or equivalent) mono-repo with at least one wiki:

- **T1** — run an actual Q&A flow against it with 3 simple questions (e.g. about a small subsystem). This requires the skill itself to be invoked from Claude Code in a separate session; it cannot be done from inside the implementation session. Note as "deferred to user".
- **T2** — already covered by Task 5 if it ran.
- **T3 backward compatibility** — copy the four updated viewer files into an old wiki (one with no `addenda` anywhere) and verify the sidebar renders flat as before.
- **T4 idempotency** — needs T1 to have run twice; deferred.
- **T5 error injection** — covered by spec §8 prose; partial coverage by manual `node --check` from Tasks 2/3/4.

For any T-row that requires running the full skill, list it explicitly as "deferred — user will exercise during the next real Q&A run" in the PR description.

- [ ] **Step 5: Open the PR (or note to user)**

This branch is ready to merge. If the user wants a PR, run:

```bash
git push -u origin qa-addenda
gh pr create --title "Q&A addenda flow for codebase-wiki skill" --body "$(cat <<'EOF'
## Summary
- Adds a fourth skill entry mode: Q&A addenda flow.
- Users feed batched questions into an existing wiki; skill auto-classifies each to a parent chapter and dispatches agents to write addendum files (same quality bar as a reference chapter).
- Web viewer gains nested sidebar with toggle + addendum banner. Backwards-compatible with wikis that have no `addenda` field.

## Spec
docs/specs/2026-05-20-codebase-wiki-qa-addenda-design.md

## Plan
docs/plans/2026-05-20-codebase-wiki-qa-addenda.md

## Test plan
- [x] CSS rules present and well-formed (Task 1)
- [x] chapters.js syntax OK and flattening works (Task 2)
- [x] sidebar.js syntax OK; renderChapterList outputs nested HTML (Task 3)
- [x] content.js syntax OK; banner inserted when parentId present (Task 4)
- [ ] Manual browser smoke (Task 5) — see Task 5 status
- [x] addendum-prompt.md well-formed; fence balance OK (Task 6)
- [x] qa-addenda-flow.md well-formed; covers spec §4-§8 (Task 7)
- [x] SKILL.md cross-references new files (Task 8)
- [ ] T1 end-to-end Q&A run against real wiki — deferred to next session
- [ ] T3 backward compat against an old wiki — deferred

EOF
)"
```

Otherwise, leave the branch local and tell the user how to merge: "Run `git checkout main && git merge qa-addenda` then push."

(No commit in this task — verification only.)

---

## Notes for the implementer

- **Branch hygiene**: every task ends with a commit on `qa-addenda`. If a task fails partway, fix in place rather than amending earlier commits.
- **No automated tests in this repo**: don't search for a test framework or pretend one exists. Verification is the grep / `node --check` / `wc -l` / browser commands shown in each task.
- **JS files are vanilla ES modules**: no build step, no transpilation. `node --check` is the closest thing to a linter that runs without setup.
- **CSS additions are append-only**: don't touch existing rules. The site theming variables (`--accent`, `--bg-soft`, etc.) are already defined — reuse them.
- **SKILL.md and reference docs use double-quoted Chinese punctuation in places**: keep the style consistent with the surrounding text in each file.
- **If a step's grep returns 0 matches when you expect ≥ 1**: read the file you just wrote and check spelling. The grep tells the truth.
- **Task 5 is the only optional task** — if no local wiki, skip with a note. All other tasks are required.
