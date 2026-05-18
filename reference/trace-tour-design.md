# Designing the trace tour

The trace tour is the most unique piece of this methodology — a single, real, minimum-viable usage of the project, traced step-by-step through every layer, using the 8-section template for each step.

## Picking the trace target

The right trace target satisfies all of:

1. **Minimum complexity** — strip every advanced feature. For vllm: no TP, no spec decode, no multimodal, no quantization. For an agent: no subagents, no tool chains. For a web framework: no middleware, no auth.
2. **Real and runnable** — has to actually work end-to-end. Contrived "imagine X" doesn't anchor anything.
3. **Touches every layer** — if a layer doesn't run, you can't show it. Skip that trace, pick another.
4. **Smallest possible inputs** — short strings, single requests, max_tokens=3, etc.

### Examples by project type

| Project | Trace target |
|---------|--------------|
| LLM inference engine | `LLM("model").generate(["hello"], max_tokens=3)` |
| Agent framework | One CLI message that triggers one tool call |
| Web framework | `GET /healthz` from socket accept to response write |
| Database | `SELECT 1` (no tables, no joins) |
| Compiler | Compile a 3-line "hello world" |
| Build system | Run a no-op build in a single-target project |
| Message queue | Publish one message, subscribe and receive it |

## Designing the step list

Goal: 15-20 steps. Each step is ~5-30 minutes of reader time.

### Phases

Group the steps into 4-6 phases that mirror the request lifecycle:

| Phase | Typical |
|-------|---------|
| A. Initialization | Loading config, allocating pools, capturing graphs (anything done once, before requests) |
| B. Request entry | User input parsed, normalized, queued |
| C. Pre-execution setup | Scheduling, batching, input prep |
| D. Execution | The actual computation (forward pass, query exec, tool call, etc.) |
| E. Output production | Sampling, response formatting, callbacks |
| F. Cleanup | Resource release, stats, return-to-user |

Each phase has 2-5 steps. Total ~15-20.

### State evolution table

Before generating steps, write a table showing how key state evolves:

| Step | What changes |
|------|--------------|
| 01 | KV cache pool size determined |
| 02 | CUDA graphs captured |
| 03 | Model weights loaded; LLM() returns |
| 04 | Request in waiting queue |
| 05 | Scheduler decides prefill |
| ... | |

This catches dependency bugs (step 7 needs state from step 5? then 5 must produce it). Each agent writing a step uses this table to understand its inputs and outputs.

### Step boundaries

A step is the right size when its 8 sections can all be filled meaningfully in 120-200 lines. If a step has only 3 lines of "problem" you can think of, it's too small — merge with neighbor. If you can't fit it in 200 lines, it's too big — split.

## Common step archetypes

| Archetype | Example | Section 5 typical content |
|-----------|---------|---------------------------|
| Sizing decision | "How big is the KV cache pool?" | Algorithm + parameter that controls it |
| Data structure intro | "What does the request object look like?" | Fields + why they exist |
| Algorithm execution | "How does the scheduler pick which to run?" | Pseudocode or annotated real code |
| Kernel / hot loop | "How does the attention kernel read non-contiguous KV?" | Concrete loop + memory layout |
| State transition | "How does prefill turn into decode?" | What changes in which fields |
| Cleanup / handoff | "How is KV cache freed?" | Lifecycle diagram |

If you find a step that's none of these, double-check it's really a distinct step.

## Tour overview file (`tour-00-overview.md`)

Must include:
- The exact code snippet being traced
- Why this trace was chosen
- The 8-section template documentation
- A table of all steps with one-line descriptions
- A state evolution table showing what changes per step
- Cross-ref table showing which reference chapters each step links to

See vllm-wiki/tour-00-overview.md for a working example.
