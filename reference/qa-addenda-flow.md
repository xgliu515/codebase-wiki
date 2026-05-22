# Q&A addenda flow: add focused deep-dives to an existing wiki

This flow lets a user ask a batch of questions about an already-generated
wiki and have the answers land as new markdown files attached to the
right chapters. It runs entirely against an existing
`<mono-repo>/<project>/<version>/` directory and the source code at the
wiki's locked `ANALYZED_COMMIT`. The flow is a separate skill entry mode, peer to new-monorepo /
new-project / append-version (the import flow is its own peer entry
point).

For the design rationale and full spec see
`docs/specs/2026-05-20-codebase-wiki-qa-addenda-design.md`.

## Interaction model

Only two points need user input:

1. **Phase 0** — the user supplies the target wiki path, the source-code
   repo path, and a batch of questions.
2. **Phase 4** — the user confirms `git push` (or declines).

Everything between (chapter assignment, agent dispatch, content
generation, parent-chapter wiring, `chapters.js` update, local
`git commit`) is automatic. This matches the project's low-friction
philosophy (see memory `project_codebase_wiki_low_friction.md` in the
parent project memory).

## The five phases

### Phase 0: locate target wiki + source code

Ask the user (once, batched):

- **Target wiki path**: absolute `<mono>/<project>/<version>/` (or
  `<mono> + <project> + <version>` and derive). Verify
  `<path>/web/js/chapters.js` exists; reject otherwise.
- **Source repo path**: absolute path to the codebase's local git
  clone.
- **Questions**: paste in the conversation (separator: blank line OR
  `---`, both accepted) OR a path to a `questions.md` file (same
  separator rules).

Auto-extract from the target's `web/js/chapters.js`:

- `PROJECT_NAME` / `PROJECT_GITHUB_REPO` / `ANALYZED_COMMIT` /
  `ANALYZED_TAG` / `CHAPTERS`.

Reject if:

- Path doesn't exist or `chapters.js` missing.
- Wiki is not inside a mono-repo (no ancestor `projects.json`).
- `chapters.js` still contains `{{PROJECT_NAME}}`-style placeholders.
- `git -C <src> rev-parse <ANALYZED_COMMIT>` non-zero. **Do not auto
  `git fetch`** — tell the user to fetch manually and re-run.

Read source files via `git -C <src> show <ANALYZED_COMMIT>:<path>`. Do
not `cd` into the source repo and do not `git checkout`.

### Phase 1: auto-classify each question

In the main conversation (no agent dispatch; lightweight):

- Build context = each chapter's `{id, title, desc}` from `CHAPTERS`,
  **excluding** any chapter whose `id` matches `/glossary/i` (the
  glossary is structured data, not a free-form chapter).
- Ask the LLM to output a mapping `question_index → chapter_id` for the
  whole batch in one shot (one LLM call, all questions).
- If the LLM can't match a question to any chapter, fall back to the
  chapter with the lowest `num` value in CHAPTERS (typically the
  architecture-overview chapter) and prepend a note to that addendum:
  `_本问题未匹配到具体章节,挂在<parent-title>之下_`.

Print the resulting assignment table for visibility — **do not** ask the
user to confirm. Move on.

### Phase 2: dispatch addendum generation agents

Use the dispatching-parallel-agents skill (one batch, 5-6 agents in
parallel). For each `(question, parent_chapter_id)` pair:

- Output path: `<target>/<NN><letter>-<slug>.md`. See "File naming"
  below.
- Prompt: from `templates/addendum-prompt.md` (fill all placeholders).
- Inputs include the full parent chapter markdown so the agent can
  avoid duplication.

Quality bar matches `chapter-prompt.md`:

- 200-500 lines (excluding code block contents).
- `file:line` refs verifiable at `ANALYZED_COMMIT`.
- 5-30 line code excerpts.
- Problem-first when applicable; not forced for simple "how X works".
- No H1 at top (viewer renders the banner).
- No `## 延伸阅读` footer (that's the parent chapter's job).

### Phase 3: wire up

Done in the main conversation (not agents) so the three changes stay
consistent.

1. **Parent chapter markdown**: append a `## 延伸阅读 / Addenda`
   section if absent; under it append `- [<addendum title>](./<output basename>) —— <truncated question>`. Idempotent: use the link target
   as dedup key.
2. **`<target>/web/js/chapters.js`**: locate the parent chapter object
   in the `CHAPTERS` array; push `{id, title, question}` into its
   `addenda` array (create the array if absent). Idempotent: use `id`
   as dedup key. Preserve all surrounding code untouched.
3. **No viewer code changes**. The template-level `sidebar.js` /
   `content.js` / `style.css` already render `addenda` and the banner;
   wikis without `addenda` degrade to the original flat sidebar.

### Phase 4: commit + push

1. From the mono-repo root, run:
   ```bash
   git add -A && git commit -m "Add N addenda for <project>/<version>"
   ```
2. Print the assignment table, the new file list, the new commit SHA.
3. Ask the user: "Push to origin?" — this is the only blocking
   confirmation. If yes: `git push`. If no: stop with a "left local"
   note.

## File naming

`<NN><letter>-<slug>.md`:

- `<NN>` = parent chapter's `num` (the existing two-digit prefix on its
  `id` and filename).
- `<letter>` = `a` then `b` then `c`, …; scan the target directory for
  existing `<NN>[a-z]-*.md` files and pick `max-letter + 1`.
- `<slug>` = a kebab-case summary of the question, 15-40 chars.
  Generated by the skill (LLM call same as Phase 1, or simple
  truncation of the question's salient nouns).

Example: question "fork-join 调度怎么合并?" attached to chapter
`03-scheduler` (num `03`) when no `03[a-z]-*.md` files exist yet →
output `03a-fork-join-merge.md`.

If 26 addenda already exist for one chapter, error out and tell the
user to either merge some addenda back into the parent or split the
parent. Reaching `z` is not expected in practice.

## Idempotency and re-runs

The flow is safe to re-run with the same inputs:

- File name conflict: a re-run picks the next letter, never overwrites.
- Parent's `## 延伸阅读`: dedup by link target — same link won't be
  appended twice.
- `chapters.js` `addenda` array: dedup by addendum `id`.
- `.qa-failed.log` (if any) records questions whose agents failed.
  This file is in `.gitignore` (add the rule on first failure).

## Error handling

| Situation | Detection | Behavior |
|-----------|-----------|----------|
| target path missing `web/js/chapters.js` | stat | bail with "not a wiki dir" |
| not in mono-repo | no ancestor `projects.json` | bail with "Q&A serves mono-repo wikis only" |
| `chapters.js` has unfilled placeholders | regex `\{\{[A-Z_]+\}\}` | bail with "wiki not finalized" |
| commit unreachable in source | `git rev-parse` non-zero | bail with "run `git fetch` and retry" |
| LLM can't match question to chapter | classification fallback | mount under lowest-num chapter, prepend note |
| Agent produces no file | post-dispatch check | skip from commit, log to `.qa-failed.log` |
| Agent produces < 50 lines or 0 refs | post-dispatch check | same — skip + log |
| `git commit` fails (pre-commit hook) | non-zero exit | leave working tree alone, surface error to user |

## What this flow does NOT do

- Delete or rename addenda (manual edit of file + `chapters.js`).
- Attach a single addendum to multiple parents (each addendum has one
  parent only).
- Modify already-existing addenda based on a re-ask (just generates a
  new one with the next letter).
- Auto-push to remote (push always requires user confirmation).
- Attach addenda to tour steps or to the glossary chapter (reference
  chapters only, glossary excluded).
- Auto `git fetch` in the source repo (the user controls when remote
  state changes).
