# Glossary chapter format

The last reference chapter (typically `12-glossary-and-faq.md`) must follow a specific structure so that the runtime glossary parser (`web/js/glossary.js`) can extract terms and provide the term-popup feature.

## Required structure

```markdown
# 第 N 章 术语表与 FAQ

<intro paragraph>

---

## Part 1：术语表

### TermName
- 英文原名：`OfficialEnglishName`
- 中文译名：中文名
- 定义：<1-3 sentences>
- 代码位置：`path/to/file.py:123` 定义 `class TermName`，`path/to/other.py:456` 主调用入口。

### NextTermName
- 英文原名：`...`
- 中文译名：...
- 定义：...
- 代码位置：...

...
```

## Parser rules (DO NOT BREAK)

- Each term entry is a `### Heading` followed by 4 bullets in order: 英文原名 / 中文译名 / 定义 / 代码位置
- Label form: either `- 定义: ...` or `- **定义**: ...` — the parser tolerates `**` wrappers around all four canonical labels
- **Extra bullets** like `- 别名: ...`, `- 参见: ...`, `- 示例: ...` are tolerated — the parser ignores any label it doesn't recognize. Use freely for human readers; they won't appear in the term popup but render in the chapter body
- The H3 heading text can have parenthetical alternates: `### Backend（attention backend）` — both "Backend" and "attention backend" become matchable variants
- Multiple equivalents with slash: `### Guided Decoding / Structured Output` — both become primary terms
- Abbreviations in parens: `### Data Parallelism (DP)` — both full and abbreviation become variants
- The English name field can include backticks for inline code styling
- The Chinese name field is also treated as a variant for matching

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
## Part 2：FAQ

### V1 和 V0 架构的核心区别是什么？为什么要重构？

<2-4 sentences with file:line refs>

### 如何添加一个新模型？需要实现哪些接口？

<...>
```

H3 questions, answered in 2-4 sentences each, with `file:line` refs.

## Part 3: Cheat sheet appendix

```markdown
## Part 3：调试与开发速查

### 环境变量

| 变量 | 默认 | 作用 |
|------|------|------|
| `PROJECT_LOG_LEVEL` | `INFO` | 日志等级 |
| ... | ... | ... |

### Benchmark / 测试命令

```bash
# Run a single test
pytest tests/path/to/test_x.py::test_y -v

# Benchmark throughput
...
```

### 测试目录速查

| 目录 | 内容 |
|------|------|
| `tests/v1/...` | V1 架构相关 |
| ... | ... |
```

## Cross-references from glossary

Encourage `file:line` refs in definitions. They become clickable links in the wiki, helping readers verify the term's location in source.

## Example

See `12-glossary-and-faq.md` in [xgliu515/vllm-wiki](https://github.com/xgliu515/vllm-wiki) for a working 49-term + 15-FAQ implementation.
