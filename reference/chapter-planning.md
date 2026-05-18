# Chapter planning: cutting a codebase into ~12 reference chapters

The reference manual complements the trace tour. Where the tour is narrative, chapters are **comprehensive per-subsystem**. Each chapter is independent — readers should be able to land on chapter 7 and learn it without reading 1-6.

## Target: 10-15 chapters

| Chapter count | When |
|---------------|------|
| 8-10 | Small / focused project (a single library, a tool) |
| 11-14 | Mid-sized project (a framework, an inference engine) |
| 15+ | Large project — consider splitting into multiple wikis instead |

## Canonical chapter outline

For any nontrivial project, expect a layout roughly like:

| # | Topic | Always present? |
|---|-------|-----------------|
| 01 | Architecture overview | Yes — required first chapter |
| 02 | Core theoretical concepts | Yes (if the project has interesting algorithms) |
| 03 | Entry point + main loop | Yes |
| 04-N | Per-subsystem chapters | Project-specific |
| N-1 | Distributed / scaling | Only if applicable |
| N | Advanced features / extensions | If any |
| N+1 | Glossary + FAQ | Yes — required last chapter |

## How to identify subsystems

For each directory under the source root, ask:
- Does it have a clear single responsibility?
- Does it have a public interface (other code calls into it)?
- Is its implementation more than ~500 lines?

If yes to all three → it's probably a chapter. If two yes → maybe a section within a related chapter.

Look at `CLAUDE.md` / `AGENTS.md` / `CONTRIBUTING.md` first — they often list the load-bearing modules already.

## Common chapter shapes by project type

### LLM inference engine (e.g., vllm)
```
01 Architecture overview
02 Core concepts (paged attention, continuous batching, ...)
03 Entry + engine
04 Scheduler
05 KV cache manager
06 Worker + model runner
07 Attention backends
08 Models + weight loading
09 Sampler
10 Distributed (TP/PP/EP)
11 Advanced features (spec decode, quant, LoRA, ...)
12 Glossary + FAQ
```

### Agent framework (e.g., hermes-agent)
```
01 Architecture overview
02 Agent loop
03 CLI / interactive entry
04 Tool system
05 Multi-platform gateway
06 TUI / UI
07 LLM provider adapters
08 Session state + storage
09 Memory + learning loop
10 Plugins
11 Sandboxes / sub-agents
12 Peripherals + glossary
```

### Web framework
```
01 Architecture overview
02 Request lifecycle
03 Router
04 Middleware system
05 Handlers / controllers
06 Templating / response building
07 ORM / data layer
08 Session / auth
09 Async / concurrency
10 Testing utilities
11 Deployment / extensions
12 Glossary + FAQ
```

### Database
```
01 Architecture overview
02 Data model + storage format
03 SQL parser
04 Query planner
05 Executor
06 Storage engine
07 Transactions + concurrency
08 Replication / clustering
09 Backup + recovery
10 Extensions / FDW
11 Monitoring + observability
12 Glossary + FAQ
```

## Chapter content guidelines

Each chapter ~800-1500 lines markdown.

Structure suggestion (not rigid):
1. **Total览** (1-2 paragraphs)
2. **目录结构 / file layout** (where to find things)
3. **核心数据结构** (with `file:line` refs)
4. **主流程 / 关键算法** (annotated code, sometimes ASCII / SVG figures)
5. **子模块详解** (one section per submodule)
6. **与其它子系统的接口** (the cross-cuts)
7. **扩展点 / 如何添加新 X** (developer guide)
8. **相关章节链接**

`file:line` references everywhere — every claim should be verifiable.

## Last chapter: glossary + FAQ + appendix

Required structure (parsed by `templates/web/js/glossary.js`):

```markdown
## Part 1: 术语表

### TermName
- 英文原名: `OfficialEnglishName`
- 中文译名: 中文名
- 定义: <1-3 sentences>
- 代码位置: `path/to/file.py:123`

### NextTerm
...
```

Then `## Part 2: FAQ` (10-15 Q&A) and `## Part 3: 调试与开发速查` (env vars, common commands, test commands).

The web viewer auto-detects glossary terms in other chapters and adds clickable underlines → side panel.
