# wikipkg format reference

The **wikipkg** (`.wikipkg.tar.gz`) is the on-disk artifact produced by the codebase-wiki skill and consumed by the codebase-wiki service. This document is the **authoritative contract**: anything not specified here is undefined behavior.

For the **why** behind these decisions, see `docs/specs/2026-05-25-codebase-wiki-service-design.md` (§2).

## File name

```
<subject-slug>-<version-label>.wikipkg.tar.gz
```

- `<subject-slug>` matches `^[a-z0-9][a-z0-9-]{0,63}$`
- `<version-label>` matches `^[a-zA-Z0-9][a-zA-Z0-9.\-+]{0,63}$` (accepts both SemVer like `v0.22.0` and branch-shortSHA like `main-a1b2c3d`)
- Double extension `.wikipkg.tar.gz` is a recognition hint

## Tarball layout

The tarball has **no top-level directory** — files are at the root:

```
manifest.json
chapters/<chapter-slug>.md
tours/<tour-slug>/00-overview.md
tours/<tour-slug>/NN-<step-slug>.md
quizzes/<chapter-slug>.json
figures/<figure-slug>.svg
glossary.json
meta/README.md            (optional)
meta/CHANGELOG.md         (optional)
```

File names are slugs; **ordering is governed by `manifest.json`, not file names**.

## manifest.json

Authoritative schema: `@codebase-wiki/shared` → `ManifestSchema`.

```json
{
  "schema_version": "1.0",
  "content_type": "codebase",
  "subject": { "slug": "...", "name": "...", "language": "zh-CN" },
  "wiki_version": {
    "label": "...",
    "generated_at": "<ISO8601>",
    "generator": { "name": "codebase-wiki", "version": "..." }
  },
  "source": {
    "type": "codebase",
    "codebase": {
      "repo_url": "https://...",
      "target_ref": "...",
      "target_commit": "<short-or-full SHA>",
      "deep_link_template": "https://.../blob/{commit}/{path}#L{line}"
    }
  },
  "chapters": [
    { "id": "...", "order": 1, "title": "...", "path": "chapters/....md",
      "estimated_minutes": 12, "quiz_path": "quizzes/....json", "tags": [] }
  ],
  "tours": [
    { "id": "...", "title": "...", "overview_path": "...",
      "steps": [{ "order": 1, "title": "...", "path": "..." }] }
  ],
  "glossary_path": "glossary.json",
  "figures": [{ "id": "...", "path": "figures/....svg", "title": "..." }]
}
```

### Identifier stability rule

`chapters[].id`, `tours[].id`, `figures[].id`, `glossary.terms[].id`, and quiz `questions[].id` are **stable across regenerations of the same subject** when the underlying content is unchanged. Service-side user state (progress, attempts, addenda) is keyed by these ids. Renaming an id breaks user history for that resource — treat it as a content deletion + creation.

## quizzes/<chapter-slug>.json

Authoritative schema: `QuizSchema`.

```json
{
  "schema_version": "1.0",
  "chapter_id": "<must match manifest.chapters[].id>",
  "questions": [
    {
      "id": "<chapter-slug>-q<N>",
      "type": "mcq-single" | "mcq-multi",
      "stem": "...",
      "options": [
        { "id": "a", "text": "..." },
        { "id": "b", "text": "..." }
      ],
      "answer": ["a"],
      "explanation": "...",
      "references": [{ "chapter_id": "...", "anchor": "..." }],
      "difficulty": "easy" | "medium" | "hard",
      "tags": []
    }
  ]
}
```

- `answer` is always an array, even for `mcq-single` (length 1)
- Each `answer[i]` must reference an existing `options[].id`
- Option ids are single lowercase letters (`a`-`h`)
- Question ids: `<chapter-slug>-q<N>` convention; stable across regenerations

## glossary.json

```json
{
  "schema_version": "1.0",
  "terms": [
    {
      "id": "kv-cache",
      "term": "KV cache",
      "aliases": ["key-value cache"],
      "definition": "...",
      "see_also": ["paged-attention"]
    }
  ]
}
```

`see_also` refers to other `terms[].id` values. Dangling references are tolerated (viewer skips silently).

## figures/*.svg

- **No `<script>` tags** — rejected at upload
- **No inline `<style>` tags** — rejected at upload (theme is injected by viewer via CSS variables)
- Stroke/fill should use `currentColor` or `data-role="..."` attributes so viewer CSS can theme them

## meta/ (optional)

- `meta/README.md`: human-readable summary of this wikipkg
- `meta/CHANGELOG.md`: notable changes between versions
- Service ignores these for now; they exist for human consumption

## Schema versioning

`schema_version` is `MAJOR.MINOR`:

- **MINOR** bump: additive-only (new optional fields). Consumers ignore unknown additive fields.
- **MAJOR** bump: breaking. Consumers must declare explicit support.

See `docs/specs/2026-05-25-codebase-wiki-service-design.md` for the full compatibility matrix.

## Validation

Use `wikipkg validate <dir>` to check a wikipkg before packing:

```bash
node tools/wikipkg/dist/cli.js validate examples/sample-wikipkg
```

Then pack:

```bash
node tools/wikipkg/dist/cli.js pack examples/sample-wikipkg ./out/<subject>-<version>.wikipkg.tar.gz
```
