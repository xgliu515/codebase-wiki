# Decision: Q&A addenda persisted data contract

- Date: 2026-05-21
- Status: Accepted
- Related: `docs/specs/2026-05-20-codebase-wiki-qa-addenda-design.md`,
  `docs/decisions/2026-05-21-addenda-as-feedback-signal.md`,
  `reference/qa-addenda-flow.md` (the operational spec)

## Context

The Q&A addenda flow (shipped 2026-05-20) writes per-question records
into `<wiki>/web/js/chapters.js` and per-question markdown files into
`<wiki>/<NN><letter>-<slug>.md`. The original spec defined the record
schema as just `{id, title, question}` and routed failed-agent questions
to `<wiki>/.qa-failed.log`, which was in `.gitignore`.

A follow-up direction (see the sibling decision on "addenda as feedback
signal") plans to use accumulated questions as inputs to future chapter
generation. If we don't preserve enough metadata now, that feedback loop
will be lossy by the time we build it. Specifically:

- Failed questions in a gitignored log don't cross machines.
- Without a timestamp field, ordering / age survives only as long as
  no rebase / squash rewrites history.
- Without a structured "matched vs fallback" marker, we'd have to grep
  markdown bodies to find questions that didn't cleanly map to any
  chapter — those are exactly the topics that hint at poor chapter
  boundaries and matter most for re-generation.

## Decision

The schema is **append-only**: future fields may be added; existing
fields are never removed or renamed. Old wikis missing newer fields
must be treated as "field absent" by consumers, not errored on.

### Successful addenda

Stored as objects in the parent chapter's `addenda` array in
`<wiki>/web/js/chapters.js`. Companion markdown at `<wiki>/<id>.md`.

| Field | Required | Purpose |
|-------|----------|---------|
| `id` | yes | filename basename + routing id (`<NN><letter>-<slug>`) |
| `title` | yes | display name in sidebar nesting + parent's "延伸阅读" link |
| `question` | yes | original user question text, verbatim — the load-bearing signal for future feedback-loop generation |
| `asked_at` | yes | ISO date `YYYY-MM-DD` when processed; survives rebase / squash where git timestamps don't |
| `classification` | yes | `'matched'` if Phase 1 LLM assigned a parent confidently, or `'fallback'` if mounted on the lowest-num chapter for lack of fit |

### Failed addenda

Records of questions whose agents failed (no file produced, < 50 lines,
or 0 file:line refs) live in `<wiki>/.qa-history.jsonl` — JSONL, one
object per line, **tracked in git** (NOT gitignored). Each record
carries all five successful fields plus:

| Field | Required | Purpose |
|-------|----------|---------|
| `status` | yes | `'failed'` (only value for now; reserved for future) |
| `reason` | yes | short string, e.g. `'no file produced'` / `'< 50 lines'` / `'0 file:line refs'` |
| `parent_chapter_id` | yes | chapter the question was classified to — feedback-loop generation needs to know where to inject even without an answer |

## Consequences

**Commits we are making:**

- The schema is now a load-bearing contract. Any future change to the
  Q&A flow that touches what gets written must preserve all five
  success fields and all eight failure fields.
- `.qa-history.jsonl` is tracked in git on every wiki repo where the
  Q&A flow runs. Wiki owners who want privacy on failed questions
  must explicitly opt out (manual `.gitignore` entry, not a default).
- Future feedback-loop generation reads from **two sources**:
  `chapters.js` `addenda` arrays (successful) and `.qa-history.jsonl`
  (failed). Both must be iterated.

**What this rules out:**

- Renaming `.qa-history.jsonl` once it ships (would orphan old wikis).
- Treating addenda metadata as ephemeral / regenerable from markdown.
  Markdown is the answer; metadata is the question + provenance, and
  the latter cannot be reconstructed from the former.

**Migration path for wikis created before 2026-05-21:**

- Such wikis have addenda records with only `{id, title, question}`.
  Consumers must treat missing `asked_at` / `classification` as absent,
  not erroneous. No retroactive backfill is required — the contract is
  forward-only.
- Such wikis may have `.qa-failed.log` files. The Q&A flow will, on
  next run against such a wiki, migrate them into `.qa-history.jsonl`
  by reading each line and emitting a JSONL record (best-effort, since
  the old log was free-form text).

## Authoritative location

The runtime-facing description of these fields lives in
`reference/qa-addenda-flow.md` under "Persisted addendum metadata".
This decision document explains *why* the fields exist; the reference
doc explains *how* the flow writes them. Keep both in sync.
