# Glossary chapter format (English)

The last reference chapter (typically `12-glossary-and-faq.md`) must follow this structure so that the runtime glossary parser (`web/js/glossary.js`) can extract terms and provide the term-popup feature.

## Required structure

```markdown
# Chapter N: Glossary & FAQ

<intro paragraph>

---

## Part 1: Glossary

### TermName
- Original name: `OfficialEnglishName`
- Definition: <1-3 sentences>
- Source: `path/to/file.py:123` defines `class TermName`; `path/to/other.py:456` main caller.

### NextTermName
- Original name: `...`
- Definition: ...
- Source: ...

...
```

## Parser rules (DO NOT BREAK)

- Each term entry is a `### Heading` followed by 3 bullets in order: **Original name** / **Definition** / **Source**
- The H3 heading text can have parenthetical alternates: `### Backend (attention backend)` — both "Backend" and "attention backend" become matchable variants
- Multiple equivalents with slash: `### Guided Decoding / Structured Output` — both become primary terms
- Abbreviations in parens: `### Data Parallelism (DP)` — both full and abbreviation become variants
- The Original name field can include backticks for inline code styling

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
## Part 2: FAQ

### How does the V1 architecture differ from V0? Why was it rewritten?

<2-4 sentences with file:line refs>

### How do I add a new model? What interfaces must I implement?

<...>
```

H3 questions, answered in 2-4 sentences each, with `file:line` refs.

## Part 3: Cheat sheet appendix

```markdown
## Part 3: Debug & dev cheat sheet

### Environment variables

| Variable | Default | Effect |
|----------|---------|--------|
| `PROJECT_LOG_LEVEL` | `INFO` | Log level |
| ... | ... | ... |

### Benchmark / test commands

```bash
# Run a single test
pytest tests/path/to/test_x.py::test_y -v

# Benchmark throughput
...
```

### Test directory map

| Directory | Contents |
|-----------|----------|
| `tests/v1/...` | V1 architecture tests |
| ... | ... |
```

## Cross-references from glossary

Encourage `file:line` refs in definitions. They become clickable links in the wiki, helping readers verify the term's location in source.

## Note on Chinese translation field

This English schema **omits** the `- Chinese translation: ...` bullet that the Chinese schema (`glossary-format.md`) requires. The runtime parser tolerates both schemas; English glossaries simply won't render that field even if it appeared.
