# Chapter generation agent prompt template

Use this template when dispatching an agent (general-purpose subagent_type) to write 1-3 reference chapters in parallel.

## Template

```
你正在为 {{PROJECT_NAME}} 代码库（位于 {{CODEBASE_PATH}}）生成 {{LANGUAGE}} 参考 wiki 的第 N 章。

【关于项目】{{ONE_PARAGRAPH_PROJECT_DESCRIPTION_FROM_README_OR_AGENTS_MD}}

【代码版本锁定】{{OWNER}}/{{PROJECT}}@{{COMMIT_SHORT}}（{{DATE_ISO}}）。所有 file:line 引用必须基于这个 commit，不要引用主线最新代码。

【读者】一名熟悉 {{LANGUAGE_OR_TECH_STACK}} 的资深工程师，正在学习这个项目的内部实现。

【硬性要求】
- {{LANGUAGE}}，GitHub flavored markdown，禁用 emoji
- 仅关注 {{IF_APPLICABLE_FOCUS_SCOPE: e.g. "V1 架构 (vllm/v1/*)"}}，忽略 legacy 代码
- 大量使用 `file:line` 引用（如 `path/to/file.py:123`），便于读者跳转
- 适当用 ASCII 图或 mermaid 图说明数据流 / 调用关系
- 嵌入简短代码片段（5-30 行），不要贴大段代码
- 写成完整终态文档：禁止 "我研究了..."、"接下来我会..." 等过程性叙述
- 既解释 "代码做了什么"，更重要解释 "为什么这样设计"
- 篇幅：约 800-1500 行 markdown

【输出路径】{{OUTPUT_PATH}}

【本章主题】{{CHAPTER_TOPIC_TITLE}}

【必须涵盖】
1. {{ITEM_1}}
2. {{ITEM_2}}
...
（按重要性排序，每个 item 一两句具体描述要覆盖的内容）

【关键代码入口（提示）】
- `{{FILE_1}}` — {{ROLE_1}}
- `{{FILE_2}}` — {{ROLE_2}}
（让 agent 不用从头探索；列举 2-5 个起点足够）

完成后简短报告：文件路径 + 主要小节列表，<150 字。
```

## Use guidance

- **{{PROJECT_NAME}}**: friendly name (e.g., "vLLM", "hermes-agent")
- **{{CODEBASE_PATH}}**: absolute path on disk
- **{{LANGUAGE}}**: "简体中文" / "English" / "bilingual"
- **{{ONE_PARAGRAPH_PROJECT_DESCRIPTION}}**: from upstream README, 2-4 sentences
- **{{LANGUAGE_OR_TECH_STACK}}**: e.g., "Python 的资深工程师"
- **{{CHAPTER_TOPIC_TITLE}}**: e.g., "调度器（V1 Scheduler）"
- **{{ITEM_N}}**: bullet points of what must be covered — be specific
- **{{FILE_N}}**: 2-5 key files where the agent should start reading

## Best practices

1. **One agent per 1-3 chapters** — large enough to do meaningful work, small enough to stay focused
2. **Provide entry-point files** — saves the agent 5-10 minutes of exploration
3. **Cite the lock commit** — every agent prompt restates the analyzed commit
4. **Specify length** — without this, agents write either 300 lines (too thin) or 3000 lines (too bloated)
5. **Forbid process narration** — explicit "no 我研究了" yields cleaner output

## Verification after agent return

- Check file exists and reasonable size (`wc -l <path>`)
- Spot-check 3-5 `file:line` refs — line numbers must exist in source at the locked commit
- Read intro paragraph + one section — must be content, not process narration
- Verify 8+ external references (file:line refs) per chapter

If quality is low, re-dispatch with stricter prompt (more specific items, smaller scope).
