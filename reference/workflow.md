# End-to-end workflow

From empty directory to live GitHub Pages wiki. Roughly 2-4 hours of agent work + 30 minutes user review.

## Time budget

| Phase | Time | Mostly |
|-------|------|--------|
| 0. Inputs | 5 min | User |
| 1. Explore | 15 min | Explore agent + user review |
| 2. Trace design | 15 min | User decision |
| 3. Generate chapters | 30-60 min | 5-6 parallel agents |
| 4. Generate tour | 20-40 min | 5-6 parallel agents |
| 5. Web setup | 10 min | Mechanical |
| 6. SVG upgrade | 60-90 min | Optional, more parallel agents |
| 7. Publish | 10 min | git + GitHub Pages |

Total: 2-4 hours wall-clock; most of it agents working in parallel while you read other chapters.

## Step-by-step

### Phase 0: Detect mode + gather inputs

Probe the output directory first — `versions.json` present → append;
root-level `index.html` + `web/js/chapters.js` but no `versions.json` →
migrate; otherwise → fresh. See `reference/versioning.md`.

Ask user (one at a time):
1. Codebase path
2. Output directory
3. Project name + GitHub repo (fresh only)
4. Language (fresh only)
5. Lock version (default = current HEAD)

Derive the version directory name: exact tag if any, else `<branch>-<shortSHA>`.
Save to memory.

### Phase 1: Explore the codebase

```
Dispatch an Explore agent:
- "Read AGENTS.md / CLAUDE.md / CONTRIBUTING.md / README.md if any.
   List top-level directories. For each significant directory,
   sample 3-5 files to understand its purpose. Output:
   (a) one-paragraph summary of the project shape,
   (b) proposed 10-15 chapter outline."
```

Review with user. Edit chapter outline.

### Phase 2: Trace design

Pick the trace target. Reference: `trace-tour-design.md`.

Draft step list (~15-20 steps) + state evolution table. Confirm with user.

### Phase 3: Generate chapters

Use `templates/chapter-prompt.md`. Dispatch ~5-6 parallel agents, each writing 2-3 chapters.

Each agent prompt MUST include:
- The codebase path
- Which chapters they own (with file paths to output)
- The chapter's specific scope (subsystem coverage)
- File:line citation requirement
- Length target (800-1500 lines)
- Language

After agents return, verify file existence and line counts.

### Phase 4: Generate tour

Use `templates/tour-step-prompt.md` + `reference/8-section-template.md`. Dispatch ~5-6 parallel agents.

**Critical**: provide the master outline (tour-00) and 1-2 sample steps as style reference. Agents will mimic the structure.

### Phase 5: Web setup

All per-version output goes into the version subdirectory `v<x>/`.

```bash
# Copy web shell into the version subdirectory
mkdir -p <output>/v<x>
cp -R <skill>/templates/web <output>/v<x>/
cp <skill>/templates/index.html <output>/v<x>/index.html

# Edit v<x>/web/js/chapters.js: replace placeholders
#   PROJECT_GITHUB_REPO, ANALYZED_COMMIT, ANALYZED_TAG, ANALYZED_DATE
#   CHAPTERS array entries
#   TOURS array entries

# Edit v<x>/web/js/architecture.js: rewrite the 4-layer LAYERS array
# Edit v<x>/index.html: <title>

# Test
cd <output> && python3 -m http.server 8765
# Visit http://localhost:8765/  (version selector → pick a version)
```

### Phase 6: SVG upgrade (iterative)

Optional but recommended. ASCII figures work; SVG figures look professional.

Process:
1. Read `templates/svg-style-guide.md`
2. Scan files for ASCII figures (containing box-drawing chars)
3. Dispatch agents to convert (one agent per ~10 figures)
4. Each agent: replace ASCII with `<svg>...</svg>` + caption + `<details>` containing original

**Pitfalls during SVG editing:**
- No blank lines inside SVG (marked breaks)
- No HTML comments inside SVG (marked breaks)
- Always close `<details>` tags
- Use `currentColor` for theme-aware text
- Cap viewBox width — set `class="figure-svg"` or `class="figure-svg wide"` (CSS handles max-width)

### Phase 7: Publish (versioned)

**Fresh mode** — new repo:

```bash
cd <output>
cp <skill>/templates/version-index.html index.html   # replace {{PROJECT_NAME}}
cp <skill>/templates/selector.css selector.css
cp <skill>/templates/versions.json versions.json      # fill the single entry
git init -b main
git add -A
git commit -m "initial release"
git remote add origin <user's repo URL>
git push -u origin main
gh api -X POST /repos/<owner>/<repo>/pages \
  -f "build_type=legacy" \
  -f "source[branch]=main" \
  -f "source[path]=/"
```

**Append mode** — existing wiki repo: add the new `v<x>/`, push a new
entry to the head of `versions.json` and flip the prior `latest` to
`false`, leave the top-level `index.html` / `selector.css` untouched,
then `git add -A && git commit && git push`.

**Migrate mode** — old flat-layout wiki: confirm with the user, `git mv`
the old root content into `v<derived>/`, inject the version dropdown
there, scaffold the top-level files + `versions.json`, then proceed as
append mode. Full steps in `reference/versioning.md`.

Tell user: live URL is `https://<owner>.github.io/<repo>/`, first build takes 1-2 min.

## Quality checks

Before declaring done:
- [ ] All chapters have substantial `file:line` refs
- [ ] Tour steps follow 8-section template strictly
- [ ] Glossary parser successfully extracts terms (check by visiting any chapter — terms should be underlined)
- [ ] All SVGs render (no broken text, no overlapping labels)
- [ ] Search works (try a Chinese term)
- [ ] GitHub deep-links work (click a `file:line` — opens correct file, correct line on GitHub)
- [ ] README has version lock + disclaimers + Pages URL

## When things go wrong

- **Agent generates wrong file paths or fake `file:line` refs**: read the agent's output, verify line numbers exist in source. If many wrong, regenerate with stricter prompt.
- **Permission prompts during dispatch**: macOS Claude Code asks per-agent. If user accidentally denies, check file state to see which actually ran (don't trust return messages).
- **SVG renders broken**: open browser DevTools, check console for marked parsing errors. Fix blank lines / HTML comments / unclosed tags.
- **GitHub Pages 404**: wait 2-3 min; check Actions tab for build status; verify Pages source is set to main / root.
