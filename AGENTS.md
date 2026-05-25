# codebase-wiki — guide for Claude / human collaborators

This repo is a **Claude Code skill**, not an application. It generates
problem-first interactive learning wikis for arbitrary codebases. The
output is a mono-repo of generated wikis (HTML + markdown + vanilla
ES modules); this repo holds the methodology + templates + skill
instructions.

## Entry point

`SKILL.md` — read this first when invoked. It describes the 7 phases
of wiki generation + the import flow + the Q&A addenda flow (4 distinct
entry modes total).

## Repo layout

```
SKILL.md                — main skill spec (entry mode dispatch + phases)
reference/              — methodology + on-disk contracts
  wikipkg-format.md     — wikipkg data format reference (the contract)
templates/              — copied verbatim into each generated static-site wiki
  web/                  — viewer (JS + CSS, no build step)
  *-prompt.md           — agent prompt templates (now incl. chapter-quiz-prompt)
shared/                 — TS workspace: zod schemas, consumed by wikipkg CLI + future service/viewer
tools/wikipkg/          — TS workspace: `wikipkg validate` / `wikipkg pack` CLI
examples/
  sample-wikipkg/       — minimal fixture (tiny-counter), used by codebase-wiki service tests
docs/
  specs/                — design docs
  plans/                — implementation plans
  decisions/            — ADR-style decision records
INSTALL.md              — user-facing install instructions
```

## Conventions

- **Testing**:
  - **Skill content** (SKILL.md, templates/, reference/): no automated tests. Verification is `node --check`, `grep`, `wc -l`, `python3 -m json.tool`, and manual browser inspection.
  - **TypeScript workspaces** (`shared/`, `tools/wikipkg/`, future `server/` and `viewer/`): use **vitest** for unit + lightweight integration tests. Run via `npm test --workspace <name>`.
- **No build step.** All JS in `templates/web/js/` is hand-written
  vanilla ES modules. Imports are relative paths or CDN URLs.
- **Default output language: Chinese (Simplified).** User may override
  per-wiki.
- **Commit style:** single-line summary, no Conventional Commits prefix,
  no body unless the change has non-obvious context. See
  `git log --oneline -20` for examples.
- **No emojis in generated wiki content** unless user explicitly asks.

## Where to look for "why"

- **What does X do?** → `SKILL.md` + the `reference/` doc cited from
  the relevant section.
- **Why was X designed this way?** → `docs/specs/` (problem-first
  design documents).
- **What was the implementation plan?** → `docs/plans/`.
- **What load-bearing decisions / contracts shape this codebase?** →
  `docs/decisions/`. **Read these before changing data formats or
  cross-version contracts.** The current decisions:
  - `2026-05-21-addenda-data-contract.md` — Q&A addenda schema is
    append-only; `.qa-history.jsonl` is tracked in git
  - `2026-05-21-addenda-as-feedback-signal.md` — addenda are quality
    feedback for future chapter generation, not just supplementary
    content
  - `2026-05-25-codebase-wiki-service-design.md` (spec) — full service+data redesign;
    introduces `.wikipkg.tar.gz` as a versioned, immutable data artifact distinct from
    the legacy static-site output. See § "Wiki package 格式" for the data contract
    (also reflected verbatim in `reference/wikipkg-format.md`).

## Skills that have shaped this repo

The `qa-addenda` work was built using `superpowers:brainstorming` →
`superpowers:writing-plans` → `superpowers:subagent-driven-development`
→ `superpowers:finishing-a-development-branch`. New medium-sized
features should follow the same loop.
