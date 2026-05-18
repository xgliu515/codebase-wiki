---
name: codebase-wiki
description: Generate a problem-first interactive learning wiki for any software codebase. Use when the user wants to deeply learn a codebase, produce educational documentation, or build internal onboarding material. Produces 10-15 reference chapters + a single-request narrative trace tour + SVG figures + interactive web viewer (sidebar, glossary panel, full-text search, GitHub deep-links locked to a specific commit). Default language Chinese; user can override.
---

# codebase-wiki skill

You are helping a user **deeply learn a codebase by generating a two-layer educational wiki** for it:

- **Layer 1 — Reference manual**: 10-15 chapters covering subsystems comprehensively
- **Layer 2 — Trace tour**: 15-20 problem-first narrative steps following one minimum-viable real request through the entire stack
- **Layer 3 — Interactive web viewer**: sidebar, glossary panel, full-text search, GitHub deep-links

This skill is the result of iteratively building such a wiki for vLLM (see `examples/vllm-wiki.md`). The methodology, agent prompt templates, web shell, and SVG style guide are battle-tested.

---

## Phase 0: Detect mode + gather inputs (do this first)

A wiki repo holds **multiple versions** of the target codebase, one
self-contained `v<x>/` subdirectory each. See `reference/versioning.md`.

**First, probe the output directory** to pick a mode:

| Detected | Mode | Meaning |
|----------|------|---------|
| Directory missing / empty, no `versions.json` | fresh | Build a new versioned repo |
| `versions.json` present | append | Add a new version to an existing wiki |
| Root-level `index.html` + `web/js/chapters.js`, no `versions.json` | migrate | Old flat-layout wiki — migrate, then append |

Ask the user **one question at a time** (no batches):

1. **Codebase path**: absolute path on disk (used to read source for `file:line` refs)
2. **Output directory**: where the wiki repo is / will be
3. **Project name + GitHub repo** (fresh mode only — append/migrate reuse the existing value): e.g., `vllm` + `vllm-project/vllm`
4. **Wiki language** (fresh mode only): Chinese (default) / English / bilingual
5. **Lock version**: confirm `git rev-parse --short HEAD` of the codebase as the analyzed commit, or let user specify a tag

In **append / migrate** mode, read the existing `versions.json` (append)
or old `web/js/chapters.js` (migrate) and tell the user which versions
already exist and which one this run will add.

**Derive the version directory name** from the locked version:
`git describe --tags --exact-match HEAD` → use the tag (`v0.22.0/`);
otherwise `<branch>-<shortSHA>` (`main-a1b2c3d/`). If that directory
already exists, ask the user to overwrite or rename — never silently overwrite.

Confirm before proceeding. Save inputs to memory if persistent.

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

## Phase 2: Design the trace tour

Pick **one minimum-viable use case** that exercises the full stack. Examples:

- vllm: `LLM("Qwen2.5-7B").generate(["hello"], max_tokens=3)`
- hermes-agent: a single CLI message → tool call → response
- a web framework: one HTTP request from socket accept to response write
- a database: `SELECT * FROM t WHERE id=1` from parse to row return

Criteria for picking:
- **Minimum complexity**: no advanced features (TP, multimodal, quant for vllm; no agents-of-agents for hermes; no JOIN for database)
- **Real**: must actually work end-to-end, not contrived
- **Touches all layers**: skipping a layer means a trace step is empty

Confirm with user. Then **list ~15-20 steps** as a state-evolution table (see `reference/trace-tour-design.md`).

---

## Phase 3: Generate content

Use **parallel agents** (dispatching-parallel-agents skill). For each agent, give:

- The chapter/step **inputs** (which files, what to cover)
- The template (`templates/chapter-prompt.md` or `templates/tour-step-prompt.md`)
- Strict format rules (8-section template for tour; standard markdown for chapters)
- Output path

Recommended dispatch:
- 5-6 agents for chapters (group adjacent chapters per agent)
- 5-6 agents for tour steps (group adjacent steps per agent)
- All in **one parallel batch** (single message, multiple Agent tool uses)

**Quality bar**: each chapter ~800-1500 lines, each tour step ~120-200 lines. `file:line` refs everywhere. Code excerpts 5-30 lines max.

---

## Phase 4: Set up the web viewer

All generated output for this version — `index.html`, every `.md` file,
and the `web/` directory — goes into the **version subdirectory `v<x>/`**,
not the repo root. Copy `templates/web/` (including `web/js/versions.js`)
into `v<x>/web/`, and copy `templates/index.html` into `v<x>/index.html`.
Then customize:

1. **`web/js/chapters.js`** (the only JS file requiring per-project edits — all other
   `web/js/*.js` import the constants below, so do **not** hardcode the project name anywhere else):
   - `PROJECT_NAME` → friendly name, e.g., `vLLM` (used in page titles, home page, GitHub link labels)
   - `PROJECT_GITHUB_REPO` → e.g., `vllm-project/vllm`
   - `ANALYZED_COMMIT` → e.g., `086749736`
   - `ANALYZED_TAG` → e.g., `v0.21.1rc0+35`
   - `ANALYZED_DATE` → e.g., `2026-05-17`
   - `PROJECT_TAGLINE` → one-line home page subtitle
   - `PROJECT_FOCUS` → focus scope shown on the home page, e.g., `V1 架构`; leave `''` to hide it
   - `TRACE_TARGET` → the minimum-viable request the trace tour follows, e.g., `llm.generate(["你好"], max_tokens=3)`
   - `CHAPTERS` array → 10-15 entries matching what you generated
   - `TOURS` array → 15-20 entries matching tour steps (tour-00-overview + steps)
   - `STORAGE_PREFIX` is auto-derived from `PROJECT_NAME` — no edit needed

2. **`web/js/architecture.js`**: rewrite the 4-layer SVG to match this project's architecture

3. **`index.html`**: replace the `{{PROJECT_NAME}}` placeholders (title + brand) with the project name

4. **`web/serve.sh`**: generic, no edit needed — only touch it to change the default port if you
   want multiple wikis running concurrently

5. **Top-level `index.html`** is the entry point. Test: `cd <output> && python3 -m http.server 8765` then visit `http://localhost:8765/`

---

## Phase 5: Add SVG figures (iterative)

ASCII figures are fine in v1. SVG upgrade is a separate pass. When ready:

- Read `templates/svg-style-guide.md` and follow it strictly
- Convert ASCII figures inside ` ```text ` fences to inline `<svg>` with `<details>` keeping the original ASCII
- **Common bugs**:
  - SVG with internal blank lines → marked breaks parsing
  - SVG with HTML comments `<!--` → marked breaks parsing
  - `<details>` unclosed → swallows rest of document
  - Glossary script entering SVG → corrupts `<text>` elements (glossary already skips SVG in `templates/web/js/glossary.js`)

Each SVG: hand-write or dispatch agent with style guide attached.

---

## Phase 6: Glossary chapter

Write the last reference chapter as a structured glossary:
- 30-50 terms, alphabetical, each with: English name, Chinese name, definition, code location (`file:line`)
- The glossary parser in `templates/web/js/glossary.js` expects this exact structure (see `reference/glossary-format.md`)

Plus a FAQ section (10-15 common questions) and an environment-variables / common-commands appendix.

---

## Phase 7: Publish (versioned)

The repo root holds the version selector + manifest; each version lives
in its own `v<x>/`. See `reference/versioning.md`.

### Fresh mode

- `v<x>/`: the full wiki built in Phases 3-6.
- Top-level `index.html`: copy `templates/version-index.html`, replace `{{PROJECT_NAME}}`.
- Top-level `selector.css`: copy `templates/selector.css` (no edits).
- Top-level `versions.json`: copy `templates/versions.json`, fill the single entry (`latest: true`).
- `README.md`: from `templates/readme.md.tmpl`; `LICENSE` from `templates/license.tmpl`; `.gitignore` from `templates/gitignore.tmpl`.
- `git init -b main && git add -A && git commit -m "initial release"`
- Push to the user's GitHub repo (confirm before pushing).
- **Enable GitHub Pages**: `gh api -X POST /repos/<owner>/<repo>/pages -f "source[branch]=main" -f "source[path]=/"`
- Live URL: `https://<owner>.github.io/<repo>/`

### Append mode

- Add the new `v<x>/` directory.
- Edit `versions.json`: push the new entry to the **head** of the `versions`
  array, set its `latest` to `true`, and flip every other entry's `latest` to `false`.
- Do **not** touch the top-level `index.html` / `selector.css` — they are
  static and driven by `versions.json`.
- `git add -A && git commit -m "add wiki for <version>"` and push (confirm first).

### Migrate mode

Before any file move, **tell the user** which directory the old wiki will
move into and **get confirmation**. Then:

- Read the old `web/js/chapters.js` (`ANALYZED_TAG` / `ANALYZED_COMMIT` /
  `ANALYZED_DATE` / `PROJECT_NAME` / `PROJECT_GITHUB_REPO`) and derive the
  migrated version's directory name.
- `git mv` the root-level `index.html`, all `.md`, and `web/` into
  `v<derived>/`. Keep `README.md` / `LICENSE` / `.gitignore` at the root.
- Inject the version dropdown into `v<derived>/`: copy in
  `web/js/versions.js`, add the `<select id="version-switcher">` to its
  `index.html` topbar, add the import + `initVersionSwitcher()` call to its
  `web/js/app.js`, and add the `.version-switcher` rule to its
  `web/css/style.css`. Do not touch chapter `.md` content.
- Write the top-level `index.html`, `selector.css`, and `versions.json`
  (single entry = the migrated version).
- Then proceed exactly as **append mode** to add this run's new version.

See `reference/versioning.md` for the full naming rule and error handling.

---

## Important behaviors

- **Problem-first, no bare conclusions**: Always explain by problem → naive attempt → why fails → actual design. Never start with "X works like this:".
- **Lock to a commit**: All `file:line` refs reference a specific commit. Bumping the commit means re-verifying chapters.
- **Autonomous v1, then iterate**: For personal-use wikis, don't pause to confirm minor decisions. Ship a working v1, then user iterates.
- **Use the dispatching-parallel-agents skill** when you have 5+ independent file generations.
- **No emojis in output content** unless the user explicitly asks.

## Pitfalls (from real experience)

1. **SVG inside markdown breaks** on blank lines OR HTML comments. Strip both before commit.
2. **Permission prompts pile up** when dispatching 6+ agents in parallel; user may accidentally deny some. Confirm completion by checking file state, not by trusting agent return messages.
3. **GitHub Pages URL with hash-routing**: works fine, but `vscode://` links won't work for visitors. Default to GitHub deep-links; offer local-VSCode as opt-in toggle.
4. **viewBox sizing**: pure `max-width: 100%` makes SVGs stretch huge on wide screens. Cap `max-width` at design width (~760-880px).
5. **LaTeX math**: marked doesn't render `$..$` by default. Add `marked-katex-extension` if the project has formulas.

## Reference files

- `reference/8-section-template.md` — the problem-first tour step structure
- `reference/trace-tour-design.md` — how to pick a trace target + step list
- `reference/chapter-planning.md` — how to cut any codebase into ~12 chapters
- `reference/workflow.md` — complete step-by-step
- `reference/versioning.md` — multi-version layout, naming rule, fresh/append/migrate modes
- `templates/svg-style-guide.md` — colors, conventions, naming for figures
- `templates/chapter-prompt.md` — agent prompt for reference chapter generation
- `templates/tour-step-prompt.md` — agent prompt for tour step generation
- `examples/vllm-wiki.md` — pointer to the reference implementation at github.com/xgliu515/vllm-wiki
