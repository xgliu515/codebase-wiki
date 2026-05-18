# Tour step generation agent prompt template

Use this template when dispatching an agent to write 1-4 tour steps in parallel. Steps within one agent stay coherent; multiple agents cover the full tour.

## Template

```
你正在为 {{PROJECT_NAME}} 的"单请求 trace 导览"写 N 个步骤。

【必读】严格按这两份建立的风格 + 模板写：
- `{{OUTPUT_DIR}}/tour-00-overview.md`（全局大纲 + N 步速览 + 状态变量表）
- `{{OUTPUT_DIR}}/tour-XX-...md`（已写好的样品步骤，是要你照搬的 tone 和结构）

【源码仓库】{{CODEBASE_PATH}}，锁定 commit {{COMMIT_SHORT}}。

【硬性要求】
- {{LANGUAGE}}，GitHub flavored markdown，禁用 emoji
- **严格 8 段模板**（标题完全照搬样品）：
  1. 当前情境
  2. 问题
  3. 朴素思路
  4. 为什么朴素思路会崩
  5. {{PROJECT_NAME}} 的做法
  6. 代码位置
  7. 分支与延伸
  8. 走完这一步你脑子里应该多了什么
- 每步约 120-200 行
- 大量 `file:line` 引用
- 第 5 段如果有合适图示就用 ASCII 画
- 第 7 段是知识网——必须用 markdown 链接到参考章节对应小节
- 终态文档；禁止"我研究了..."、"接下来..."等过程性叙述

---

【你要写的步骤】

## 步骤 NN：{{STEP_TITLE}}
- 输出文件：`{{OUTPUT_DIR}}/tour-NN-{{SHORT_SLUG}}.md`
- **上一步终态**：{{WHAT_STATE_LOOKED_LIKE_AT_END_OF_PREV_STEP}}
- **本步要解释**：{{WHAT_THIS_STEP_COVERS_2_3_SENTENCES}}
- **下一步起点**：{{WHAT_STATE_SHOULD_BE_AT_END_OF_THIS_STEP}}
- **关键代码**：
  - `{{FILE_1}}` — {{ROLE_1}}
  - `{{FILE_2}}` — {{ROLE_2}}
- **必须链接到**：第 X 章 §Y（{{TOPIC_LINKED}}）；第 Z 章 §W

（重复以上块 1-4 次，根据 agent 负责的 step 数）

---

完成后简短报告：每个文件路径 + 一句话描述。<150 字。
```

## Use guidance

- **Agent group size**: 1-4 steps per agent. Adjacent steps work best (state continuity).
- **Always provide tour-00 + 1 sample step** in the "必读" section. Without samples, agents drift in style.
- **State variables** (上一步终态 / 下一步起点) are critical. They prevent agents from contradicting each other or repeating background.
- **Cross-references** (必须链接到) prevents the tour from being self-contained — it MUST point back to chapters.

## Quality verification

For each tour step:
- All 8 sections present
- Section 4 (为什么朴素思路会崩) is concrete (not "性能差"), with specific failure modes
- Section 5 leads with "{{PROJECT}} 的做法" formulation, not "X works by..."
- Section 7 has 3+ cross-references with markdown anchors
- Section 8 has 3-5 concrete takeaways

If section 3-4 feel mechanical (no real naive thinking to subvert), the step might be poorly chosen — consider merging with neighbor or rephrasing.
