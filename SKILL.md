---
name: codebase-wiki
description: Generate a problem-first interactive learning wiki for any software codebase as a `.wikipkg.tar.gz` package, ready to upload to a self-hosted codebase-wiki service for interactive browsing, per-chapter quizzes, progress tracking, and user Q&A. Produces 10-15 reference chapters + a single-request narrative trace tour + SVG figures + glossary + MCQ quizzes. Default language Chinese; user can override.
---

# codebase-wiki skill

You are helping a user **deeply learn a codebase by generating a two-layer educational wiki** for it:

- **Layer 1 — Reference manual**: 10-15 chapters covering subsystems comprehensively
- **Layer 2 — Trace tour**: 15-20 problem-first narrative steps following one minimum-viable real request through the entire stack
- **Layer 3 — Per-chapter MCQ quizzes**: 3-8 multiple-choice questions per chapter so the reader can self-check understanding

The final artifact is a single `.wikipkg.tar.gz` package, consumed by the **codebase-wiki service** (Node + Hono + SQLite, in `server/` of this repo). After admin uploads, users browse the wiki through a TS viewer served by the service.

This skill is the result of iteratively building such a wiki for vLLM. The methodology, agent prompt templates, and SVG style guide are battle-tested.

> **Looking for the legacy static-site flow** (self-contained HTML+JS wiki for GitHub Pages, no service required)? It's preserved on the `legacy-static-site` branch:
> ```bash
> git -C ~/.claude/skills/codebase-wiki checkout legacy-static-site
> ```
> That branch is in maintenance-only mode (bug fixes welcome, no new features).

---

## Phase 0: Gather inputs

Ask the user **one question at a time** (no batches):

1. **Codebase path**: absolute path on disk (used to read source for `file:line` refs)
2. **Output directory**: where to write the wikipkg working directory (e.g. `/tmp/<subject>-wikipkg/`). The final `.wikipkg.tar.gz` is produced from this dir in Phase 7.
3. **Subject identity**: slug (e.g. `vllm`) + name (e.g. `vLLM`) + one-line description + GitHub repo (e.g. `vllm-project/vllm`)
4. **LANGUAGE**: `zh-CN` (default) | `en`. Drives chapter prompt language (`zh-CN` → `简体中文`, `en` → `English`).
5. **Lock version**: confirm `git rev-parse --short HEAD` of the codebase as the analyzed commit, or let the user specify a tag. Output `wiki_version.label` = the tag if any, else `<branch>-<shortSHA>`.
6. **PRIMARY_TOUR_SLUG + PRIMARY_TOUR_TITLE**: kebab-case slug + human title for the wiki's primary trace tour. Default slug auto-derived from TRACE_TARGET (e.g. `llm.generate(...)` → `single-request`); default title `"单请求 Trace 导览"` (zh-CN) / `"Single-request trace tour"` (en).

Confirm before proceeding.

---

## Phase 1: Explore the codebase

Use the **Explore agent** (read-only, fast). Goal: figure out the natural chapter divisions. Look at:

- `README.md` and `AGENTS.md` / `CLAUDE.md` / `CONTRIBUTING.md` if present
- Top-level directory layout
- Major subsystems (entry points, core loops, data structures, executors, etc.)
- For an inference engine: layered execution (entrypoint → engine → scheduler → worker)
- For an agent framework: interface → orchestration → core loop → tools
- For a database: query → planner → executor → storage

Output: a draft 10-15 chapter outline. **Show user, let them edit.** Skip generic chapters that don't apply.

---

## Phase 2: Design the trace tour(s)

Pick **one minimum-viable use case** for the wiki's primary tour, then list ~15-20 steps as a state-evolution table. Examples:

- vllm: `LLM("Qwen2.5-7B").generate(["hello"], max_tokens=3)`
- hermes-agent: a single CLI message → tool call → response
- a web framework: one HTTP request from socket accept to response write
- a database: `SELECT * FROM t WHERE id=1` from parse to row return

Criteria for picking:
- **Minimum complexity**: no advanced features (TP, multimodal, quant for vllm; no agents-of-agents for hermes; no JOIN for database)
- **Real**: must actually work end-to-end, not contrived
- **Touches all layers**: skipping a layer means a trace step is empty

Confirm with user. Output: a state-evolution table (see `reference/trace-tour-design.md`).

If the user wants **multiple tours** (e.g. single-request + batched + streaming), pick the primary one first and document the others as follow-ups; tours can be added incrementally by repeating Phases 2-3 with a new tour slug.

---

## Phase 3: Generate content

Use **parallel agents** (dispatching-parallel-agents skill). For each agent, give:

- The chapter/step **inputs** (which files, what to cover)
- The template (`templates/chapter-prompt.md` or `templates/tour-step-prompt.md`)
- Strict format rules (8-section template for tour; standard markdown for chapters)
- Output path inside the wikipkg dir:
  - Chapters: `chapters/<chapter-slug>.md`
  - Tour overview: `tours/<tour-slug>/00-overview.md`
  - Tour steps: `tours/<tour-slug>/<NN>-<step-slug>.md`
- The `{{LANGUAGE}}` value: `简体中文` for `zh-CN` LANGUAGE, `English` for `en` LANGUAGE
- For tour step agents: `{{TOUR_SLUG}}`, `{{TOUR_TITLE}}`, `{{TOUR_TARGET}}`, `{{TOUR_STEP_COUNT}}`, `{{TOUR_STEP_LIST}}` — controller fills these from Phase 0 + Phase 2

Recommended dispatch:
- 5-6 agents for chapters (group adjacent chapters per agent)
- 5-6 agents for tour steps (group adjacent steps per agent)
- 1 agent for the tour overview file using `templates/tour-overview-prompt.md` — controller provides `{{STEP_TABLE}}` verbatim from Phase 2 so the overview doesn't drift from generated steps
- All in **one parallel batch** (single message, multiple Agent tool uses)

**Quality bar**: each chapter ~800-1500 lines, each tour step ~120-200 lines, tour overview ~150 lines. `file:line` refs everywhere. Code excerpts 5-30 lines max.

---

## Phase 4: Add SVG figures (iterative)

ASCII figures are fine in v1. SVG upgrade is a separate pass. When ready:

- Read `templates/svg-style-guide.md` and follow it strictly. The viewer's SVG theming rule is strict: **no inline `<style>` tags, no `<script>` tags**. Stroke/fill should use `currentColor` or `data-role="..."` attributes so viewer CSS variables can theme them.
- Place SVGs under `figures/<figure-slug>.svg` in the wikipkg dir
- Reference them from chapter markdown via standard `![alt](figures/<slug>.svg)` — the viewer resolves the relative path to an API URL at render time

Each figure becomes one entry in `manifest.json` `figures[]` (auto-generated in Phase 7).

**Common SVG bugs**:
- SVG with internal blank lines → marked breaks parsing
- SVG with HTML comments `<!--` → marked breaks parsing
- Glossary script entering SVG → corrupts `<text>` elements

---

## Phase 5: Glossary

Write a structured glossary as `glossary.json` (schema in `reference/wikipkg-format.md`):

- 30-50 terms
- Each term: `id` (slug), `term`, optional `aliases[]`, `definition`, optional `see_also[]` (other term ids)
- The viewer's GlossaryPanel renders this with recursive expansion + linked references

```json
{
  "schema_version": "1.0",
  "terms": [
    {
      "id": "kv-cache",
      "term": "KV cache",
      "aliases": ["key-value cache"],
      "definition": "Storage of attention keys/values across decoding steps...",
      "see_also": ["paged-attention", "block-manager"]
    }
  ]
}
```

FAQ / common commands / env-vars can go inside the glossary `definition` for relevant terms, or be added as supplementary chapters if substantial.

---

## Phase 6: Generate per-chapter MCQ quizzes

For each chapter:

1. Read the chapter markdown content
2. Dispatch a subagent with `templates/chapter-quiz-prompt.md`, substituting:
   - `{{CHAPTER_SLUG}}` → the chapter id (slug form)
   - `{{CHAPTER_TITLE}}` → the chapter title
   - `{{CHAPTER_CONTENT}}` → the full chapter markdown
3. Receive JSON output; write to `quizzes/<chapter-slug>.json` inside the wikipkg directory
4. Run `node tools/wikipkg/dist/cli.js validate <wikipkg-dir>` after **all** quizzes are written
5. If validation fails on any quiz JSON, re-dispatch that chapter's prompt with the validation error in the input
6. Loop until all quizzes validate

Quiz schema (per chapter): 3-8 MCQ questions, mix of `mcq-single` / `mcq-multi`, each with stem + options + `answer` array + `explanation`. See `reference/wikipkg-format.md` for the full contract.

---

## Phase 7: Build manifest + pack wikipkg

0. **One-time build of CLI** (if `tools/wikipkg/dist/cli.js` does not exist yet):
   ```bash
   cd /path/to/codebase-wiki && npm install && npm run build --workspace @codebase-wiki/shared && npm run build --workspace @codebase-wiki/wikipkg
   ```
   Skip this step on subsequent invocations once `dist/cli.js` is present.

1. Construct `manifest.json` in the wikipkg directory. Required structure (see `reference/wikipkg-format.md` for the authoritative schema):

   ```json
   {
     "schema_version": "1.0",
     "content_type": "codebase",
     "subject": { "slug": "...", "name": "...", "language": "zh-CN" },
     "wiki_version": {
       "label": "<tag-or-branch-shortsha>",
       "generated_at": "<ISO8601>",
       "generator": { "name": "codebase-wiki", "version": "2.0.0" }
     },
     "source": {
       "type": "codebase",
       "codebase": {
         "repo_url": "https://github.com/<owner>/<repo>",
         "target_ref": "<tag-or-branch>",
         "target_commit": "<short-or-full SHA>",
         "deep_link_template": "https://github.com/<owner>/<repo>/blob/{commit}/{path}#L{line}"
       }
     },
     "chapters": [ /* one entry per chapter md */ ],
     "tours": [ /* one entry per tour, with steps[] */ ],
     "glossary_path": "glossary.json",
     "figures": [ /* one entry per SVG */ ]
   }
   ```

2. Run `node tools/wikipkg/dist/cli.js validate <wikipkg-dir>` — fix any errors before packing
3. Run `node tools/wikipkg/dist/cli.js pack <wikipkg-dir> <subject-slug>-<version-label>.wikipkg.tar.gz`
4. Hand the resulting `.wikipkg.tar.gz` to the user. The user uploads it via the codebase-wiki service's admin UI (`/admin/upload`) or `POST /api/v1/admin/wikis`.

---

## Important behaviors

- **Problem-first, no bare conclusions**: Always explain by problem → naive attempt → why fails → actual design. Never start with "X works like this:".
- **Lock to a commit**: All `file:line` refs reference a specific commit. Bumping the commit means re-verifying chapters.
- **Identifier stability**: `chapters[].id`, `tours[].id`, `figures[].id`, `glossary.terms[].id`, and quiz `questions[].id` are **stable across regenerations of the same subject** when content is unchanged. Service-side user state (progress, attempts, addenda) is keyed by these ids. Renaming an id breaks user history for that resource — treat it as a content deletion + creation.
- **Autonomous v1, then iterate**: For personal-use wikis, don't pause to confirm minor decisions. Ship a working v1, then user iterates.
- **Use the dispatching-parallel-agents skill** when you have 5+ independent file generations.
- **No emojis in output content** unless the user explicitly asks.

## Pitfalls (from real experience)

1. **SVG inside markdown breaks** on blank lines OR HTML comments. Strip both before packing.
2. **Permission prompts pile up** when dispatching 6+ agents in parallel; user may accidentally deny some. Confirm completion by checking file state, not by trusting agent return messages.
3. **viewBox sizing**: pure `max-width: 100%` makes SVGs stretch huge on wide screens. Cap `max-width` at design width (~760-880px).
4. **LaTeX math**: marked doesn't render `$..$` by default. The viewer can add `marked-katex-extension` if a wiki has formulas — note it in `meta/README.md` so future viewer features cover it.
5. **Manifest path mismatch**: `manifest.json` paths must match actual file locations. The validator catches this, but always run validate before pack.

## Reference files

- `reference/wikipkg-format.md` — authoritative on-disk data contract (the package)
- `reference/8-section-template.md` — the problem-first tour step structure
- `reference/trace-tour-design.md` — how to pick a trace target + step list
- `reference/chapter-planning.md` — how to cut any codebase into ~12 chapters
- `templates/svg-style-guide.md` — colors, conventions, naming for figures
- `templates/chapter-prompt.md` — agent prompt for reference chapter generation
- `templates/tour-overview-prompt.md` — agent prompt for tour overview
- `templates/tour-step-prompt.md` — agent prompt for tour step generation
- `templates/chapter-quiz-prompt.md` — agent prompt for per-chapter MCQ quiz generation

## See also (in this repo, for the service side)

- `server/` — codebase-wiki service (Node + Hono + SQLite). Self-hosted; consumes the wikipkg you generate.
- `viewer/` — TS viewer (single bundle, served by `server/` at `/static/`)
- `shared/` — zod schemas shared between server, viewer, and wikipkg CLI
- `tools/wikipkg/` — the validate + pack CLI invoked in Phase 7
- `examples/sample-wikipkg/` — a minimal reference fixture (`tiny-counter`)
- `docs/specs/2026-05-25-codebase-wiki-service-design.md` — overall architecture spec for the service+data redesign
