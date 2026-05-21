# 设计文档:codebase-wiki Q&A addenda flow

- 日期:2026-05-20
- 状态:已定稿,待评审
- 范围:为已生成的 wiki 增加"按问题生成 addendum 文件并自动挂到对应章节下"的能力。
- 前序:`2026-05-18-codebase-wiki-monorepo-design.md`(mono-repo 布局)、`2026-05-18-codebase-wiki-versioning-design.md`(版本层)

## 1. 背景与问题

codebase-wiki skill 现在能生成 / 追加 / 导入 wiki,但生成是**一次成型**的:Phase 1 探索完代码定下 10-15 章后,后续没法继续往这个 wiki 里"补内容"。

实际使用过程中,用户读完 wiki 经常发现:某个细节没讲透,或某段代码的设计动机没被覆盖。当前唯一的办法是手写一段 markdown 塞到某个章节里,既要熟悉 chapters.js 结构,又要保证 file:line refs 锁到 ANALYZED_COMMIT。门槛与 skill 主流程的精度脱节。

需求:让用户**对已生成的 wiki 提一批问题**,skill 自动:(1) 给每个问题挑一个挂靠章节,(2) 用与原章节同档的严谨度生成答案文件,(3) 把这些 addendum 挂在 parent 章节下让 viewer 能层级展示,(4) 自动 commit。Push 是唯一打断点。

## 2. 目标与非目标

### 目标

- 提供 skill 的第四种入口模式 **Q&A addenda flow**,与 new-monorepo / new-project / append-version 平级,与 import flow 在 SKILL.md 中并列。
- 用户给一份问题列表(粘贴或文件)+ 目标 wiki 路径 + 源码路径,其余 skill 自动完成。
- 生成的 addendum 与原章节同档:file:line refs 锁到 ANALYZED_COMMIT、代码节选 5-30 行、必要时 problem-first、200-500 行。
- 不破坏既有 wiki:已有 viewer 代码(没有 addenda 字段的 chapters.js)行为完全不变。
- 自动 commit;push 前征询确认(与 SKILL.md 现有原则一致)。

### 非目标(本轮明确不做)

- 删除 / 重命名 addendum(手工改文件 + chapters.js)。
- 跨多个章节的 addendum(每个 addendum 只挂一个 parent)。
- 修改既有 addendum(再问一遍生成一个新的;旧的留着)。
- 自动 push 到 GitHub。
- 把 addendum 挂到 tour 步骤或 glossary 章节(只挂 reference 章节 `01-12` 中前 11 章,末章 glossary 是结构化数据,不挂)。
- 自动 fetch 远端 commit。
- 自动化测试套件(本仓库无 CI;测试是手动 + 端到端)。

## 3. 用户交互摘要

整个 flow 只有两次需要用户介入:**Phase 0 收输入** 与 **Phase 4 push 询问**。中间的章节分配、文件命名、内容生成、chapters.js 维护、commit 都自动完成。

设计哲学:见仓库 memory `project_codebase_wiki_low_friction.md` —— 自动决策优先,只在不可逆 / 外部副作用前征询。

## 4. 四个 Phase

### Phase 0:定位 target wiki 与源码

skill 主动问以下三项(缺一不可):

1. **target wiki 路径**:`<mono-repo>/<project>/<version>/` 的绝对路径,或给 mono-repo 根 + project + version 三段。
2. **源码路径**:codebase 所在的本地 git 仓库绝对路径。
3. **问题列表**:支持两种输入,任选其一 ——
   - 用户在对话里粘贴一段,允许用空行或 `---` 任一种分隔多条问题(skill 两种都识别)
   - 给一个 `questions.md` 文件路径,skill 解析为问题列表(同样接受空行或 `---` 分隔)

自动解析:

- 读 `<target>/web/js/chapters.js`,提取 `PROJECT_NAME` / `PROJECT_GITHUB_REPO` / `ANALYZED_COMMIT` / `CHAPTERS` 数组。
- 在源码仓库执行 `git rev-parse <ANALYZED_COMMIT>` 校验 commit 可达。**不自动 fetch**;不可达即报错退出,提示用户手动 `git fetch` 后重试。
- **不 checkout**:全程用 `git show <commit>:<path>` 读源码,避免破坏用户工作区。

### Phase 1:自动分配章节

对每个问题,skill 在主对话中(不 dispatch agent,因为是轻量分类任务)完成分配:

- 把问题文本与每个章节的 `title + desc` 拼成上下文。
- LLM 一次性输出"问题 i → 章节 NN"的映射表。
- 章节范围:所有 reference 章节,但**排除 glossary**(`id` 含 `glossary` 或 `12-glossary-and-faq` 的章节)。允许挂的章节数由 `CHAPTERS.filter(c => !/glossary/i.test(c.id))` 决定 —— 兼容 10-15 章规模不一的项目。
- 极端情况:若问题与所有章节都不匹配 —— 退化挂到 `01-architecture-overview`,addendum 顶部加一行"_本问题未匹配到具体章节,挂在架构总览之下_"。流程不停顿;用户事后可手动搬迁。

打印分配表给用户(纯告知,不等确认),进入 Phase 2。

### Phase 2:并行生成 addenda

对每个 `(问题, 章节)` 对 dispatch 一个 agent,5-6 并发为一批,使用 dispatching-parallel-agents skill 模式。

**Agent 输入**:

- 问题原文
- parent 章节的完整 markdown(让 agent 知道哪些已被覆盖,避免重复说)
- 源码仓库路径 + `ANALYZED_COMMIT`(明确指令:用 `git show <commit>:<path>` 读源码,不 checkout)
- `PROJECT_GITHUB_REPO` 与 `ANALYZED_COMMIT`(用于生成 GitHub 深链)
- 新模板 `templates/addendum-prompt.md`(见 §6)
- 输出路径:`<target>/<NN><letter>-<slug>.md`(见 §5)

**质量约束**(与现有 `chapter-prompt.md` 对齐):

- file:line refs 必须在 `ANALYZED_COMMIT` 下可验证。
- 代码节选 5-30 行。
- 长度 200-500 行。
- 必要时 problem-first;非必要不强加。

### Phase 3:联动 wire-up

由主对话(非 agent)统一完成,以保证三处改动一致:

1. **修改 parent 章节文件**:在文件末尾找或新建 H2 `## 延伸阅读 / Addenda`,追加 `- [<addendum title>](./<NN><letter>-<slug>.md) —— <截短的 question>`。**幂等**:用 link target 作为查重 key,已存在则跳过。
2. **修改 `web/js/chapters.js`**:给对应章节对象的 `addenda` 数组(没有就新建)push 一个 `{id, title, question}` 项。**幂等**:用 id 查重。
3. **不需要**在本 Phase 修改 `sidebar.js` / `content.js` / `style.css` —— 这些文件的改造是模板级一次性变更(见 §7),已经在 templates 里,新生成的 wiki 与现有 mono-repo 里既有 wiki 共用同一份 viewer 代码。Q&A flow 运行时只触碰**数据**(`chapters.js`)与**内容**(.md 文件),不触碰**渲染**(其他 web/js/*)。

### Phase 4:auto-commit + push 询问

1. wire-up 完成后,直接 `cd <mono-repo> && git add -A && git commit -m "Add N addenda for <project>/<version>"`。
2. 打印分配表 + 文件清单 + commit SHA(纯告知)。
3. 询问"是否 push?" —— 唯一打断,等用户确认后 `git push`。

## 5. 数据模型

### addendum 文件命名

`<NN><letter>-<slug>.md`:

- `<NN>` = parent 章节两位编号(继承 parent 的 `num`)。
- `<letter>` = `a` / `b` / `c` …;同章节多 addendum 时递增,扫描已有 `NN[a-z]-*.md` 取下一个字母。同章节超过 26 个 addendum 时报错并要求用户合并或拆 parent;实际不可达。
- `<slug>` = 问题的 kebab-case 短摘要,15-40 字符内,由 skill 自动生成。

示例:`03a-fork-join-strategy.md` 挂在 `03-scheduler.md` 之下。

排序天然:`ls` 让 `03-scheduler.md` `03a-...md` `03b-...md` `04-engine.md` 相邻,与 sidebar 顺序一致。

### `web/js/chapters.js` 形状变更

```js
export const CHAPTERS = [
  { id: '03-scheduler', num: '03', title: 'Scheduler', desc: '...', layers: [2],
    addenda: [
      { id: '03a-fork-join-strategy',
        title: 'Fork-join 调度策略',
        question: '当请求被拆成多片并行调度时,合并阶段怎么处理?' },
      { id: '03b-...', title: '...', question: '...' }
    ]
  },
  // ...
];
```

`addenda[i]` 只有三个字段:`id` / `title` / `question`。无 `num`(由字母后缀承担)、无 `desc`(`question` 就是描述)、无 `layers`(继承 parent 的)。

### `ALL_DOCS` / `CHAPTER_BY_ID` 的扩展

把 addenda 平铺进 `ALL_DOCS`,使路由 / 搜索 / j-k 导航的现有代码无需改动:

```js
export const ALL_DOCS = [
  ...CHAPTERS.flatMap(c => [c, ...(c.addenda || [])]),
  ...TOURS
];
export const CHAPTER_BY_ID = Object.fromEntries(ALL_DOCS.map(c => [c.id, c]));
```

副作用:

- **j/k 导航**自然变成 `01 → 01a → 01b → 02 → 02a → 03 → ...`。
- **搜索索引** `buildIndex()` 走 `ALL_DOCS`,addendum 自动被索引。
- **路由 `loadChapter`** 通过 `CHAPTER_BY_ID[id]` 拿到 addendum 元数据,`fetch('${id}.md')` 自动加载文件。

### parent 章节文件的"延伸阅读"区块契约

形式:

```markdown
## 延伸阅读 / Addenda

- [Fork-join 调度策略](./03a-fork-join-strategy.md) —— 当请求被拆成多片并行调度时,合并阶段怎么处理?
- [...](./03b-....md) —— ...
```

破折号后用 question 截短(单行,~60 字符内)。

幂等:同链接 target 不重复 push。

## 6. 新增模板:`templates/addendum-prompt.md`

与 `chapter-prompt.md` 同档,但接收单个问题作为生成目标。占位符:

- `<QUESTION>` —— 原始问题文本
- `<PARENT_CHAPTER_MD>` —— parent 章节的完整 markdown(用于"避免重复"指令)
- `<PARENT_CHAPTER_ID>` —— `03-scheduler`
- `<ADDENDUM_ID>` —— `03a-fork-join-strategy`
- `<SRC_REPO_PATH>` —— 源码绝对路径
- `<ANALYZED_COMMIT>` —— 待锁定的 commit
- `<PROJECT_GITHUB_REPO>` —— `owner/repo`,用于深链
- `<PROJECT_NAME>` —— 友好名

强约束(写进模板):

- 必须用 `git show <ANALYZED_COMMIT>:<path>` 读源码,**禁止 `cd` 或 `checkout`**。
- 必须给出 file:line refs,且在 `<ANALYZED_COMMIT>` 下可验证。
- 代码节选 5-30 行,>30 行的必须截断 + 用 `# ...` 表示省略。
- 长度 200-500 行(不含代码块行数)。
- 必要时按 problem-first 叙事(问题 → 朴素思路 → 为何崩 → 实际设计);单纯的"how does X work"问题可以直接说明。
- **禁止重复 parent 章节已讲透的内容**。
- 顶部不写 H1(viewer 自己渲染 banner);从 H2 开始组织。
- 末尾不要 "## 延伸阅读"段(那是 parent 的)。

## 7. Web viewer 改造

### `templates/web/js/chapters.js`

唯一变动是 `ALL_DOCS` / `CHAPTER_BY_ID` 的构造方式(已在 §5 给出代码)。注释里说明 `addenda` 字段是可选的,由 Q&A flow 自动维护。

### `templates/web/js/sidebar.js` 的 `renderChapterList`

结构变化:

```
参考手册(12 章)
  ├─ 01 架构总览
  ├─ 02 ...
  ├─ 03 Scheduler                ▸ ← 有 addenda 时显示折叠图标
  │   ▾ Fork-join 调度策略         ← 二级,缩进
  │   ▾ ...
  ├─ 04 ...
```

行为:

- **折叠状态**:默认收起;**当前激活章节是 addendum 时,其父章节的 addenda 自动展开**(查 `CHAPTER_BY_ID[currentId]` 的 `parentId`,或扫描 CHAPTERS 找谁包含 addendum.id)。
- **持久化**:用 `${STORAGE_PREFIX}-sidebar-expanded` 存一个 Set 的 JSON 序列化(展开的章节 id 集合),与现有的主题/repo-root 存储风格一致。
- **图标**:CSS 控制的 `▸` / `▾` 字符,不引入依赖。
- **active 高亮**:父章节自身被点中、或它的某个 addendum 被点中时,父都高亮(后者额外加 `has-active-child` class)。

### `templates/web/js/content.js` 的 `loadChapter`

可选增强:当 chap 有 `question` 字段时,渲染前在文档顶部插入一个 banner:

```html
<div class="addendum-banner">
  本节回答:<em>{question}</em> · <a href="#/{parentId}">↑ 回到 {parent.title}</a>
</div>
```

需要在构造 `CHAPTER_BY_ID` 时记录每个 addendum 的 `parentId`。这是纯增量;parent 章节渲染不受影响。

### `templates/web/js/app.js` / `search.js` / 其他

**不动**。它们消费的是 `ALL_DOCS` / `CHAPTER_BY_ID`,前面的扩展已覆盖。

### `templates/web/css/style.css`

新增三条规则:

- `.ch-item.addendum`:缩进 ~16px、字号 13px、左侧加细线分隔。
- `.ch-toggle`:折叠图标。
- `.ch-item.has-active-child`:轻量背景色,提示子项被激活。
- `.addendum-banner`:顶部 banner 样式(细边框、淡背景)。

### 向后兼容

- 现有没有 `addenda` 字段的 wiki:`(c.addenda || [])` 解为空数组,sidebar 退化为现在的扁平 `<a>`,行为完全不变。
- 同一份 viewer 代码同时服务老版 / 新版 wiki。

## 8. 错误处理与幂等

### 触发即拒绝(Phase 0 early bail)

| 情况 | 检测 | 行为 |
|---|---|---|
| target wiki 路径不存在 | `stat <path>/web/js/chapters.js` 失败 | 报错并退出;提示先用主 skill 生成 wiki |
| 不在 mono-repo 里 | 向上找不到 `projects.json` | 报错;Q&A flow 只服务 mono-repo 内的 wiki |
| `chapters.js` 解析不出来 | 找不到 `PROJECT_GITHUB_REPO` / `ANALYZED_COMMIT` | 报错;附上检测到的字段列表 |
| 源码 commit 不可达 | `git -C <src> rev-parse <ANALYZED_COMMIT>` 非零 | 报错,**不自动 fetch**;提示用户手动 fetch 后重试 |
| `chapters.js` 占位符未替换 | 检测到字面值 `{{PROJECT_NAME}}` 等 | 报错;wiki 不是已发布状态 |

### 自动分配失败的退化

LLM 必须返回章节 id;不允许"无章节"。若 LLM 觉得问题与所有章节都不相关 —— 退化挂到 `01-architecture-overview` 并在 addendum 顶部加提示行。流程不停顿,用户事后可手动搬迁。

### Agent 生成失败

某个 agent 没产出文件、或产出 < 50 行、或没有任何 file:line ref:

- **不**中断其他 agent 的结果。
- 在最终汇总里列出失败条目 + 原因。
- commit 时**只 commit 成功的**条目。
- 失败问题原文写入 `<target>/.qa-failed.log` 附带时间戳;`.qa-failed.log` 不进 git(`.gitignore` 加规则)。

### 幂等性约束

整个 Q&A flow 设计成可安全重跑:

1. **文件名冲突**:扫描 `<target>/` 下已有 `<NN>[a-z]-*.md`,新字母从最大字母 +1 起。同一问题二次跑会**新分配字母**,不覆盖也不报错。
2. **parent 章节"延伸阅读"区**:用 link target 做查重 key,已存在则跳过追加;不存在该区时新建。
3. **`chapters.js` addenda 字段**:用 `id` 查重,已存在不重复 push。
4. **commit 失败**(比如 pre-commit hook 拒了):保留工作区状态;**不** `git reset`;告知用户怎么处理。

## 9. 文件改动清单

### 新增(2)

1. `templates/addendum-prompt.md`(~80 行)—— agent 用的 prompt 模板,见 §6。
2. `reference/qa-addenda-flow.md`(~150 行)—— flow 的方法论参考文档,与 `monorepo.md` / `versioning.md` 平级。

### 修改(5)

1. `SKILL.md`:在 "Importing existing standalone wiki repos" 之后插入一节 **"Q&A addenda flow"**。预计 +50~70 行。
2. `templates/web/js/chapters.js`:扩展 `ALL_DOCS` / `CHAPTER_BY_ID` 的构造,见 §5。注释里说明 `addenda` 字段。
3. `templates/web/js/sidebar.js`:`renderChapterList` 支持二级展开、折叠状态持久化、`has-active-child` 高亮。
4. `templates/web/js/content.js`:`loadChapter` 中渲染 addendum banner;构造时记录 `parentId`(可能放在 chapters.js 的辅助导出里)。
5. `templates/web/css/style.css`:新增 4 条 CSS 规则。

### 不动

- `templates/chapter-prompt.md` / `tour-step-prompt.md`
- `templates/index.html` / `project-index.html` / `version-index.html`
- `reference/monorepo.md` / `versioning.md` / `workflow.md` / `chapter-planning.md` / `8-section-template.md` / `trace-tour-design.md`
- `templates/web/js/{app,search,glossary,diagrams,versions,architecture}.js`

## 10. 测试计划

无自动化测试套件。测试是手动 + 端到端。

| 用例 | 验证方式 |
|---|---|
| **T1 端到端真跑** | 用 `xgliu515/codebase-wikis` 里某个已发布 wiki(如 vllm 某版本)做目标,造 3 个真问题,跑完整 Q&A flow,确认 3 个 addendum 文件 + parent 章节延伸阅读 + chapters.js + commit 都正确 |
| **T2 viewer 视觉回归** | T1 之后本地起站,验证:sidebar 二级展开 / 收起、点击 addendum 路由、j/k 顺序 `01 → 01a → 02` 正确、搜索能搜到 addendum 内容、active 高亮、addendum banner 渲染 |
| **T3 向后兼容** | 把更新过的 `templates/web/js/*` 同步到一个**没有任何 addenda** 的旧 wiki 版本,验证 sidebar 完全退化为扁平形态、所有行为不变 |
| **T4 幂等重跑** | T1 完成后,把同样的 3 个问题再跑一遍 —— 验证生成的新 addendum 是 `<NN>[新字母]-*.md`,延伸阅读区不重复追加同一链接,chapters.js 不重复 push entry |
| **T5 错误注入** | (a) 不存在的 wiki 路径 → Phase 0 报错退出;(b) 源码不可达 commit → 报错并提示 fetch;(c) 模拟 1/3 agent 产出空文件 → 只 commit 另外 2 个并把失败写入 `.qa-failed.log` |

测试结果在 PR 描述中以"测试矩阵"小节附带。

## 11. 推广路径

本期完成后,后续可考虑(不在本 spec 范围):

- Q&A 对 tour 步骤的扩展(目前只挂 reference 章节)。
- 自动重生成 addendum(用户改了问题表述后)。
- addendum 反哺生成主章节(连续 N 个相关 addendum 累积到一定量,提示用户考虑提升为新章节)。
- 把"延伸阅读"段也加入搜索索引的字段权重。
