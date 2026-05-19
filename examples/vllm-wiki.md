# Example: vllm-wiki

The reference implementation that this skill was extracted from.

**Live**: <https://xgliu515.github.io/codebase-wikis/vllm/>
**Source**: <https://github.com/xgliu515/codebase-wikis/tree/main/vllm>

## Scope

- vllm @ commit `086749736` (v0.21.1rc0 + 35 commits, 2026-05-17)
- 12 reference chapters (~12000 lines markdown)
- 17 tour steps + 1 overview (~3100 lines markdown)
- ~80 SVG figures
- Full interactive web viewer

## What to look at

| Thing | Where |
|-------|-------|
| 8-section template in action | tour-01 through tour-17 |
| Architecture overview chapter | 01-architecture-overview.md |
| Trace overview + step list | tour-00-overview.md |
| Glossary chapter (required format) | 12-glossary-and-faq.md |
| SVG style examples | tour-10 (data flow), tour-01 (memory bar), 02 (comparison) |
| Web shell architecture | web/js/ (vanilla ES modules) |

## What was tweaked over time

These iterations are encoded into the skill's `reference/` docs and `templates/` directory:

- Started with one-shot chapter generation by parallel agents (good)
- Discovered chapters were dense to read first time → added the tour layer
- Tour first version had analogies; iterated to remove them (didn't land)
- ASCII figures → SVG upgrades (better, kept ASCII in `<details>` for comparison)
- Hardcoded local repo path → configurable + default to GitHub deep-links
- Locked analyzed commit so links always work

Each lesson is now baked into the templates so v2 builders skip the bugs.

## Time spent

About 6-8 hours of agent work + 2-3 hours of user iteration. The skill should compress this for next-time-around projects.
