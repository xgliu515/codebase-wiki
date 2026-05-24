# codebase-wiki 双语 (zh-CN / en) 支持设计

**Status**: spec
**Date**: 2026-05-24
**Scope**: 给 codebase-wiki skill 增加英文 wiki 的一等支持。中/英二元开关,默认 `zh-CN`,选 `en` 时 UI chrome、字体、行高、README、glossary schema 全部切英文。

## Background

现状(2026-05-24):

- 模板 `templates/index.html` 写死 `<html lang="zh-CN">`,标题、按钮 tooltip、placeholder、loading 文案、`本页目录` 等约 10 处 UI chrome 硬编码中文
- `templates/web/css/style.css` 的字体栈 `--font-sans` 优先 CJK 字体,`line-height: 1.7` 是按中文方块字密度调的;英文页面会"显得 loose"
- `templates/readme.md.tmpl` 标题与免责声明等段落写死中文
- `templates/glossary-format.md` 用中文标签(`英文原名`/`中文译名`/`定义`/`代码位置`)作为术语条目格式;`templates/web/js/glossary.js` 解析器(line 68)和渲染器(line 342/343/346)硬编码这些中文 label
- `templates/chapter-prompt.md` line 48 和 `templates/addendum-prompt.md` line 53 **已有** `{{LANGUAGE}}` 占位符,但 SKILL.md Phase 0 没有把它当成首问输入,实际从未注入

结果是:即便用户要英文 wiki,生成出来的页面"英文内容裹一圈中文 UI",且字体/行距不为拉丁文字调教,视觉违和。

## Non-Goals

- 不做 zh/en 之外的第三语言(ja/ko/de 等)。本期只是二元开关。
- 不引入 i18n 库(i18next 等)。strings.js 是手写常量对象。
- 不为英文加自定义 web 字体(Inter / IBM Plex 之类),只用系统字体栈。
- 不动旧 8 个已生成的中文 wiki(它们保持原样)。
- 不动 `tour-step-prompt.md` / `svg-style-guide.md` 等内部 prompt——里面的中文只是给 Claude 看的说明文字,不影响产出语言。

## Architecture

i18n 走两个轴:

### (A) 脚手架阶段(生成时)

skill `SKILL.md` Phase 0 检查清单新增 `LANGUAGE` 字段,默认 `zh-CN`,可选 `en`。该值决定:

1. `index.html` 模板中 `{{LANG}}` 占位符的值(`zh-CN` 或 `en`)
2. `README.md` 用 `readme.md.tmpl`(zh) 还是 `readme.md.en.tmpl`(en)
3. glossary 章节的 agent prompt 用 `glossary-format.md`(zh) 还是 `glossary-format.en.md`(en)
4. `chapter-prompt.md` / `addendum-prompt.md` 的 `{{LANGUAGE}}` 注入:`zh-CN` → `简体中文`,`en` → `English`

注:`templates/web/js/strings.js` 是单一文件 ship 双语字符串,**不需要按 LANGUAGE 分发**——脚手架阶段直接原样拷贝。

### (B) 浏览器运行时

`<html lang>` 是 single source of truth。

- `web/js/strings.js` 顶层 `export const STRINGS = { zh: {...}, en: {...} }`
- 启动时 `export const T = STRINGS[document.documentElement.lang.startsWith('en') ? 'en' : 'zh']`
- `app.js` 启动 hook 里 `applyI18n()` 把 `T.*` 写入相应 DOM 属性(`document.title`, placeholder, button title 等)
- CSS 用 `html[lang^="en"]` 选择器覆盖 `body { font-family / line-height }` 和几处 `::after content`
- `glossary.js` parser 用兼容正则同时接受 zh/en 两套 label

设计意图:用户在 DevTools 改 `<html lang>` 刷新就能切语言——既能验证设计,也方便未来扩展。

## File changes

### New files

| Path | 用途 |
|------|------|
| `templates/web/js/strings.js` | 双语 UI 字符串常量,`STRINGS.zh` + `STRINGS.en`,导出 `T` |
| `templates/readme.md.en.tmpl` | README 英文版,占位符与中文版完全对应 |
| `templates/glossary-format.en.md` | glossary 章节英文版 schema(无中文译名字段) |

### Modified files

| Path | 改动 |
|------|------|
| `SKILL.md` | Phase 0 检查清单新增 LANGUAGE;Phase 4/5 实施步骤说明语言分发逻辑 |
| `templates/index.html` | `<html lang="zh-CN">` → `<html lang="{{LANG}}">`;`<title>` 中 `中文参考 Wiki` 改为 `{{TITLE_SUFFIX}}` 占位符(脚手架阶段直接替换为 `中文参考 Wiki` / `Wiki`,不走运行时);`<select title="...">`、`<button title="...">`、`placeholder=...`、`.rightbar-title` 静态文本、`.loading` 静态文本改为带 `data-i18n="<key>"` / `data-i18n-placeholder="<key>"` / `data-i18n-text="<key>"` 的标记(由 app.js 启动注入) |
| `templates/web/css/style.css` | 在 `:root` / `[data-theme="dark"]` 之后新增 `html[lang^="en"]` 选择器段(覆盖 `body` 的 font-family / line-height,`.md` 段落 line-height,几处 `::after content`) |
| `templates/web/js/app.js` | `import { T } from './strings.js'`;`main()` 起始处加 `applyI18n()`,把 DOM 上的 `data-i18n="<key>"` 节点的相应属性赋成 `T[key]` |
| `templates/web/js/glossary.js` | line 68 正则改为接受 zh+en label 的 alternation;line 342/343/346 渲染时用 `T.gloss_*_label` 代替硬编码字符串;英文模式下 `T.gloss_chinese_label === ''`,配合现有 `${term.chineseName ? ... : ''}` 三元自动隐藏中文译名行 |
| `templates/addendum-prompt.md` | line 53 fallback 由 `"简体中文"` 改为从 Phase 0 `{{LANGUAGE}}` 注入 |
| `reference/monorepo.md` | 新增 "Import: language-mixed mono-repo" 小节,说明 zh/en 项目可共存于同一个 mono-repo,根 `<html lang>` 决定项目列表页本身的语言 |
| `reference/versioning.md` | 加一句:同项目跨语言混版本允许但不推荐(version-switcher 跨语言会突兀) |

### Untouched

- 旧已生成的 8 个 wiki(`/Users/xgliu/Documents/git/codebase-wikis/{openclaw,dwarfstar-4,llama-cpp,vllm,sglang,hermes-agent,opencode,pi}`):零改动
- `templates/web/js/{content,sidebar,search,diagrams,utils,chapters,versions}.js`:不含语言相关字符串
- `templates/chapter-prompt.md`:仅依赖现有 `{{LANGUAGE}}` 占位符,内容不动
- `templates/tour-step-prompt.md`, `templates/svg-style-guide.md`:中文是给 Claude 的指令,不影响产出
- `examples/vllm-wiki.md`, `README.md`(skill repo):本期不动

## UI 字符串清单

最终清单(在 `strings.js` 中实现):

```js
export const STRINGS = {
  zh: {
    title_suffix: '中文参考 Wiki',
    search_placeholder: '搜索 (按 / 聚焦)',
    switch_project: '切换项目',
    switch_version: '切换版本',
    prev_chapter: '上一章 (k)',
    next_chapter: '下一章 (j)',
    toggle_theme: '切换主题 (t)',
    source_mode: '源码链接模式(默认 GitHub,可切到本地 VSCode)',
    loading: '加载中…',
    toc_title: '本页目录',
    click_to_expand: '点击放大',
    all_projects: '所有项目',
    addendum_banner: (parent) => `本 addendum 挂在 ${parent} 章节,补充未在 parent 覆盖的细节`,
    gloss_english_label: '英文原名',
    gloss_chinese_label: '中文译名',
    gloss_source_label: '代码位置',
    gloss_definition_label: '定义',
    gloss_no_definition: '(无定义)',
  },
  en: {
    title_suffix: 'Wiki',
    search_placeholder: 'Search (press /)',
    switch_project: 'Switch project',
    switch_version: 'Switch version',
    prev_chapter: 'Previous (k)',
    next_chapter: 'Next (j)',
    toggle_theme: 'Toggle theme (t)',
    source_mode: 'Source link mode (default GitHub, can switch to local VSCode)',
    loading: 'Loading…',
    toc_title: 'On this page',
    click_to_expand: 'Click to expand',
    all_projects: 'All projects',
    addendum_banner: (parent) => `Addendum to Chapter ${parent}, adding detail not covered in the parent`,
    gloss_english_label: 'Original name',
    gloss_chinese_label: '',
    gloss_source_label: 'Source',
    gloss_definition_label: 'Definition',
    gloss_no_definition: '(no definition)',
  },
};

export const T = STRINGS[document.documentElement.lang.startsWith('en') ? 'en' : 'zh'];
```

实施时 `index.html` 受影响的节点改为带 `data-i18n="<key>"`:

```html
<title>{{PROJECT_NAME}} {{TITLE_SUFFIX}}</title>
<!-- {{TITLE_SUFFIX}} 脚手架时直接替换,不走运行时;这样首屏就是正确语言,无闪烁 -->
<select id="project-switcher" data-i18n="switch_project" ...>
<select id="version-switcher" data-i18n="switch_version" ...>
<input id="search-input" data-i18n-placeholder="search_placeholder" ...>
<button id="prev-chapter" data-i18n="prev_chapter">‹</button>
<button id="next-chapter" data-i18n="next_chapter">›</button>
<button id="repo-root-btn" data-i18n="source_mode">源码</button>
<button id="theme-toggle" data-i18n="toggle_theme">🌓</button>
<div class="loading" data-i18n-text="loading">加载中…</div>
<div class="rightbar-title" data-i18n-text="toc_title">本页目录</div>
```

`app.js` 的 `applyI18n()`(启动时跑一次,运行时不动态响应——切语言需刷新):

```js
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

注:`document.title` 由模板占位符在脚手架阶段固化,因此 `applyI18n()` 不再处理 title。

## CSS lang-aware 覆盖

在 `style.css` `[data-theme="dark"]` 块之后插入:

```css
/* English-only typography overrides (CJK path untouched) */
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

中文路径(默认值)不变。`--font-mono` 不分语言。

## glossary.js parser 改造

line 68 原:
```js
const m = line.match(/^-\s*(英文原名|中文译名|定义|代码位置)[：:]\s*(.*)$/);
if (m) {
  const [, key, val] = m;
  if (key === '定义') definition = val;
  else if (key === '代码位置') codeLocation = val;
  else if (key === '中文译名') chineseName = val;
  else if (key === '英文原名') englishName = val;
}
```

改为:
```js
const m = line.match(/^-\s*(英文原名|中文译名|定义|代码位置|Original name|Definition|Source)[：:]\s*(.*)$/);
if (m) {
  const [, key, val] = m;
  if (key === '定义' || key === 'Definition') definition = val;
  else if (key === '代码位置' || key === 'Source') codeLocation = val;
  else if (key === '中文译名') chineseName = val;
  else if (key === '英文原名' || key === 'Original name') englishName = val;
}
```

(英文 glossary 无 chineseName,跳过即可)

line 342/343/346 渲染处把 `'中文译名'`/`'英文原名'`/`'代码位置'` 改为 `T.gloss_chinese_label` / `T.gloss_english_label` / `T.gloss_source_label`。英文模式下 `gloss_chinese_label === ''` 配合现有 `${term.chineseName ? ... : ''}` 三元,自动不渲染中文译名行。

## 模板模板:`readme.md.en.tmpl` 与 `glossary-format.en.md`

两份模板按现有中文模板逐段对译,占位符 1:1 保留。骨架见 Section 6 / Section 5(本 spec 不写完整对译,实施阶段产出)。

`glossary-format.en.md` schema:
```markdown
# Chapter N: Glossary & FAQ

<intro paragraph>

---

## Part 1: Glossary

### TermName
- Original name: `OfficialName`
- Definition: <1-3 sentences>
- Source: `path/to/file.py:123` defines `class TermName`, `path/to/other.py:456` main caller.

...

## Part 2: FAQ
...

## Part 3: Debug & dev cheat sheet
...
```

英文版砍掉「中文译名」字段。

## SKILL.md / reference doc 改动

### SKILL.md Phase 0 检查清单

新增条目(放在 ANALYZED_TAG 同段):

```
- LANGUAGE: "zh-CN" | "en" — UI chrome 语言 + 章节正文输出语言。默认 "zh-CN"。
  · 注入到 <html lang>、strings.js 运行时选语、readme.md.tmpl 选 .en. 变体、
    glossary-format 选 .en. 变体、chapter/addendum prompt 的 {{LANGUAGE}} 占位符
    ("简体中文" / "English").
```

### Phase 4 / 5 实施步骤说明

加一句:写 `index.html` / `README.md` / glossary chapter prompt 时按 LANGUAGE 二选一;`strings.js` 是 LANGUAGE 无关的,原样拷贝。

### `reference/monorepo.md` 新增小节

> **Language-mixed mono-repo**: A mono-repo may contain both zh-CN and en projects. Each project's `<html lang>` is independent. The top-level `project-index.html` and root `<html lang>` are set when the mono-repo is created (default `zh-CN`); change manually if you want the project picker page in English.

### `reference/versioning.md` 加一句

> Different versions of the same project may technically use different languages, but this is **not recommended** — the version switcher jumping across languages looks abrupt.

## Migration / Backward compatibility

- 已生成的 8 个中文 wiki **完全不动**:`<html lang="zh-CN">` 不命中新 CSS 规则,且它们不引用 `strings.js`
- 新生成的 wiki / 新版本 / 给老项目加新版本 → 使用 i18n 模板
- monorepo skill 的 "Import existing standalone wiki" 流程继续按现有 additive injection 处理,**不强制升级**已导入的老 wiki 到 strings.js

i18n 是纯加法(新文件、新 CSS 选择器、新 Phase 0 字段),回退只需单 commit revert,无数据迁移。

## Verification plan

实施完成后,作者手动跑以下 5 项:

1. **现有 wiki 不回归** — 起本地 server 打开 6 个老 wiki,chrome / 字体 / 行高 / 弹窗 / 搜索 / 版本切换 / 项目切换全部正常(hard gate)
2. **新模板 zh 路径** — 用 skill 生成 mock 小项目(zh),diff 应只见 `strings.js` 新文件 + `<html lang>` 替换,其他不变
3. **新模板 en 路径** — 同一 mock 项目(en),浏览器打开 chrome 全英文,字体视觉对,章节正文英文,glossary 用英文 schema 且术语弹窗正常
4. **运行时切换冒烟** — en wiki DevTools 改 `<html lang="zh-CN">` 后**刷新页面**,chrome 切中文;改回 en 再刷,切回英文。证明 `<html lang>` 是 single source of truth(注:`applyI18n()` 只在 main() 跑一次,不动态响应 lang 变化,切语言必须刷新——这是有意设计,简化运行时复杂度)
5. **Mono-repo 混合** — 1 zh + 1 en 项目共存,projects index 可跳两边,各项目独立 chrome 语言

不写自动化测试(无 JS 单测基建)。

## Out of scope (this spec)

- 第三语言扩展(ja/ko/de):本期 strings.js 用 `STRINGS.zh` / `STRINGS.en` 两键,加新语言要改架构(改成 `STRINGS[lang]` 索引)。如果未来真要加,届时单独 spec。
- 英文字体自托管 / Inter / IBM Plex:本期只用系统字体栈。
- 已生成中文 wiki 回填 strings.js:本期不做。
- 翻译已生成的中文 wiki 到英文:不在 skill 职责范围。
