# Chapter quiz generation prompt

You are generating a `quizzes/{{CHAPTER_SLUG}}.json` file for a codebase-wiki chapter. Output **only** the JSON content, no preamble, no fences.

## Input

**Chapter slug:** `{{CHAPTER_SLUG}}`
**Chapter title:** `{{CHAPTER_TITLE}}`
**Chapter content (markdown):**

```
{{CHAPTER_CONTENT}}
```

## Goal

Produce 3–8 multiple-choice questions that verify the reader understood this chapter. Mix of:
- `mcq-single` (typical) — exactly 1 correct option
- `mcq-multi` (when natural) — 2+ correct options out of 4+

Each question should test **conceptual understanding** of something stated in the chapter — not trivia, not external knowledge.

## Format requirements (strict)

Match the `QuizSchema` defined in `shared/src/quiz.ts`. Specifically:

- Top-level: `{ "schema_version": "1.0", "chapter_id": "{{CHAPTER_SLUG}}", "questions": [...] }`
- Each question has: `id`, `type`, `stem`, `options`, `answer`, `explanation`, `difficulty`
- `id` format: `{{CHAPTER_SLUG}}-q1`, `{{CHAPTER_SLUG}}-q2`, ... (sequential)
- `options[].id` are single lowercase letters: `a`, `b`, `c`, `d` (4 options is the sweet spot; 3 or 5 OK)
- `answer` is always an array. For `mcq-single`, length 1. For `mcq-multi`, length 2+.
- `answer` values must reference actual `options[].id`
- `difficulty`: `easy` | `medium` | `hard`. Spread across difficulties — don't make them all easy.
- `explanation`: 1-3 sentences explaining why the correct answer is correct. May cite specific section.

## Quality guidelines

- **Distractors must be plausible**: a wrong option should sound right to someone who skimmed the chapter. Avoid obviously-wrong / joke options.
- **Question stems should be self-contained**: a reader shouldn't need to scroll back to figure out what the question is asking about.
- **Avoid trick questions** based on wording subtleties. Test understanding, not reading comprehension of the question.
- **No "all of the above" / "none of the above"** options.
- **No questions whose answer is "it depends" or "see the source code"**.

## Length

Generate **3–8 questions**:
- 3 if the chapter is short (< 500 words) and introduces 1 concept
- 5-6 if the chapter has 2-3 distinct ideas
- 7-8 only if the chapter is dense (> 1500 words) with many ideas

## Output

Output **only** the JSON. No leading prose, no Markdown fences, no trailing comments. The output must `JSON.parse()` and validate against `QuizSchema`.
