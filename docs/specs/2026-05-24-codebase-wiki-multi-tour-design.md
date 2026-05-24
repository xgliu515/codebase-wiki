# codebase-wiki Multi-tour 支持设计

**Status**: spec
**Date**: 2026-05-24
**Scope**: 给 codebase-wiki skill 增加 "add an additional trace tour" 能力——同一份 wiki 可包含多条独立的 trace tour(对应不同初始请求,如 single-request / batched / tool-call / streaming),每条 tour 是自包含的 15-20 步 narrative,共享 reference 章节,但拥有独立 overview。skill 通过 Phase 0 检测到 "add-tour" 关键词进入增量模式,一次添加一条。

## Background

现状(2026-05-24):

- 每份 wiki **只有一条** trace tour。文件 pattern `tour-NN-<step-slug>.md`,扁平编号,`tour-00-overview.md` 是入口
- `chapters.js` 的 `TOURS` 是扁平数组,元素 `{id, num, title, desc}`
- `sidebar.js renderChapterList()` 渲染单一 section header `${T.sidebar_tour_head}` 后跟所有 tour 步骤
- `content.js renderHome()` 一段 "Trace 导览(N 步)" 区块 + 一个 card grid
- URL hash `#/<chapterId>[/<anchor>]`,`/` 分隔 chapter 与 anchor
- 用户场景:不同初始请求(chat completion / batched generate / streaming / tool-call round-trip)走的代码路径差异显著,一条 tour 无法覆盖

## Non-Goals

- 不实现"自动 cross-tour diff / step 复用检测"——同一 step 在不同 tour 之间可能重复 ~15%,接受 redundancy
- 不实现"tour-level 权限 / 可见性控制"
- 不动 reference chapter 体系——多 tour 共享 chapters
- 不强制老 wiki 重命名 step 文件(URL 兼容)
- 不为多 tour 单独引入"tour-index 页"——首页本身已经是 tour 列表
- 一次 add-tour 调用只加**一条** tour;要加多条就调多次

## Architecture

### 单一真理源:`TOURS` 数据模型

`templates/web/js/chapters.js` 中 `TOURS` 由扁平数组改为 **array of tour groups**:

```js
export const TOURS = [
  {
    slug: 'single-request',                   // kebab-case, 决定文件前缀 + 全局唯一
    title: 'Single-request trace tour',       // 侧栏 section header + tour overview h1
    target: 'llm.generate(["hi"], max_tokens=3)', // 该 tour 跟的最小请求
    steps: [
      { id: 'tour-single-request-00-overview', num: '00', title: 'Tour overview', desc: '...' },
      { id: 'tour-single-request-01-cli',      num: '01', title: 'CLI parse',     desc: '...' },
      // 15-20 项
    ],
  },
  // 后续 add-tour 调用 append 更多 group
];
```

`CHAPTERS` 不变。`ALL_DOCS` 派生方式调整为:

```js
const FLATTENED_TOURS = TOURS.flatMap(t => t.steps);
export const ALL_DOCS = [...FLATTENED_CHAPTERS, ...FLATTENED_TOURS];
```

`CHAPTER_BY_ID` 继续 flatten,内部消费代码不需要知道 tour group 概念。

### Backward-compat: `normalizeTours()` helper

老 wiki 的 `chapters.js` 仍是扁平 `TOURS`。在 `templates/web/js/chapters.js` **末尾**新增:

```js
// 兼容老 wiki: 扁平 TOURS 自动包成单 group; 新 schema 原样返回。
export function normalizeTours(tours) {
  if (tours.length === 0 || tours[0].steps) return tours;
  return [{ slug: 'main', title: null, target: typeof TRACE_TARGET !== 'undefined' ? TRACE_TARGET : '', steps: tours }];
}
```

`sidebar.js` 与 `content.js` 在读 TOURS 时统一用 `normalizeTours(TOURS)`。`title: null` 触发 strings.js 的 `sidebar_tour_head` / `home_tour_h2` 默认文案。

### URL hash 不变

`#/<chapterId>[/<anchor>]` 仍然成立,id 就是文件名去 `.md`。新 tour step id 是 `tour-<slug>-NN-<step>`,中划线足够多但不含 `/`,与 hash parser 0 冲突。

### 文件命名约定

| 文件 | 命名 |
|------|------|
| Tour overview | `tour-<slug>-00-overview.md` |
| Tour steps | `tour-<slug>-NN-<step-slug>.md`,NN 从 01 起 |
| Glossary | 不变(`NN-glossary-and-faq.md`) |
| Reference 章节 | 不变 |

老 wiki 的 `tour-NN-<step>.md` 文件**不重命名**(URL 兼容、外部链接不破)。迁移时,老 step 进入新 schema 的 `steps[]` 数组,id 保持原样。

## Phase 0: 新增 add-tour mode

### 检测表新增第 4 行

| Detected | Mode | Meaning |
|----------|------|---------|
| `projects.json` present, target project dir present, **user prompt contains "add tour" / "加 tour" / "添加 trace tour"** | **add-tour** | Append a tour to the current version |

判断优先级:add-tour 关键词检测 **优先于** 现有的 append-version 默认。即用户既有 project dir 又说 "加 tour" → 进 add-tour;只有 project dir 没说加 tour → 走旧的 append-version 歧义流程。

### add-tour 模式 Phase 0 输入

| 字段 | 说明 |
|------|------|
| Target project | 从 `projects.json` 列出让用户选 |
| Target version | 默认 `latest`(latest=true 的版本);可指定具体 dir |
| **Tour slug** | kebab-case。skill 读现有 `chapters.js` 的 TOURS slug,冲突时拒绝并要求改 |
| **Tour title** | 一句话,显示在侧栏 section header + tour overview h1 |
| **Tour TRACE_TARGET** | 该 tour 跟的最小请求字符串 |

老 wiki 没有 slug 概念。迁移规则在 Phase 4 处理(slug `main` 兜底)。

### 新生成 wiki 的 Phase 0 增加 primary tour 信息

| 字段 | 说明 |
|------|------|
| **PRIMARY_TOUR_SLUG** | 默认从 TRACE_TARGET 派生(e.g. `llm.generate(...)` → `llm-generate` 或 `single-request`);用户可改 |
| **PRIMARY_TOUR_TITLE** | 默认 `"Single-request trace tour"`(en) / `"单请求 trace 导览"`(zh-CN);用户可改 |

`TRACE_TARGET` 继续作为 Phase 0 顶层输入,同时被注入到 `TOURS[0].target` 和 顶层 `TRACE_TARGET` 常量(向后兼容)。

### Phase 跳过表(对照当前 SKILL.md Phase 1-5 + Phase 4 step 7 verify + 最终 commit/push)

| Phase | new mono-repo / new project | append version | **add-tour** |
|-------|---|---|---|
| 1 explore | ✓ | skip (读现有 chapters.js) | **skip (重读现有 chapters.js)** |
| 2 design tour | 全栈主 tour | skip | **只设计新 tour 的 step list,跟用户确认** |
| 3 generate content | 全量(chapters + tour) | 全量 | **只生成新 tour 的 step + overview 文件** |
| 4 web setup (含 step 7 verify) | 全套(写新 chapters.js 模板) | 全套 | **append 新 group 到 TOURS;老 wiki 首次走时一次性 schema 迁移;verify 加新 tour checklist** |
| 5 SVG | optional | optional | skip default |
| commit + push | ✓ | ✓ | **✓** |

## Phase 2 add-tour 流程

输入:Phase 0 收集的 slug / title / target / 选定项目+版本。

步骤:

1. **重读 wiki 上下文** — 读 `chapters.js`(CHAPTERS 列表 + 现有 TOURS slug)、`README.md`、`<wiki>/01-architecture-overview.md`。**不跑** codebase exploration。

2. **检查 slug 冲突** — 在现有 TOURS(标准化后)里查 slug。冲突 → 提示用户改。

3. **设计 step 列表** — 派一个 sonnet agent 输出 state-evolution table(格式见 `reference/trace-tour-design.md`),~15-20 步(可短至 10 步用于"变体" tour)。每步:`num` / 文件 slug / 一句话标题 / 当前情境 / 该步预计涉及的源码文件。

4. **跟用户确认 step 列表** — 用户改/确认后才进 Phase 3。

## Phase 3 add-tour 受限派发

派 N/3 个 parallel agents(每 agent 3-5 step):

输入(每个 agent prompt):
- 该 tour 的 slug / title / target
- 分到的 step 子集(num + slug + 标题 + 涉及文件)
- `templates/tour-step-prompt.md`(带新占位符,见 Section 5)
- LANGUAGE(从 Phase 0)
- 当前 wiki 的 `chapters.js`(让 agent 写"延伸阅读"段时能链接到正确 CHAPTERS id)
- 8-section template ref:`reference/8-section-template.md`
- 输出路径:`<wiki>/tour-<slug>-NN-<step>.md`

外加 **1 个 overview agent**,在所有 step agents 完成后跑(因为 overview 要总结所有步骤):
- 模板:**新文件** `templates/tour-overview-prompt.md`(Section 5)
- 输入:tour title / target / 其他 tour 列表(`{{OTHER_TOURS}}`)/ step 表(`{{STEP_TABLE}}`,由 controller 注入,agent 不重新生成,避免漂移)
- 输出:`<wiki>/tour-<slug>-00-overview.md`

**Quality bar** 同原 Phase 3:每步 120-200 行,8 段齐全,`file:line` refs。

## Phase 4 add-tour: chapters.js 增量编辑

由 controller 自己编辑(不派 agent)。

**新 wiki(已是新 schema)**:
直接在 `chapters.js` 的 TOURS 数组末尾 append 新 group:

```js
export const TOURS = [
  { slug: 'single-request', title: '...', target: '...', steps: [...] },
  // append 新 group:
  { slug: 'batched', title: 'Batched generate trace tour',
    target: 'llm.generate(["a","b","c"], max_tokens=3)',
    steps: [
      { id: 'tour-batched-00-overview', num: '00', title: 'Tour overview', desc: '...' },
      { id: 'tour-batched-01-fanout',   num: '01', title: 'Prompt fan-out', desc: '...' },
      // 15-20 项
    ],
  },
];
```

**老 wiki(扁平 TOURS)首次走 add-tour**:

1. 读现有扁平 TOURS 数组
2. **就地重写**为新 schema 单 group:
   ```js
   { slug: 'main',
     title: '单请求 Trace 导览' /* 中文老 wiki */ 或 'Single-request trace tour' /* 英文老 wiki, 看 <html lang> 决定 */,
     target: <TRACE_TARGET>, steps: [<原扁平 steps>] }
   ```
   注:`title` 此时已固化为 wiki 自己的语言字面值,不再用 `null` 兜底——因为该 wiki 已经定语言了。
3. append 新 group(同上)
4. **老 step 文件不重命名**——`tour-01-cli-boot.md` 等保持原文件名,id `tour-01-cli-boot` 也保留在 steps[] 数组里

## Sidebar + Home rendering 改造

### `sidebar.js renderChapterList()`

```js
import { normalizeTours } from './chapters.js';
// ...

for (const tour of normalizeTours(TOURS)) {
  const headLabel = tour.title || T.sidebar_tour_head;
  html += `<div class="sidebar-head">${escapeAttr(headLabel)}</div>`;
  for (const step of tour.steps) {
    const active = step.id === currentChapterId ? 'active' : '';
    html += `<a class="ch-item ${active}" href="#/${step.id}"><span class="ch-num">${step.num}</span>${step.title}</a>`;
  }
}
```

### `content.js renderHome()`

```js
const tours = normalizeTours(TOURS);
const primary = tours[0];
const primaryStepCount = Math.max(primary.steps.length - 1, 0);  // 减去 overview
const firstPrimaryStep = primary.steps.find(s => !s.id.endsWith('-00-overview'));

// "推荐第一遍这样学" 区块只用 primary tour
// h2 / lede / CTA 都用 primary.title / primary.target / primary.steps[0].id / firstPrimaryStep.id

// 每个 tour 一个 section + card grid:
${tours.map(tour => `
  <section style="margin-top:24px">
    <h2 style="font-size:20px;margin-bottom:8px;">${escapeHTML(tour.title || T.home_tour_h2(tour.steps.length - 1))}</h2>
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

只有一个 tour 时视觉与旧版几乎一样(单 section,同样的 card grid)。多 tour 时自然分层。

## strings.js 调整

**新增 key**(zh + en):

```js
// zh:
sidebar_tour_default_head: '单请求 Trace 导览',  // 老 wiki title=null 兜底
home_tour_recommend_h2_for: (project, tourTitle) => `推荐第一遍这样学: ${tourTitle}`,

// en:
sidebar_tour_default_head: 'Single-request trace tour',
home_tour_recommend_h2_for: (project, tourTitle) => `Recommended first read: ${tourTitle}`,
```

实际具体 key 名称在 plan 阶段固化,可能与上面略有差异。

**复用 key** 不动:`sidebar_tour_head`, `home_tour_h2`, `home_tour_lede`, `home_trace_h2`, `home_trace_lede`, `home_trace_cta`, `home_trace_sample` 等。

## 模板文件改动

### `templates/tour-step-prompt.md`

新增占位符:
- `{{TOUR_SLUG}}` — 用于 output path `tour-{{TOUR_SLUG}}-NN-<step>.md`
- `{{TOUR_TITLE}}` — 写到 step 的"上下文背景"段
- `{{TOUR_TARGET}}` — 这条 tour 跟的最小请求,step 头部段引用
- `{{TOUR_STEP_LIST}}` — 整条 tour 的所有 step 列表,让 agent 写"延伸阅读"段时能引用本 tour 其他步骤

原有 `{{LANGUAGE}}` / `{{PROJECT_NAME}}` / `{{CODEBASE_PATH}}` / 等不变。

### `templates/tour-overview-prompt.md`(新文件)

专门给 overview agent。结构:

```markdown
# Task

Write `tour-{{TOUR_SLUG}}-00-overview.md` for the {{PROJECT_NAME}} wiki.

This is the entry page of a trace tour titled "{{TOUR_TITLE}}", which follows:
  {{TOUR_TARGET}}

through the {{PROJECT_NAME}} stack in {{TOUR_STEP_COUNT}} steps.

Other tours already in this wiki: {{OTHER_TOURS}}.

## Output structure (3 sections, ~150 lines)

1. **What this tour follows** — 1-2 paragraphs:
   - Concretely describe the minimal request `{{TOUR_TARGET}}`
   - How it differs from other tours (use {{OTHER_TOURS}})
   - Why this scenario is worth a dedicated walk-through (what's unique in the code path)

2. **8-section template recap** — bullet list copy of the 8 sections (see `reference/8-section-template.md` link)

3. **Step list** — exact table provided in `{{STEP_TABLE}}` (DO NOT regenerate, copy verbatim):

{{STEP_TABLE}}

## Language: {{LANGUAGE}}

(...)
```

### `templates/web/js/chapters.js`

模板形态改为新 schema(见 Architecture 节示例)。占位符新增 `{{PRIMARY_TOUR_SLUG}}` / `{{PRIMARY_TOUR_TITLE}}`。`normalizeTours()` helper 加在文件末尾(所有 export 之后),作为正式 export。

### `templates/web/js/sidebar.js` & `templates/web/js/content.js`

按 "Sidebar + Home rendering 改造" 节描述改动。

### `templates/index.html`

不动(URL parsing 不变,DOM 结构不变)。

## `reference/trace-tour-design.md` 改动

加两段新小节:

### "Multi-tour design"
- 说明用户可以为同一 wiki 添加多条 tour,每条覆盖一个独立的初始请求场景
- 推荐场景类型:不同请求类型(generate vs chat completion)/ 不同请求规模(单请求 vs batched)/ 不同 IO 模式(blocking vs streaming)/ 不同入口(CLI vs HTTP vs gRPC)
- 一条 tour 跨越全栈 → 15-20 步;"变体 tour"或"子系统 tour" → 8-12 步可接受

### "Naming convention"
- 主 tour slug 用描述性 kebab-case(`single-request`、`chat-completion`、`batched-generate`),**不**用 `main`
- `main` 仅在自动迁移老 wiki 时作为 slug 兜底
- slug 在 wiki 内全局唯一,Phase 0 检测冲突

## SKILL.md 改动

| 节 | 改动 |
|---|---|
| Phase 0 检测表 | 加 add-tour 行(见 Section 2) |
| Phase 0 问题分支 | 按模式分组列问题(见 Section 2) |
| Phase 2 | 拆成"全栈主 tour 设计"(原流程) + "add-tour 设计"(新流程,只设计 1 条新 tour) |
| Phase 3 | 拆成"全量内容生成" + "add-tour 受限派发" |
| Phase 4 | step 1 (chapters.js) 加一条说明:add-tour 模式下直接编辑现有 chapters.js,只 append 新 TOURS group;老 wiki 一次性 schema 迁移 |
| Phase 7 / verification | 加 add-tour 验证 checklist:文件齐全、TOURS 数组正确扩展、normalizeTours shim 兼容老 wiki |
| Reference files list | 加 `reference/trace-tour-design.md` 提示(Multi-tour 小节) |

## Verification plan

实施完成后手动跑:

1. **现有 wiki 不回归** — mono-repo 9 个老 wiki + 2 个新 wiki 全部打开;侧栏依然显示单 tour section + 所有步骤;`normalizeTours` shim 生效;术语弹窗 / 搜索 / 版本切换照常
2. **新生成 wiki(单 tour)** — 跑 skill 生成 fresh zh 和 fresh en mock wiki,Phase 0 多问 PRIMARY_TOUR_SLUG / TITLE。生成的 chapters.js 是新 schema 单 group,侧栏渲染与旧视觉等价(只是 section 标题来自 `tour.title`)
3. **add-tour on 新 wiki** — 给 (2) 产物再加一条 tour,验证:`tour-<new-slug>-NN-...` 文件齐全(15-20 + overview),chapters.js TOURS 数组追加新 group,侧栏出现两个 section,首页两条 tour 各一区块
4. **add-tour on 老 wiki** — 给某个中文老 wiki(e.g. `vllm/086749736`)加第二条 tour,验证:
   - chapters.js 就地迁移到新 schema(老步骤 id `tour-01-cli-boot` 等保持原样)
   - 老 step 文件未重命名
   - 新 tour 文件正确生成
   - 侧栏两个 section,首页两条 tour 各一区块
   - 老外链 `#/tour-01-cli-boot` 仍能打开
5. **URL hash 兼容** — 所有现有外链(如 `#/tour-01-cli-boot`)继续解析,术语弹窗里的"在术语表查看完整条目 →"链接 fixed,术语 hover tooltip 正常

不写自动化测试(skill 是 markdown + templates,无单测基建)。

## Out of scope (this spec)

- 自动复用相同 step 在不同 tour 之间(每条 tour 独立、可重复)
- Tour 之间的 cross-reference link 自动化(由 agent 在 "延伸阅读" 段写)
- Tour 删除 / 重命名(将来 spec)
- 同 step 跨 tour 的 anchor 跳转(`#/tour-A-03/...` 指向 tour-B 的步骤——技术上可行但不自动)
- 多 tour 时,首页"推荐第一遍这样学" 是否能换 primary tour(暂时永远用 TOURS[0])
- 一次 add-tour 加多条(用户已确认一次一条)
- Tour 内 step 重排序(写完后不动)
