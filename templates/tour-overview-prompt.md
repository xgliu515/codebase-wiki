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
