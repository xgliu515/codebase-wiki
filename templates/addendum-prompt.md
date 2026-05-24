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
- **{{LANGUAGE}}**: same as the wiki ("简体中文" / "English" / "bilingual"); supplied from Phase 0 LANGUAGE input (no fallback — value is always explicitly injected by the skill controller).
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
