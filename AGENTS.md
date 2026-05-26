# codebase-wiki — guide for Claude / human collaborators

This repo has two halves:

1. **The skill** — `SKILL.md` + `templates/` + `reference/`. Claude reads these to generate `.wikipkg.tar.gz` packages from a target codebase.
2. **The service** — `server/` + `viewer/` + `shared/` + `tools/wikipkg/`. Node + Hono + SQLite + TS viewer. Consumes the packages.

> **Legacy notice**: the previous static-site flow (self-contained HTML+JS wiki for GitHub Pages, no service) lives on the `legacy-static-site` branch (tag `v1-last`). That branch is in maintenance mode. Main is the new wikipkg + service architecture (tag `v2.0` for the cutover).

## Entry point

`SKILL.md` — read this first when invoked. It describes the 7 phases of wikipkg generation.

## Repo layout

```
SKILL.md                — skill spec (7 phases for wikipkg generation)
README.md               — user-facing project intro
INSTALL.md              — install / branch-switching instructions
AGENTS.md               — this file

reference/              — methodology + on-disk contracts (Claude reads at relevant phases)
  wikipkg-format.md     — authoritative wikipkg data contract
  trace-tour-design.md  — how to pick the trace target + step list
  chapter-planning.md   — how to cut any codebase into ~12 chapters
  8-section-template.md — problem-first tour step structure

templates/              — prompt templates + SVG style guide (Claude substitutes placeholders + dispatches agents)
  chapter-prompt.md
  tour-overview-prompt.md
  tour-step-prompt.md
  chapter-quiz-prompt.md
  svg-style-guide.md

shared/                 — TS workspace: zod schemas (Manifest / Quiz / Glossary / common)
                          consumed by server, viewer, and the wikipkg CLI
tools/wikipkg/          — TS workspace: `wikipkg validate <dir>` / `wikipkg pack <dir> <out>` CLI
server/                 — Node + Hono service (auth + upload + content delivery + quiz + progress + addenda + search + HTML shell)
viewer/                 — vanilla TS bundle: history-API router + 11 components + 9 pages, served by server at /static/

examples/
  sample-wikipkg/       — minimal fixture (tiny-counter), used as fixture by server integration tests

docs/
  specs/                — design docs (problem-first)
  plans/                — step-by-step implementation plans
  decisions/            — ADR-style decision records
```

## Conventions

- **Testing**:
  - **Skill content** (`SKILL.md`, `templates/`, `reference/`): no automated tests. Verification is `node --check`, `grep`, `wc -l`, `python3 -m json.tool`, and manual review.
  - **TypeScript workspaces** (`shared/`, `tools/wikipkg/`, `server/`, `viewer/`): use **vitest** for unit + lightweight integration tests. Run via `npm test --workspace <name>`, or `npm test` from root to run all.
- **Default output language: Chinese (Simplified).** User may override per-wiki via Phase 0 LANGUAGE.
- **Commit style:** single-line summary, no Conventional Commits prefix, no body unless the change has non-obvious context. See `git log --oneline -20` for examples. No Co-Authored-By trailer.
- **No emojis in generated wiki content** unless user explicitly asks.
- **Branching**: main = active development (new flow). `legacy-static-site` = maintenance (old flow). Don't cross-pollinate without explicit reason.

## Where to look for "why"

- **What does X do?** → `SKILL.md` + the `reference/` doc cited from the relevant section.
- **Why was X designed this way?** → `docs/specs/` (problem-first design documents).
- **What was the implementation plan?** → `docs/plans/`.
- **Load-bearing decisions / contracts**:
  - `docs/specs/2026-05-25-codebase-wiki-service-design.md` — overall architecture spec for the wikipkg + service redesign. § "Wiki package 格式" is the data contract, also reflected in `reference/wikipkg-format.md`.
  - `docs/plans/2026-05-25-wiki-service-{A,B,C,D}-*.md` — 4 implementation plans that built the new architecture.

## Skills that have shaped this repo

The wikipkg + service redesign was built using `superpowers:brainstorming` → `superpowers:writing-plans` → `superpowers:subagent-driven-development`. New medium-sized features should follow the same loop.
