# 8-section trace step template

Every step in a trace tour follows this fixed 8-section structure. The point is to make every design decision feel like a **logical consequence of a real problem**, never a stated conclusion.

## The 8 sections

```markdown
# Trace 步骤 N —— <一句话标题，最好是个问句>

## 1. 当前情境
<We're at this point in the trace. What's in scope, what just happened, what data structures look like right now.>

## 2. 问题
<What does this step have to solve? Frame it as a concrete need with stakes.
This is the "requirement" that the rest of the section addresses.>

## 3. 朴素思路
<Intuitively, what would you do? Make this plausible — the reader should think "yeah, I would have done that too".>

## 4. 为什么朴素思路会崩
<Concrete failure modes. Not "it's slow" — say WHY it's slow, what specifically goes wrong, give numbers if you can.>

## 5. <project> 的做法
<Now that the problem is set up, the actual design reads like an obvious solution.
Show the algorithm/data structure clearly. Use ASCII diagrams or SVG figures here when they help.
Include short code excerpts (5-30 lines max), with file:line refs.>

## 6. 代码位置
<file:line refs in the order you'd read them.
Pattern: "Entry point: vllm/v1/.../core.py:123. The hot loop: same file:456. Helper: other/file.py:78."
Also: recommended reading order if the code is layered.>

## 7. 分支与延伸
<Markdown links to other chapters that go deeper.
Pattern: "- If you have feature X enabled, this step also does Y → see [Chapter N §M](path.md#anchor)"
This is the knowledge-network layer — connects the linear trace to the reference manual.>

## 8. 走完这一步你脑子里应该多了什么
<3-5 concrete takeaways. Phrased as new knowledge, not as task summary.
Example: "1. PagedAttention block pool is allocated ONCE at startup, never resized."
Not: "We saw how the block pool is allocated.">
```

## Why these 8 sections (and in this order)

| # | Section | Cognitive function |
|---|---------|--------------------|
| 1 | 当前情境 | Anchors the reader's spatial position in the system |
| 2 | 问题 | Establishes a real need — without this, all explanations feel arbitrary |
| 3 | 朴素思路 | Activates the reader's existing mental model |
| 4 | 为何崩 | Creates productive surprise — the gap between expectation and reality is where learning lands |
| 5 | 实际做法 | Now feels like a *consequence*, not a *conclusion* |
| 6 | 代码位置 | Lets the reader verify by reading source |
| 7 | 分支延伸 | Knowledge network — connects to reference manual |
| 8 | 学到了什么 | Consolidation — forces explicit articulation of takeaways |

## Length guidelines

- **Total**: 120-200 lines per step
- **Sections 1, 6**: short (5-15 lines each)
- **Sections 2, 3, 4, 5**: substantial (15-50 lines each)
- **Section 7**: 5-15 bullet points
- **Section 8**: 3-5 bullets

## Patterns that break the template

- **Mechanical / boring steps** (e.g., "tokenize the input"): sections 3-4 may feel forced. Allowed shortening: "朴素直觉就是直接 tokenize 整段 prompt → 没问题，确实就这样" — short non-崩 step.
- **Pure data structure exposition** (e.g., "the request object"): the "problem" is "what state do we need to track" — section 5 explains the fields. Sections 3-4 talk about naive structures (e.g., "all fields flat" vs "nested for atomic snapshot").

## Common bugs

- **Conclusion-first phrasing leaking back in**: "vllm 用 X 来 Y" should always come after "为什么不用 Z" was established. Edit ruthlessly.
- **Sections 3-4 too short**: if naive thinking is just "I'd do X" without explaining why X is obvious, the reader doesn't get the productive surprise. Spend time setting it up.
- **Section 7 too sparse**: less than 3 cross-refs means the knowledge network isn't forming. Find more connections.

## Cross-references to reference manual

In section 7, link with `path#anchor` syntax:

```markdown
- 不同 attention backend 怎么处理 → [第 7 章 §3](07-attention-backends.md#section-3)
- 投机解码场景下这一步会变 → [第 11 章 §1](11-advanced-features.md#1-speculative-decoding)
```

The web viewer's markdown renderer creates `id` attributes from headings via slugify — see `templates/web/js/content.js` heading renderer.
