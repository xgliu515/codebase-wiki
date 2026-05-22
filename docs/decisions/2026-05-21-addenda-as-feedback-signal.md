# Decision: Q&A addenda are a quality feedback signal, not just supplementary content

- Date: 2026-05-21
- Status: Accepted (philosophy); feedback-loop generation NOT YET implemented
- Related: `docs/specs/2026-05-20-codebase-wiki-qa-addenda-design.md`,
  `docs/decisions/2026-05-21-addenda-data-contract.md`,
  `reference/qa-addenda-flow.md`

## Context

When the Q&A addenda flow shipped on 2026-05-20, addenda were framed as
**supplementary content** — a way for users to ask focused questions
about an already-generated wiki and have the answers land as
deep-dive files attached to parent chapters. The viewer surfaces them
as collapsible sub-items in the sidebar.

That framing is correct but incomplete. A user observation on
2026-05-21 reframed it:

> 用户如果有新的问题,那就说明我们默认生成的 wiki 遗漏了用户关心的内容...
> 在新版本的生成上完全可以结合之前用户的问题来生成,这样质量才会越来越高。
> 甚至如果用户有需要,在积累了一定量的问题后,也可以要求我们在当前的版本
> 上重新生成。这才是这个需求的本质。

Every Q&A question carries two pieces of information:

1. The literal question — answered by the agent, written as an addendum
   file. (Already implemented.)
2. The implicit signal "the default Phase 1 chapter exploration missed
   something I care about, and this is what." Accumulated across users
   and time, these signals are a better "what to cover" list than the
   skill's automatic exploration.

## Decision

We treat Q&A addenda as having **two identities**, not one:

| Identity | Realized as | Used by |
|----------|-------------|---------|
| Final-state artifact | `<NN><letter>-<slug>.md` + entry in parent's `addenda` array + sidebar UI | The current Q&A flow (Phase 1 - 4). Already shipped. |
| Intermediate-state feedback | The `question` field on every addendum record, plus all entries in `.qa-history.jsonl` | A future "feedback-loop generation" feature — chapters are regenerated with these questions injected into `chapter-prompt.md` as forced-coverage items. **Not yet implemented.** |

This is not a feature decision (no code change required to adopt it).
It is a framing decision: every product / data / scope discussion that
touches Q&A from now on assumes the feedback-loop interpretation is the
medium-term direction.

## Concrete commitments this implies

### Already done (the data-contract patch, 2026-05-21)

- Persist failed questions in `.qa-history.jsonl` (tracked in git),
  not `.qa-failed.log` (gitignored). Failed questions are the strongest
  signal — they're topics the user cared about that the agent
  couldn't even cover.
- Add `asked_at` (ISO date) and `classification` (`'matched'` /
  `'fallback'`) fields to every addendum record. Fallback-classified
  questions are exactly the topics that hint at miscut chapter
  boundaries.
- Document the schema as append-only — no removals, no renames.

See `docs/decisions/2026-05-21-addenda-data-contract.md` for the field
list.

### Future shape of the feedback-loop feature (when built)

Two operating modes, both consuming the same input data:

**Mode A — append-version with questions:** When the user runs
append-version mode to generate a new version of a wiki, Phase 1 reads
the prev-version's `chapters.js` and `.qa-history.jsonl`. For each
chapter being generated, all addenda + failed questions previously
classified to that chapter id are extracted and passed to the chapter
agent as a "must cover" appendix to the chapter prompt. The new
version's chapters bake in user interest signals from the start;
**ideally no addenda are needed in the new version** (or far fewer).

**Mode B — regenerate-in-place:** A new skill entry mode. The user
selects one or more chapters in the current version; the skill
regenerates them with the same prompt-extension as Mode A. After
regeneration, the corresponding addenda may be folded into the chapter
(deleted from disk + removed from `addenda` array) since their content
is now in the parent. Optionally retain them as historical record.

Both modes require no new data, just the existing addenda + history
files. That's why the data contract had to be locked down today.

### What this rules out

- Treating successful addenda as "the wiki is now complete" — they're
  drafts that, given enough signal, get promoted into chapter content.
- Discarding failed questions — they're MORE useful as signal than
  successful ones, because they identify gaps the system couldn't
  bridge automatically.
- Designing future Q&A enhancements without preserving the question
  text verbatim. Slugs / titles are derived; the question itself is
  the load-bearing field.

## Consequences

- Any future Q&A-adjacent feature discussion starts from "what does
  this do to the feedback signal?", not "what does this do to the
  addendum artifact?".
- `docs/decisions/2026-05-21-addenda-data-contract.md` is the
  load-bearing data dependency for any of this to work. Treat it as
  contract, not as documentation.
- The current `reference/qa-addenda-flow.md` describes the artifact
  flow only. When Mode A or Mode B ships, a corresponding reference
  doc must be added (and this decision doc upgraded from "Accepted
  (philosophy)" to "Accepted (implemented)").
