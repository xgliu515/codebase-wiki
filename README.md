# codebase-wiki

A Claude Code skill for generating **problem-first interactive learning wikis** for any software codebase.

Produces:
- **10-15 reference chapters** covering subsystems comprehensively
- **15-20 step trace tour**: narrative-style, problem → naive → why fails → actual design, following one minimum-viable real request through the entire stack
- **SVG figures**: hand-crafted, theme-aware, scale cleanly
- **Interactive web viewer**: sidebar nav, glossary panel with recursive expansion, full-text search, GitHub deep-links locked to a specific commit
- **GitHub Pages ready**: one-command deploy

The methodology was developed and battle-tested while building [xgliu515/vllm-wiki](https://github.com/xgliu515/vllm-wiki) — see it for what the output looks like.

## Install

```bash
# Clone into Claude Code's skills directory
git clone https://github.com/xgliu515/codebase-wiki.git ~/.claude/skills/codebase-wiki
```

Restart Claude Code or open a new session. Then in any conversation:

```
I want to generate a wiki for <some codebase path>. Use the codebase-wiki skill.
```

Or invoke via slash command if your harness supports it:

```
/codebase-wiki
```

Claude will read `SKILL.md` and walk you through the 7 phases (input → exploration → trace design → content generation → web setup → SVG upgrade → publish).

## What it generates

```
your-project-wiki/
├── README.md                     # disclaimer + version lock + live link
├── LICENSE                       # MIT
├── index.html                    # web viewer entry
├── 01-architecture-overview.md   # reference chapter 1
├── 02-...md                      # ...
├── 12-glossary-and-faq.md        # last chapter is always glossary + FAQ
├── tour-00-overview.md           # tour entry + step list
├── tour-01-...md                 # tour step 1
├── tour-02-...md                 # ...
└── web/
    ├── css/style.css
    ├── serve.sh                  # local server starter
    └── js/                       # vanilla ES modules, no build step
        ├── app.js
        ├── chapters.js           # PER-PROJECT: editable metadata
        ├── architecture.js       # PER-PROJECT: 4-layer SVG
        ├── content.js, sidebar.js, search.js, glossary.js, diagrams.js, utils.js
```

After `git push`, enable GitHub Pages and your wiki goes live at `https://<owner>.github.io/<repo>/`.

## Methodology in one sentence

**Lead with the problem and the failure of the naive solution; the actual design then reads like an obvious consequence rather than a stated conclusion.**

See `reference/8-section-template.md` for the exact tour-step template. See `reference/chapter-planning.md` for how to slice a codebase into chapters.

## Status

v1 — focused on the workflow that produced vllm-wiki. Open to issues/PRs that generalize to more codebase shapes (databases, web frameworks, ML libraries, etc.).

## License

MIT. Generated wikis are owned by you and licensed however you choose.
