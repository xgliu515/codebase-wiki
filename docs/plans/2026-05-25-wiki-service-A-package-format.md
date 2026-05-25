# Plan A: wikipkg 格式 + skill 生成器更新

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在仓库里搭出 `shared/` workspace(zod schemas)和 `tools/wikipkg/` CLI(validate + pack);更新 SKILL.md 让生成器最终产物变成单一 `.wikipkg.tar.gz`;落一份 `examples/sample-wikipkg/` 给后续 Plan B(服务)做测试夹具。

**Architecture:** monorepo workspaces。`shared/` 暴露 zod schemas + 推导的 TS 类型作为「单一数据契约源」;`tools/wikipkg/` 是个小 CLI(`wikipkg validate <dir>` / `wikipkg pack <dir> <out>`),给 skill 在 Phase 7 调用。skill 自身仍是 Markdown 指令,新增一个生成 chapter quiz 的 prompt 模板 + 一个产生 `.wikipkg.tar.gz` 的 Phase。

**Tech Stack:** Node 20+, TypeScript 5, zod 3, vitest 1, tar(node stdlib)。无前端,无服务。

**Spec:** `docs/specs/2026-05-25-codebase-wiki-service-design.md`(§2 Wiki package 格式)

**Path conventions:**
- 计划文件位置 `docs/plans/`(不是 `docs/superpowers/plans/`)
- 单行 commit message,不带 Conventional Commits 前缀,不带 Co-Authored-By trailer
- 项目根直接放 `package.json`(monorepo root)
- 新 workspaces 不破坏现有 `SKILL.md` / `templates/` / `reference/` 路径

**Testing:** vitest,只覆盖 shared schemas 校验和 CLI 行为。每个 schema task 都先写失败用例再补实现(TDD);CLI 任务也是 TDD。SKILL.md / 模板更新走「edit + grep verify」。

**Predecessor of:** Plan B(服务核心)、Plan D(viewer)都消费 `shared/` 的 schemas;Plan B 还要 `examples/sample-wikipkg/` 作为上传夹具。Plan A 完成后,B/C/D 可并行启动。

---

## Task 1: Monorepo 根 + .gitignore

**Files:**
- Create: `package.json`
- Modify: `.gitignore`
- Create: `tsconfig.base.json`

**Context:** 项目此前没有顶层 Node 工程。这步只搭外壳,不引依赖。后续 task 在 workspaces 里加。

- [ ] **Step 1: 看一眼现有 .gitignore**

Run: `cat /Users/xgliu/Documents/git/codebase-wiki/.gitignore`
Expected: 两行左右,可能 `.DS_Store` 之类。

- [ ] **Step 2: 写 `package.json`(root)**

```json
{
  "name": "codebase-wiki-monorepo",
  "private": true,
  "version": "0.0.0",
  "workspaces": [
    "shared",
    "tools/*"
  ],
  "scripts": {
    "build": "npm run build --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "check": "npm run check --workspaces --if-present"
  },
  "engines": { "node": ">=20" }
}
```

- [ ] **Step 3: 写 `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "verbatimModuleSyntax": false,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true,
    "types": ["node"]
  }
}
```

- [ ] **Step 4: 更新 .gitignore**

把这些行追加(用 Edit 工具,不要 echo):

```
node_modules/
dist/
*.tsbuildinfo
.env
.env.*
!.env.example
coverage/
```

- [ ] **Step 5: 验证 JSON 合法 + 提交**

Run:
```bash
cd /Users/xgliu/Documents/git/codebase-wiki && node -e "JSON.parse(require('fs').readFileSync('package.json'))" && node -e "JSON.parse(require('fs').readFileSync('tsconfig.base.json'))"
```
Expected: 无输出,退出码 0。

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && git add package.json tsconfig.base.json .gitignore && git commit -m "Monorepo root: package.json with workspaces + tsconfig base"
```

---

## Task 2: `shared/` workspace 骨架

**Files:**
- Create: `shared/package.json`
- Create: `shared/tsconfig.json`
- Create: `shared/src/index.ts`
- Create: `shared/vitest.config.ts`

**Context:** shared 是 schema 中心,被服务/viewer/CLI 三方消费。这步只搭骨架并装依赖。

- [ ] **Step 1: 写 `shared/package.json`**

```json
{
  "name": "@codebase-wiki/shared",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "check": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^1.6.0",
    "@types/node": "^20.0.0"
  }
}
```

- [ ] **Step 2: 写 `shared/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "test"]
}
```

- [ ] **Step 3: 写 `shared/src/index.ts`(占位)**

```ts
// Re-exports added per task.
export const SHARED_SENTINEL = 'codebase-wiki/shared';
```

- [ ] **Step 4: 写 `shared/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 5: 安装依赖**

Run:
```bash
cd /Users/xgliu/Documents/git/codebase-wiki && npm install
```
Expected: 写出 `package-lock.json`,创建 `node_modules/`。

- [ ] **Step 6: smoke check + commit**

Run:
```bash
cd /Users/xgliu/Documents/git/codebase-wiki && npm run check --workspace @codebase-wiki/shared
```
Expected: 无 TS 错。

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && git add package-lock.json shared/ && git commit -m "shared/: workspace scaffold with zod + vitest"
```

---

## Task 3: `shared/src/common.ts` — slug / semver / 通用枚举

**Files:**
- Create: `shared/src/common.ts`
- Create: `shared/test/common.test.ts`

**Context:** 单独抽出 schema 共用的小约束(slug 正则、version_label 正则、文件相对路径 guard),避免在多个 schema 里重复定义同一个 regex。

- [ ] **Step 1: 写失败测试 `shared/test/common.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { SlugSchema, VersionLabelSchema, RelativePathSchema, LanguageSchema } from '../src/common.js';

describe('SlugSchema', () => {
  it('accepts kebab-case lowercase', () => {
    expect(SlugSchema.safeParse('vllm').success).toBe(true);
    expect(SlugSchema.safeParse('architecture-overview').success).toBe(true);
    expect(SlugSchema.safeParse('a').success).toBe(true);
    expect(SlugSchema.safeParse('a1').success).toBe(true);
  });

  it('rejects empty / leading dash / uppercase / non-ASCII', () => {
    expect(SlugSchema.safeParse('').success).toBe(false);
    expect(SlugSchema.safeParse('-x').success).toBe(false);
    expect(SlugSchema.safeParse('VLLM').success).toBe(false);
    expect(SlugSchema.safeParse('架构').success).toBe(false);
    expect(SlugSchema.safeParse('a_b').success).toBe(false);
    expect(SlugSchema.safeParse('a.b').success).toBe(false);
    expect(SlugSchema.safeParse('a/b').success).toBe(false);
  });

  it('rejects > 64 chars', () => {
    expect(SlugSchema.safeParse('a'.repeat(65)).success).toBe(false);
  });
});

describe('VersionLabelSchema', () => {
  it('accepts SemVer-ish labels', () => {
    expect(VersionLabelSchema.safeParse('v0.22.0').success).toBe(true);
    expect(VersionLabelSchema.safeParse('1.0.0').success).toBe(true);
    expect(VersionLabelSchema.safeParse('v1.0.0-rc.1').success).toBe(true);
    expect(VersionLabelSchema.safeParse('main-a1b2c3d').success).toBe(true);
  });

  it('rejects empty / path-illegal chars', () => {
    expect(VersionLabelSchema.safeParse('').success).toBe(false);
    expect(VersionLabelSchema.safeParse('v0/0').success).toBe(false);
    expect(VersionLabelSchema.safeParse('..').success).toBe(false);
    expect(VersionLabelSchema.safeParse(' v1').success).toBe(false);
  });
});

describe('RelativePathSchema', () => {
  it('accepts simple relative paths', () => {
    expect(RelativePathSchema.safeParse('chapters/architecture.md').success).toBe(true);
    expect(RelativePathSchema.safeParse('figures/x.svg').success).toBe(true);
  });

  it('rejects path traversal / absolute / windows backslash', () => {
    expect(RelativePathSchema.safeParse('../etc/passwd').success).toBe(false);
    expect(RelativePathSchema.safeParse('/abs/path').success).toBe(false);
    expect(RelativePathSchema.safeParse('a\\b').success).toBe(false);
    expect(RelativePathSchema.safeParse('').success).toBe(false);
  });
});

describe('LanguageSchema', () => {
  it('accepts BCP-47-ish codes', () => {
    expect(LanguageSchema.safeParse('zh-CN').success).toBe(true);
    expect(LanguageSchema.safeParse('en').success).toBe(true);
    expect(LanguageSchema.safeParse('en-US').success).toBe(true);
  });

  it('rejects junk', () => {
    expect(LanguageSchema.safeParse('Chinese').success).toBe(false);
    expect(LanguageSchema.safeParse('').success).toBe(false);
  });
});
```

- [ ] **Step 2: 运行,确认失败**

Run: `cd /Users/xgliu/Documents/git/codebase-wiki/shared && npx vitest run test/common.test.ts`
Expected: FAIL —— cannot find `../src/common.js`。

- [ ] **Step 3: 实现 `shared/src/common.ts`**

```ts
import { z } from 'zod';

// slug: 全小写 ASCII,字母数字开头,允许 hyphen,长度 1-64
export const SlugSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,63}$/, 'slug must be kebab-case ASCII (1-64 chars)');

// version_label: 允许 v 前缀 + 数字,内部允许字母数字 . - +,排除 / \\ 空格
export const VersionLabelSchema = z
  .string()
  .regex(/^v?[0-9][0-9a-zA-Z.\-+]{0,63}$/, 'version_label must be SemVer-like (no slashes/spaces)');

// 相对路径:无 ..,无前导 /,无 \\,非空
export const RelativePathSchema = z
  .string()
  .min(1)
  .refine((s) => !s.startsWith('/'), 'must be relative')
  .refine((s) => !s.includes('\\'), 'no backslashes')
  .refine((s) => !s.split('/').includes('..'), 'no parent traversal');

// BCP-47-ish: 2-3 字母,可选 -2-3字母/数字 后缀
export const LanguageSchema = z
  .string()
  .regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/, 'language must be BCP-47-like (e.g. zh-CN, en)');

// 内容类型 v1 仅 codebase,留扩展位
export const ContentTypeSchema = z.enum(['codebase']);
export type ContentType = z.infer<typeof ContentTypeSchema>;

// schema_version: "MAJOR.MINOR"(无 PATCH)
export const SchemaVersionSchema = z
  .string()
  .regex(/^\d+\.\d+$/, 'schema_version must be MAJOR.MINOR');

export function parseSchemaMajor(version: string): number {
  const m = version.match(/^(\d+)\.\d+$/);
  if (!m || m[1] === undefined) {
    throw new Error(`invalid schema_version: ${version}`);
  }
  return Number(m[1]);
}
```

- [ ] **Step 4: 跑测试,全过**

Run: `cd /Users/xgliu/Documents/git/codebase-wiki/shared && npx vitest run test/common.test.ts`
Expected: PASS,4 个 describe block 全绿。

- [ ] **Step 5: re-export + 提交**

修改 `shared/src/index.ts`:

```ts
export * from './common.js';
```

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && git add shared/src/common.ts shared/src/index.ts shared/test/common.test.ts && git commit -m "shared/common: slug / version_label / relative path / language regexes"
```

---

## Task 4: `shared/src/manifest.ts` — ManifestSchema

**Files:**
- Create: `shared/src/manifest.ts`
- Create: `shared/test/manifest.test.ts`

**Context:** spec §2 完整定义了 manifest 结构。这里把它编译为 zod。`source` 用 discriminated union(`source.type`),`content_type=codebase` 时强制要求 `source.type=codebase`。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from 'vitest';
import { ManifestSchema, type Manifest } from '../src/manifest.js';

const validCodebaseManifest = {
  schema_version: '1.0',
  content_type: 'codebase',
  subject: {
    slug: 'vllm',
    name: 'vLLM',
    description: 'High-throughput LLM inference',
    language: 'zh-CN',
  },
  wiki_version: {
    label: 'v0.22.0',
    generated_at: '2026-05-25T10:00:00Z',
    generator: { name: 'codebase-wiki', version: '2.0.0' },
  },
  source: {
    type: 'codebase',
    codebase: {
      repo_url: 'https://github.com/vllm-project/vllm',
      target_ref: 'v0.22.0',
      target_commit: 'abc1234',
      deep_link_template: 'https://github.com/vllm-project/vllm/blob/{commit}/{path}#L{line}',
    },
  },
  chapters: [
    {
      id: 'architecture-overview',
      order: 1,
      title: 'Architecture Overview',
      path: 'chapters/architecture-overview.md',
      estimated_minutes: 12,
      quiz_path: 'quizzes/architecture-overview.json',
      tags: ['overview'],
    },
  ],
  tours: [
    {
      id: 'first-request',
      title: 'First request through vLLM',
      overview_path: 'tours/first-request/00-overview.md',
      steps: [
        { order: 1, title: 'Entry point', path: 'tours/first-request/01-entry.md' },
      ],
    },
  ],
  glossary_path: 'glossary.json',
  figures: [
    { id: 'architecture', path: 'figures/architecture.svg', title: 'Layered architecture' },
  ],
};

describe('ManifestSchema', () => {
  it('accepts the canonical codebase manifest', () => {
    const r = ManifestSchema.safeParse(validCodebaseManifest);
    if (!r.success) console.error(r.error.format());
    expect(r.success).toBe(true);
  });

  it('rejects content_type=article in v1', () => {
    const m = { ...validCodebaseManifest, content_type: 'article' };
    expect(ManifestSchema.safeParse(m).success).toBe(false);
  });

  it('rejects mismatch: content_type=codebase but source.type=article', () => {
    const m = {
      ...validCodebaseManifest,
      source: { type: 'article', article: { title: 'x', author: 'y', url: 'https://x.example' } },
    };
    expect(ManifestSchema.safeParse(m).success).toBe(false);
  });

  it('rejects invalid slug in subject', () => {
    const m = { ...validCodebaseManifest, subject: { ...validCodebaseManifest.subject, slug: 'Bad Slug' } };
    expect(ManifestSchema.safeParse(m).success).toBe(false);
  });

  it('rejects path traversal in chapters[].path', () => {
    const m = {
      ...validCodebaseManifest,
      chapters: [{ ...validCodebaseManifest.chapters[0], path: '../etc/passwd' }],
    };
    expect(ManifestSchema.safeParse(m).success).toBe(false);
  });

  it('allows missing optional fields (quiz_path, tags, figures, tours)', () => {
    const minimal = {
      ...validCodebaseManifest,
      chapters: [
        {
          id: 'ch1',
          order: 1,
          title: 'C',
          path: 'chapters/ch1.md',
          estimated_minutes: 5,
        },
      ],
      tours: [],
      figures: [],
    };
    expect(ManifestSchema.safeParse(minimal).success).toBe(true);
  });

  it('rejects duplicate chapter ids', () => {
    const m = {
      ...validCodebaseManifest,
      chapters: [
        validCodebaseManifest.chapters[0],
        validCodebaseManifest.chapters[0],
      ],
    };
    expect(ManifestSchema.safeParse(m).success).toBe(false);
  });

  it('rejects unsupported schema_version MAJOR=0', () => {
    const m = { ...validCodebaseManifest, schema_version: '0.9' };
    // schema parses (regex allows 0.x), but downstream parseSchemaMajor flags it.
    // For now manifest accepts; the upload pipeline (Plan B) handles the MAJOR check.
    expect(ManifestSchema.safeParse(m).success).toBe(true);
  });

  it('exports a Manifest type alias matching the parse output', () => {
    const r = ManifestSchema.parse(validCodebaseManifest);
    const _check: Manifest = r;
    expect(_check.content_type).toBe('codebase');
  });
});
```

- [ ] **Step 2: 跑测试,确认失败**

Run: `cd /Users/xgliu/Documents/git/codebase-wiki/shared && npx vitest run test/manifest.test.ts`
Expected: FAIL —— cannot resolve `../src/manifest.js`。

- [ ] **Step 3: 实现 `shared/src/manifest.ts`**

```ts
import { z } from 'zod';
import {
  SlugSchema,
  VersionLabelSchema,
  RelativePathSchema,
  LanguageSchema,
  ContentTypeSchema,
  SchemaVersionSchema,
} from './common.js';

const SubjectSchema = z.object({
  slug: SlugSchema,
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  language: LanguageSchema,
});

const WikiVersionSchema = z.object({
  label: VersionLabelSchema,
  generated_at: z.string().datetime(),
  generator: z.object({
    name: z.string().min(1),
    version: z.string().min(1),
  }),
});

const CodebaseSourceSchema = z.object({
  type: z.literal('codebase'),
  codebase: z.object({
    repo_url: z.string().url(),
    target_ref: z.string().min(1).max(200),
    target_commit: z.string().regex(/^[a-f0-9]{4,64}$/),
    deep_link_template: z.string().min(1),
  }),
});

// 未来加 ArticleSourceSchema / StorySourceSchema 时,扩 discriminatedUnion 即可
const SourceSchema = z.discriminatedUnion('type', [CodebaseSourceSchema]);

const ChapterEntrySchema = z.object({
  id: SlugSchema,
  order: z.number().int().min(1),
  title: z.string().min(1).max(200),
  path: RelativePathSchema,
  estimated_minutes: z.number().int().min(1).max(600),
  quiz_path: RelativePathSchema.optional(),
  tags: z.array(z.string().min(1).max(64)).max(20).optional(),
});

const TourStepSchema = z.object({
  order: z.number().int().min(1),
  title: z.string().min(1).max(200),
  path: RelativePathSchema,
});

const TourSchema = z.object({
  id: SlugSchema,
  title: z.string().min(1).max(200),
  overview_path: RelativePathSchema,
  steps: z.array(TourStepSchema).min(1).max(50),
});

const FigureEntrySchema = z.object({
  id: SlugSchema,
  path: RelativePathSchema,
  title: z.string().min(1).max(200),
});

// content_type 与 source.type 的 cross-field consistency
function refineSourceConsistency<T extends { content_type: string; source: { type: string } }>(
  m: T,
  ctx: z.RefinementCtx,
) {
  if (m.content_type !== m.source.type) {
    ctx.addIssue({
      code: 'custom',
      path: ['source', 'type'],
      message: `source.type (${m.source.type}) must match content_type (${m.content_type})`,
    });
  }
}

function refineUniqueChapterIds(
  chapters: ReadonlyArray<{ id: string }>,
  ctx: z.RefinementCtx,
) {
  const seen = new Set<string>();
  chapters.forEach((c, i) => {
    if (seen.has(c.id)) {
      ctx.addIssue({
        code: 'custom',
        path: ['chapters', i, 'id'],
        message: `duplicate chapter id: ${c.id}`,
      });
    }
    seen.add(c.id);
  });
}

export const ManifestSchema = z
  .object({
    schema_version: SchemaVersionSchema,
    content_type: ContentTypeSchema,
    subject: SubjectSchema,
    wiki_version: WikiVersionSchema,
    source: SourceSchema,
    chapters: z.array(ChapterEntrySchema).min(1).max(50),
    tours: z.array(TourSchema).max(20),
    glossary_path: RelativePathSchema,
    figures: z.array(FigureEntrySchema).max(100),
  })
  .superRefine((m, ctx) => {
    refineSourceConsistency(m, ctx);
    refineUniqueChapterIds(m.chapters, ctx);
  });

export type Manifest = z.infer<typeof ManifestSchema>;
export type ChapterEntry = z.infer<typeof ChapterEntrySchema>;
export type Tour = z.infer<typeof TourSchema>;
export type FigureEntry = z.infer<typeof FigureEntrySchema>;
```

- [ ] **Step 4: 跑测试,确认全过**

Run: `cd /Users/xgliu/Documents/git/codebase-wiki/shared && npx vitest run test/manifest.test.ts`
Expected: PASS,9 个用例全绿。

- [ ] **Step 5: re-export + commit**

修改 `shared/src/index.ts`:

```ts
export * from './common.js';
export * from './manifest.js';
```

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && git add shared/src/manifest.ts shared/src/index.ts shared/test/manifest.test.ts && git commit -m "shared/manifest: ManifestSchema (zod) with source discriminated union"
```

---

## Task 5: `shared/src/quiz.ts` — QuizSchema

**Files:**
- Create: `shared/src/quiz.ts`
- Create: `shared/test/quiz.test.ts`

**Context:** 每个 chapter 对应一个 `quizzes/<chapter-slug>.json`,含 1+ MCQ。`answer` 始终是 array(单选时长度 1),且必须引用 `options[].id` 子集。

- [ ] **Step 1: 写失败测试 `shared/test/quiz.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { QuizSchema, RedactedQuizSchema, type Quiz, type RedactedQuiz } from '../src/quiz.js';

const validQuiz = {
  schema_version: '1.0',
  chapter_id: 'architecture-overview',
  questions: [
    {
      id: 'architecture-overview-q1',
      type: 'mcq-single',
      stem: 'Why does vLLM use PagedAttention?',
      options: [
        { id: 'a', text: 'To compress weights' },
        { id: 'b', text: 'To page KV cache like virtual memory' },
        { id: 'c', text: 'To skip attention' },
        { id: 'd', text: 'To use less GPU memory by quantization' },
      ],
      answer: ['b'],
      explanation: 'Traditional contiguous KV alloc fragments...',
      difficulty: 'easy',
      tags: ['memory'],
    },
    {
      id: 'architecture-overview-q2',
      type: 'mcq-multi',
      stem: 'Which of the following are true...',
      options: [
        { id: 'a', text: 'opt a' },
        { id: 'b', text: 'opt b' },
        { id: 'c', text: 'opt c' },
        { id: 'd', text: 'opt d' },
      ],
      answer: ['a', 'c'],
      explanation: '...',
      difficulty: 'medium',
    },
  ],
};

describe('QuizSchema', () => {
  it('accepts the canonical quiz', () => {
    const r = QuizSchema.safeParse(validQuiz);
    if (!r.success) console.error(r.error.format());
    expect(r.success).toBe(true);
  });

  it('rejects mcq-single with multiple answers', () => {
    const q = structuredClone(validQuiz);
    q.questions[0].answer = ['a', 'b'];
    expect(QuizSchema.safeParse(q).success).toBe(false);
  });

  it('rejects answer referencing missing option id', () => {
    const q = structuredClone(validQuiz);
    q.questions[0].answer = ['z'];
    expect(QuizSchema.safeParse(q).success).toBe(false);
  });

  it('rejects duplicate question ids within a quiz', () => {
    const q = structuredClone(validQuiz);
    q.questions[1].id = q.questions[0].id;
    expect(QuizSchema.safeParse(q).success).toBe(false);
  });

  it('rejects duplicate option ids within a question', () => {
    const q = structuredClone(validQuiz);
    q.questions[0].options[1].id = 'a';
    expect(QuizSchema.safeParse(q).success).toBe(false);
  });

  it('requires at least 2 options', () => {
    const q = structuredClone(validQuiz);
    q.questions[0].options = [{ id: 'a', text: 'only one' }];
    q.questions[0].answer = ['a'];
    expect(QuizSchema.safeParse(q).success).toBe(false);
  });

  it('requires at least 1 question', () => {
    const q = { ...validQuiz, questions: [] };
    expect(QuizSchema.safeParse(q).success).toBe(false);
  });

  it('allows references array', () => {
    const q = structuredClone(validQuiz);
    q.questions[0] = {
      ...q.questions[0],
      references: [{ chapter_id: 'architecture-overview', anchor: 'fragmentation' }],
    } as any;
    expect(QuizSchema.safeParse(q).success).toBe(true);
  });
});

describe('RedactedQuizSchema', () => {
  it('strips answer / explanation / references', () => {
    const fullParsed = QuizSchema.parse(validQuiz);
    const redacted: RedactedQuiz = {
      schema_version: fullParsed.schema_version,
      chapter_id: fullParsed.chapter_id,
      questions: fullParsed.questions.map((q) => ({
        id: q.id,
        type: q.type,
        stem: q.stem,
        options: q.options,
        difficulty: q.difficulty,
        tags: q.tags,
      })),
    };
    const r = RedactedQuizSchema.safeParse(redacted);
    expect(r.success).toBe(true);
  });

  it('rejects redacted shape carrying answer', () => {
    const bogus = {
      schema_version: '1.0',
      chapter_id: 'x',
      questions: [
        {
          id: 'x-q1',
          type: 'mcq-single',
          stem: 's',
          options: [{ id: 'a', text: 't1' }, { id: 'b', text: 't2' }],
          difficulty: 'easy',
          answer: ['a'],
        },
      ],
    };
    expect(RedactedQuizSchema.safeParse(bogus).success).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Users/xgliu/Documents/git/codebase-wiki/shared && npx vitest run test/quiz.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现 `shared/src/quiz.ts`**

```ts
import { z } from 'zod';
import { SlugSchema, SchemaVersionSchema } from './common.js';

const OptionSchema = z.object({
  id: z.string().regex(/^[a-z]$/, 'option id must be a single lowercase letter'),
  text: z.string().min(1).max(1000),
});

const ReferenceSchema = z.object({
  chapter_id: SlugSchema,
  anchor: z.string().min(1).max(200).optional(),
});

const DifficultySchema = z.enum(['easy', 'medium', 'hard']);
const QuestionTypeSchema = z.enum(['mcq-single', 'mcq-multi']);

// Full question (with answer + explanation) — for in-package storage and server side
const QuestionSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,127}$/),
    type: QuestionTypeSchema,
    stem: z.string().min(1).max(2000),
    options: z.array(OptionSchema).min(2).max(8),
    answer: z.array(z.string()).min(1).max(8),
    explanation: z.string().max(4000).optional(),
    references: z.array(ReferenceSchema).max(10).optional(),
    difficulty: DifficultySchema,
    tags: z.array(z.string().min(1).max(64)).max(10).optional(),
  })
  .superRefine((q, ctx) => {
    const optionIds = new Set(q.options.map((o) => o.id));
    if (optionIds.size !== q.options.length) {
      ctx.addIssue({ code: 'custom', message: 'duplicate option id', path: ['options'] });
    }
    if (q.type === 'mcq-single' && q.answer.length !== 1) {
      ctx.addIssue({
        code: 'custom',
        message: 'mcq-single must have exactly 1 answer',
        path: ['answer'],
      });
    }
    for (const a of q.answer) {
      if (!optionIds.has(a)) {
        ctx.addIssue({
          code: 'custom',
          message: `answer ${a} not in options`,
          path: ['answer'],
        });
      }
    }
  });

export const QuizSchema = z
  .object({
    schema_version: SchemaVersionSchema,
    chapter_id: SlugSchema,
    questions: z.array(QuestionSchema).min(1).max(20),
  })
  .superRefine((q, ctx) => {
    const seen = new Set<string>();
    q.questions.forEach((qq, i) => {
      if (seen.has(qq.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `duplicate question id: ${qq.id}`,
          path: ['questions', i, 'id'],
        });
      }
      seen.add(qq.id);
    });
  });

// Redacted version sent to the browser before submission (no answer / explanation / references)
const RedactedQuestionSchema = z.object({
  id: z.string(),
  type: QuestionTypeSchema,
  stem: z.string(),
  options: z.array(OptionSchema).min(2).max(8),
  difficulty: DifficultySchema,
  tags: z.array(z.string()).optional(),
}).strict();

export const RedactedQuizSchema = z.object({
  schema_version: SchemaVersionSchema,
  chapter_id: SlugSchema,
  questions: z.array(RedactedQuestionSchema).min(1),
});

export type Quiz = z.infer<typeof QuizSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type RedactedQuiz = z.infer<typeof RedactedQuizSchema>;

/** Strip answer-bearing fields for browser consumption */
export function redactQuiz(quiz: Quiz): RedactedQuiz {
  return {
    schema_version: quiz.schema_version,
    chapter_id: quiz.chapter_id,
    questions: quiz.questions.map((q) => ({
      id: q.id,
      type: q.type,
      stem: q.stem,
      options: q.options,
      difficulty: q.difficulty,
      ...(q.tags !== undefined ? { tags: q.tags } : {}),
    })),
  };
}
```

- [ ] **Step 4: 跑测试,全过**

Run: `cd /Users/xgliu/Documents/git/codebase-wiki/shared && npx vitest run test/quiz.test.ts`
Expected: PASS。

- [ ] **Step 5: re-export + commit**

```ts
// shared/src/index.ts
export * from './common.js';
export * from './manifest.js';
export * from './quiz.js';
```

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && git add shared/src/quiz.ts shared/src/index.ts shared/test/quiz.test.ts && git commit -m "shared/quiz: QuizSchema + RedactedQuizSchema + redactQuiz()"
```

---

## Task 6: `shared/src/glossary.ts` — GlossarySchema

**Files:**
- Create: `shared/src/glossary.ts`
- Create: `shared/test/glossary.test.ts`

**Context:** 简单 — `terms[]` with id / term / aliases / definition / see_also。see_also 在 schema 里只校验是 slug,运行时 viewer 自己处理「指向的 id 不存在」(graceful 跳过)。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from 'vitest';
import { GlossarySchema } from '../src/glossary.js';

const valid = {
  schema_version: '1.0',
  terms: [
    {
      id: 'kv-cache',
      term: 'KV cache',
      aliases: ['key-value cache'],
      definition: 'Storage of attention keys/values...',
      see_also: ['paged-attention'],
    },
    {
      id: 'paged-attention',
      term: 'PagedAttention',
      definition: 'Page-table-based KV management',
    },
  ],
};

describe('GlossarySchema', () => {
  it('accepts canonical glossary', () => {
    expect(GlossarySchema.safeParse(valid).success).toBe(true);
  });

  it('rejects duplicate term ids', () => {
    const g = structuredClone(valid);
    g.terms[1].id = 'kv-cache';
    expect(GlossarySchema.safeParse(g).success).toBe(false);
  });

  it('allows empty aliases / see_also', () => {
    const g = { schema_version: '1.0', terms: [{ id: 'x', term: 'X', definition: 'd' }] };
    expect(GlossarySchema.safeParse(g).success).toBe(true);
  });

  it('rejects empty term string', () => {
    const g = structuredClone(valid);
    g.terms[0].term = '';
    expect(GlossarySchema.safeParse(g).success).toBe(false);
  });

  it('rejects invalid slug in id', () => {
    const g = structuredClone(valid);
    g.terms[0].id = 'KV Cache';
    expect(GlossarySchema.safeParse(g).success).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Users/xgliu/Documents/git/codebase-wiki/shared && npx vitest run test/glossary.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现 `shared/src/glossary.ts`**

```ts
import { z } from 'zod';
import { SlugSchema, SchemaVersionSchema } from './common.js';

const TermSchema = z.object({
  id: SlugSchema,
  term: z.string().min(1).max(200),
  aliases: z.array(z.string().min(1).max(200)).max(20).optional(),
  definition: z.string().min(1).max(4000),
  see_also: z.array(SlugSchema).max(20).optional(),
});

export const GlossarySchema = z
  .object({
    schema_version: SchemaVersionSchema,
    terms: z.array(TermSchema).max(1000),
  })
  .superRefine((g, ctx) => {
    const seen = new Set<string>();
    g.terms.forEach((t, i) => {
      if (seen.has(t.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `duplicate term id: ${t.id}`,
          path: ['terms', i, 'id'],
        });
      }
      seen.add(t.id);
    });
  });

export type Glossary = z.infer<typeof GlossarySchema>;
export type Term = z.infer<typeof TermSchema>;
```

- [ ] **Step 4: 跑测试,全过**

Run: `cd /Users/xgliu/Documents/git/codebase-wiki/shared && npx vitest run test/glossary.test.ts`
Expected: PASS。

- [ ] **Step 5: re-export + commit**

```ts
// shared/src/index.ts
export * from './common.js';
export * from './manifest.js';
export * from './quiz.js';
export * from './glossary.js';
```

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && git add shared/src/glossary.ts shared/src/index.ts shared/test/glossary.test.ts && git commit -m "shared/glossary: GlossarySchema"
```

---

## Task 7: `shared` build sanity + full test run

**Files:** none new

**Context:** 确认 shared workspace 整体能 build,所有测试一起跑过。这是 Plan B/D 的依赖前提。

- [ ] **Step 1: 跑 build**

Run: `cd /Users/xgliu/Documents/git/codebase-wiki && npm run build --workspace @codebase-wiki/shared`
Expected: 生成 `shared/dist/`,无 TS 错。

- [ ] **Step 2: 跑全测**

Run: `cd /Users/xgliu/Documents/git/codebase-wiki && npm test --workspace @codebase-wiki/shared`
Expected: 三个测试文件全过(common + manifest + quiz + glossary = 30+ 用例)。

- [ ] **Step 3: 把 dist/ 加入 .gitignore(如果还没) + commit 标记点**

确认 `.gitignore` 已包含 `dist/`(Task 1 应已加)。

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && git status
```
若 working tree clean,跳过 commit。否则:

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && git add -A && git commit -m "shared: build clean, all schemas tested"
```

---

## Task 8: `tools/wikipkg/` workspace 骨架

**Files:**
- Create: `tools/wikipkg/package.json`
- Create: `tools/wikipkg/tsconfig.json`
- Create: `tools/wikipkg/src/cli.ts`
- Create: `tools/wikipkg/vitest.config.ts`

**Context:** 命令行入口最终是 `wikipkg validate <dir>` 和 `wikipkg pack <dir> <out>.tar.gz`。tar 用 node 自带 `node:tar` 不存在,改用 `tar` npm 包(成熟、Anthropic 项目里也常用)。

- [ ] **Step 1: 写 `tools/wikipkg/package.json`**

```json
{
  "name": "@codebase-wiki/wikipkg",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "bin": {
    "wikipkg": "./dist/cli.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "check": "tsc -p tsconfig.json --noEmit",
    "wikipkg": "node ./dist/cli.js"
  },
  "dependencies": {
    "@codebase-wiki/shared": "*",
    "tar": "^7.4.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: 写 `tools/wikipkg/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: 写占位 `tools/wikipkg/src/cli.ts`**

```ts
#!/usr/bin/env node
console.log('wikipkg cli placeholder');
```

- [ ] **Step 4: 写 vitest config**

```ts
// tools/wikipkg/vitest.config.ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 5: 安装依赖**

Run: `cd /Users/xgliu/Documents/git/codebase-wiki && npm install`
Expected: tar 包装好。

- [ ] **Step 6: smoke + commit**

Run: `cd /Users/xgliu/Documents/git/codebase-wiki && npm run check --workspace @codebase-wiki/wikipkg`
Expected: 无 TS 错。

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && git add tools/wikipkg/ package-lock.json && git commit -m "tools/wikipkg: workspace scaffold (CLI placeholder)"
```

---

## Task 9: `wikipkg validate <dir>` 实现

**Files:**
- Create: `tools/wikipkg/src/validate.ts`
- Modify: `tools/wikipkg/src/cli.ts`
- Create: `tools/wikipkg/test/validate.test.ts`
- Create: `tools/wikipkg/test/fixtures/valid/manifest.json` + 配套文件
- Create: `tools/wikipkg/test/fixtures/invalid-missing-manifest/`
- Create: `tools/wikipkg/test/fixtures/invalid-path-traversal/manifest.json`
- Create: `tools/wikipkg/test/fixtures/invalid-orphan-path/manifest.json`

**Context:** validate 读取 `<dir>/manifest.json`,zod parse,然后逐一检查 manifest 声明的每个 path 实际文件存在。失败时通过 stderr 输出错误并 exit 非 0。

- [ ] **Step 1: 写 valid fixture 文件**

Create `tools/wikipkg/test/fixtures/valid/manifest.json`:

```json
{
  "schema_version": "1.0",
  "content_type": "codebase",
  "subject": {
    "slug": "demo",
    "name": "Demo",
    "language": "en"
  },
  "wiki_version": {
    "label": "v0.1.0",
    "generated_at": "2026-05-25T00:00:00Z",
    "generator": { "name": "codebase-wiki", "version": "2.0.0" }
  },
  "source": {
    "type": "codebase",
    "codebase": {
      "repo_url": "https://github.com/example/demo",
      "target_ref": "v0.1.0",
      "target_commit": "abcdef0",
      "deep_link_template": "https://github.com/example/demo/blob/{commit}/{path}#L{line}"
    }
  },
  "chapters": [
    {
      "id": "intro",
      "order": 1,
      "title": "Intro",
      "path": "chapters/intro.md",
      "estimated_minutes": 5,
      "quiz_path": "quizzes/intro.json"
    }
  ],
  "tours": [],
  "glossary_path": "glossary.json",
  "figures": []
}
```

Create `tools/wikipkg/test/fixtures/valid/chapters/intro.md`:

```markdown
# Intro

This is a tiny demo chapter.
```

Create `tools/wikipkg/test/fixtures/valid/quizzes/intro.json`:

```json
{
  "schema_version": "1.0",
  "chapter_id": "intro",
  "questions": [
    {
      "id": "intro-q1",
      "type": "mcq-single",
      "stem": "2 + 2 = ?",
      "options": [
        { "id": "a", "text": "3" },
        { "id": "b", "text": "4" }
      ],
      "answer": ["b"],
      "difficulty": "easy"
    }
  ]
}
```

Create `tools/wikipkg/test/fixtures/valid/glossary.json`:

```json
{ "schema_version": "1.0", "terms": [] }
```

- [ ] **Step 2: 写 invalid fixtures**

`tools/wikipkg/test/fixtures/invalid-missing-manifest/.gitkeep`(空目录占位)

`tools/wikipkg/test/fixtures/invalid-path-traversal/manifest.json`:

```json
{
  "schema_version": "1.0",
  "content_type": "codebase",
  "subject": { "slug": "demo", "name": "Demo", "language": "en" },
  "wiki_version": {
    "label": "v0.1.0",
    "generated_at": "2026-05-25T00:00:00Z",
    "generator": { "name": "codebase-wiki", "version": "2.0.0" }
  },
  "source": {
    "type": "codebase",
    "codebase": {
      "repo_url": "https://github.com/example/demo",
      "target_ref": "v0.1.0",
      "target_commit": "abcdef0",
      "deep_link_template": "https://x/{commit}/{path}#L{line}"
    }
  },
  "chapters": [{
    "id": "intro", "order": 1, "title": "Intro",
    "path": "../etc/passwd", "estimated_minutes": 5
  }],
  "tours": [],
  "glossary_path": "glossary.json",
  "figures": []
}
```

`tools/wikipkg/test/fixtures/invalid-orphan-path/manifest.json`(manifest 引用不存在的文件):

```json
{
  "schema_version": "1.0",
  "content_type": "codebase",
  "subject": { "slug": "demo", "name": "Demo", "language": "en" },
  "wiki_version": {
    "label": "v0.1.0",
    "generated_at": "2026-05-25T00:00:00Z",
    "generator": { "name": "codebase-wiki", "version": "2.0.0" }
  },
  "source": {
    "type": "codebase",
    "codebase": {
      "repo_url": "https://github.com/example/demo",
      "target_ref": "v0.1.0",
      "target_commit": "abcdef0",
      "deep_link_template": "https://x/{commit}/{path}#L{line}"
    }
  },
  "chapters": [{
    "id": "intro", "order": 1, "title": "Intro",
    "path": "chapters/intro.md", "estimated_minutes": 5
  }],
  "tours": [],
  "glossary_path": "glossary.json",
  "figures": []
}
```
(orphan 测试故意不放 chapters/intro.md / glossary.json)

- [ ] **Step 3: 写失败测试 `tools/wikipkg/test/validate.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateWikipkgDir } from '../src/validate.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = (n: string) => resolve(here, 'fixtures', n);

describe('validateWikipkgDir', () => {
  it('passes on the valid fixture', async () => {
    const r = await validateWikipkgDir(fixtures('valid'));
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('should not reach');
    expect(r.manifest.subject.slug).toBe('demo');
  });

  it('fails on missing manifest.json', async () => {
    const r = await validateWikipkgDir(fixtures('invalid-missing-manifest'));
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('should not reach');
    expect(r.errors[0].code).toBe('manifest_missing');
  });

  it('fails on path traversal in chapters[].path', async () => {
    const r = await validateWikipkgDir(fixtures('invalid-path-traversal'));
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('should not reach');
    expect(r.errors.some((e) => e.code === 'manifest_invalid')).toBe(true);
  });

  it('fails on orphan path (manifest references missing file)', async () => {
    const r = await validateWikipkgDir(fixtures('invalid-orphan-path'));
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('should not reach');
    expect(r.errors.some((e) => e.code === 'referenced_file_missing')).toBe(true);
  });
});
```

- [ ] **Step 4: 跑测试确认失败**

Run: `cd /Users/xgliu/Documents/git/codebase-wiki/tools/wikipkg && npx vitest run test/validate.test.ts`
Expected: FAIL —— cannot resolve `../src/validate.js`。

- [ ] **Step 5: 实现 `tools/wikipkg/src/validate.ts`**

```ts
import { readFile, stat } from 'node:fs/promises';
import { resolve, isAbsolute, normalize } from 'node:path';
import { ManifestSchema, type Manifest, QuizSchema, GlossarySchema } from '@codebase-wiki/shared';

export type ValidationError = {
  code:
    | 'manifest_missing'
    | 'manifest_malformed'
    | 'manifest_invalid'
    | 'referenced_file_missing'
    | 'quiz_malformed'
    | 'glossary_malformed';
  message: string;
  path?: string;
};

export type ValidationResult =
  | { ok: true; manifest: Manifest }
  | { ok: false; errors: ValidationError[] };

async function fileExists(p: string): Promise<boolean> {
  try {
    const s = await stat(p);
    return s.isFile();
  } catch {
    return false;
  }
}

function isSafeRelative(rel: string, baseDir: string): boolean {
  if (isAbsolute(rel)) return false;
  const resolved = resolve(baseDir, rel);
  return resolved.startsWith(resolve(baseDir));
}

export async function validateWikipkgDir(dir: string): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const manifestPath = resolve(dir, 'manifest.json');

  if (!(await fileExists(manifestPath))) {
    return { ok: false, errors: [{ code: 'manifest_missing', message: `no manifest.json in ${dir}` }] };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (e) {
    return { ok: false, errors: [{ code: 'manifest_malformed', message: String(e) }] };
  }

  const parsed = ManifestSchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push({
        code: 'manifest_invalid',
        message: issue.message,
        path: issue.path.join('.'),
      });
    }
    return { ok: false, errors };
  }
  const manifest = parsed.data;

  // Cross-check: every declared path exists and is inside dir
  const checkPath = async (rel: string, label: string) => {
    if (!isSafeRelative(rel, dir)) {
      errors.push({ code: 'manifest_invalid', message: `${label}: path traversal: ${rel}`, path: label });
      return;
    }
    if (!(await fileExists(resolve(dir, rel)))) {
      errors.push({ code: 'referenced_file_missing', message: `${label}: file missing: ${rel}`, path: label });
    }
  };

  for (const ch of manifest.chapters) {
    await checkPath(ch.path, `chapters[${ch.id}].path`);
    if (ch.quiz_path) await checkPath(ch.quiz_path, `chapters[${ch.id}].quiz_path`);
  }
  for (const t of manifest.tours) {
    await checkPath(t.overview_path, `tours[${t.id}].overview_path`);
    for (const s of t.steps) await checkPath(s.path, `tours[${t.id}].steps[${s.order}].path`);
  }
  for (const f of manifest.figures) {
    await checkPath(f.path, `figures[${f.id}].path`);
  }
  await checkPath(manifest.glossary_path, 'glossary_path');

  // Deep-validate quiz / glossary JSONs (manifest schema only ensures paths exist)
  for (const ch of manifest.chapters) {
    if (!ch.quiz_path) continue;
    const qPath = resolve(dir, ch.quiz_path);
    if (await fileExists(qPath)) {
      try {
        const qRaw = JSON.parse(await readFile(qPath, 'utf8'));
        const qParsed = QuizSchema.safeParse(qRaw);
        if (!qParsed.success) {
          for (const issue of qParsed.error.issues) {
            errors.push({
              code: 'quiz_malformed',
              message: `${ch.quiz_path}: ${issue.message}`,
              path: issue.path.join('.'),
            });
          }
        } else if (qParsed.data.chapter_id !== ch.id) {
          errors.push({
            code: 'quiz_malformed',
            message: `${ch.quiz_path}: chapter_id ${qParsed.data.chapter_id} != ${ch.id}`,
          });
        }
      } catch (e) {
        errors.push({ code: 'quiz_malformed', message: `${ch.quiz_path}: ${e}` });
      }
    }
  }

  const gPath = resolve(dir, manifest.glossary_path);
  if (await fileExists(gPath)) {
    try {
      const gRaw = JSON.parse(await readFile(gPath, 'utf8'));
      const gParsed = GlossarySchema.safeParse(gRaw);
      if (!gParsed.success) {
        for (const issue of gParsed.error.issues) {
          errors.push({
            code: 'glossary_malformed',
            message: issue.message,
            path: issue.path.join('.'),
          });
        }
      }
    } catch (e) {
      errors.push({ code: 'glossary_malformed', message: String(e) });
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, manifest };
}
```

- [ ] **Step 6: 跑测试,全过**

`tools/wikipkg` 通过 `@codebase-wiki/shared` 的 `dist/index.js` 解析类型 + 运行代码,所以必须先 build shared。Task 7 已构建过;若中断后回来,先重跑一次:

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && npm run build --workspace @codebase-wiki/shared
```

然后:

```bash
cd /Users/xgliu/Documents/git/codebase-wiki/tools/wikipkg && npm run build && npx vitest run test/validate.test.ts
```
Expected: PASS,4 个用例全绿。

- [ ] **Step 7: 接 CLI subcommand**

修改 `tools/wikipkg/src/cli.ts`:

```ts
#!/usr/bin/env node
import { validateWikipkgDir } from './validate.js';

async function main() {
  const [, , cmd, ...args] = process.argv;
  if (cmd === 'validate') {
    const dir = args[0];
    if (!dir) {
      console.error('usage: wikipkg validate <dir>');
      process.exit(2);
    }
    const r = await validateWikipkgDir(dir);
    if (r.ok) {
      console.log(`OK: ${dir} validates as wikipkg schema_version=${r.manifest.schema_version}`);
      process.exit(0);
    } else {
      for (const e of r.errors) {
        console.error(`[${e.code}] ${e.path ? e.path + ': ' : ''}${e.message}`);
      }
      process.exit(1);
    }
  }
  console.error(`unknown command: ${cmd}\nusage: wikipkg <validate|pack> ...`);
  process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 8: 手动 smoke test**

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && npm run build --workspace @codebase-wiki/wikipkg
cd /Users/xgliu/Documents/git/codebase-wiki && node tools/wikipkg/dist/cli.js validate tools/wikipkg/test/fixtures/valid
```
Expected: `OK: ... validates as wikipkg schema_version=1.0`,exit 0。

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && node tools/wikipkg/dist/cli.js validate tools/wikipkg/test/fixtures/invalid-orphan-path; echo "exit=$?"
```
Expected: 输出 `[referenced_file_missing] ...`,`exit=1`。

- [ ] **Step 9: commit**

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && git add tools/wikipkg/src/validate.ts tools/wikipkg/src/cli.ts tools/wikipkg/test/ && git commit -m "wikipkg validate: schema + path + nested quiz/glossary checks"
```

---

## Task 10: `wikipkg pack <dir> <out>.tar.gz` 实现

**Files:**
- Create: `tools/wikipkg/src/pack.ts`
- Modify: `tools/wikipkg/src/cli.ts`
- Create: `tools/wikipkg/test/pack.test.ts`

**Context:** pack 先 call validate;通过后用 `tar` 包打成 gzip。要求:tarball 入口为 manifest.json,不带顶层目录(`tar -C dir -czf out .`)。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as tar from 'tar';
import { packWikipkg } from '../src/pack.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = (n: string) => resolve(here, 'fixtures', n);

describe('packWikipkg', () => {
  let workDir: string;
  beforeAll(async () => {
    workDir = await mkdtemp(resolve(tmpdir(), 'wikipkg-'));
  });
  afterAll(async () => {
    if (workDir) await rm(workDir, { recursive: true, force: true });
  });

  it('packs the valid fixture and roundtrips', async () => {
    const out = resolve(workDir, 'out.wikipkg.tar.gz');
    const r = await packWikipkg(fixtures('valid'), out);
    expect(r.ok).toBe(true);

    const extractDir = resolve(workDir, 'extract');
    await import('node:fs/promises').then((fs) => fs.mkdir(extractDir, { recursive: true }));
    await tar.extract({ file: out, cwd: extractDir });
    const top = await readdir(extractDir);
    expect(top).toContain('manifest.json');
    expect(top).toContain('chapters');
    expect(top).toContain('quizzes');
    expect(top).toContain('glossary.json');
  });

  it('refuses to pack an invalid wikipkg dir', async () => {
    const out = resolve(workDir, 'bad.tar.gz');
    const r = await packWikipkg(fixtures('invalid-orphan-path'), out);
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Users/xgliu/Documents/git/codebase-wiki/tools/wikipkg && npx vitest run test/pack.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现 `tools/wikipkg/src/pack.ts`**

```ts
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as tar from 'tar';
import { validateWikipkgDir, type ValidationError } from './validate.js';

export type PackResult =
  | { ok: true; outPath: string; entries: number }
  | { ok: false; errors: ValidationError[] };

export async function packWikipkg(dir: string, outPath: string): Promise<PackResult> {
  const v = await validateWikipkgDir(dir);
  if (!v.ok) return { ok: false, errors: v.errors };

  // Collect top-level entries to pack (excludes nothing — wikipkg dir is already clean)
  const entries = await readdir(dir);

  await tar.create(
    {
      gzip: true,
      file: outPath,
      cwd: dir,
      portable: true,
    },
    entries,
  );

  return { ok: true, outPath: resolve(outPath), entries: entries.length };
}
```

- [ ] **Step 4: 跑测试,全过**

Run: `cd /Users/xgliu/Documents/git/codebase-wiki/tools/wikipkg && npm run build && npx vitest run test/pack.test.ts`
Expected: PASS。

- [ ] **Step 5: 在 CLI 接 pack subcommand**

修改 `tools/wikipkg/src/cli.ts`,在 `validate` 分支之后、`unknown command` 之前插入:

```ts
  if (cmd === 'pack') {
    const [dir, out] = args;
    if (!dir || !out) {
      console.error('usage: wikipkg pack <dir> <out.wikipkg.tar.gz>');
      process.exit(2);
    }
    const { packWikipkg } = await import('./pack.js');
    const r = await packWikipkg(dir, out);
    if (r.ok) {
      console.log(`OK: packed ${r.entries} top-level entries → ${r.outPath}`);
      process.exit(0);
    } else {
      for (const e of r.errors) {
        console.error(`[${e.code}] ${e.path ? e.path + ': ' : ''}${e.message}`);
      }
      process.exit(1);
    }
  }
```

- [ ] **Step 6: 手动 smoke test**

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && npm run build --workspace @codebase-wiki/wikipkg
cd /tmp && node /Users/xgliu/Documents/git/codebase-wiki/tools/wikipkg/dist/cli.js pack \
  /Users/xgliu/Documents/git/codebase-wiki/tools/wikipkg/test/fixtures/valid \
  /tmp/demo.wikipkg.tar.gz
tar -tzf /tmp/demo.wikipkg.tar.gz | sort
rm /tmp/demo.wikipkg.tar.gz
```
Expected: list 含 `manifest.json` / `chapters/intro.md` / `quizzes/intro.json` / `glossary.json`。

- [ ] **Step 7: commit**

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && git add tools/wikipkg/src/pack.ts tools/wikipkg/src/cli.ts tools/wikipkg/test/pack.test.ts && git commit -m "wikipkg pack: validate-then-tar-gz with portable mode"
```

---

## Task 11: `examples/sample-wikipkg/` 真实样本

**Files:**
- Create: `examples/sample-wikipkg/manifest.json`
- Create: `examples/sample-wikipkg/chapters/01-intro.md` 等 3 章
- Create: `examples/sample-wikipkg/quizzes/intro.json` 等
- Create: `examples/sample-wikipkg/figures/architecture.svg`
- Create: `examples/sample-wikipkg/glossary.json`
- Create: `examples/sample-wikipkg/tours/main/00-overview.md` 等

**Context:** 给 Plan B 服务的测试夹具用。比 `tools/wikipkg/test/fixtures/valid` 完整一些(3 章 + 1 tour + figure + glossary 含几个词条)。这是「真实」样本,不是单测夹具,所以放 `examples/`。

- [ ] **Step 1: 创建 `examples/sample-wikipkg/manifest.json`**

```json
{
  "schema_version": "1.0",
  "content_type": "codebase",
  "subject": {
    "slug": "tiny-counter",
    "name": "Tiny Counter Service",
    "description": "A toy service for demo wiki, used as integration fixture for codebase-wiki service",
    "language": "en"
  },
  "wiki_version": {
    "label": "v0.1.0",
    "generated_at": "2026-05-25T00:00:00Z",
    "generator": { "name": "codebase-wiki", "version": "2.0.0" }
  },
  "source": {
    "type": "codebase",
    "codebase": {
      "repo_url": "https://github.com/example/tiny-counter",
      "target_ref": "v0.1.0",
      "target_commit": "1234567",
      "deep_link_template": "https://github.com/example/tiny-counter/blob/{commit}/{path}#L{line}"
    }
  },
  "chapters": [
    {
      "id": "intro",
      "order": 1,
      "title": "Introduction",
      "path": "chapters/intro.md",
      "estimated_minutes": 3,
      "quiz_path": "quizzes/intro.json",
      "tags": ["overview"]
    },
    {
      "id": "architecture",
      "order": 2,
      "title": "Architecture",
      "path": "chapters/architecture.md",
      "estimated_minutes": 5,
      "quiz_path": "quizzes/architecture.json"
    },
    {
      "id": "request-flow",
      "order": 3,
      "title": "Request Flow",
      "path": "chapters/request-flow.md",
      "estimated_minutes": 7,
      "quiz_path": "quizzes/request-flow.json"
    }
  ],
  "tours": [
    {
      "id": "main",
      "title": "Following a single increment request",
      "overview_path": "tours/main/00-overview.md",
      "steps": [
        { "order": 1, "title": "HTTP entry", "path": "tours/main/01-http-entry.md" },
        { "order": 2, "title": "Counter update", "path": "tours/main/02-counter-update.md" }
      ]
    }
  ],
  "glossary_path": "glossary.json",
  "figures": [
    { "id": "architecture", "path": "figures/architecture.svg", "title": "System architecture" }
  ]
}
```

- [ ] **Step 2: 创建 3 章 markdown**

`examples/sample-wikipkg/chapters/intro.md`:

````markdown
# Introduction

Tiny Counter is a minimal HTTP service that maintains a single counter in memory and exposes increment / read endpoints.

This wiki is **not** documenting a real codebase — it exists as an integration fixture for the codebase-wiki **service** to consume during development of Plan B.

## What you'll learn

- The two HTTP endpoints (§ architecture)
- How a single increment request flows end-to-end (§ request-flow + tour `main`)
````

`examples/sample-wikipkg/chapters/architecture.md`:

````markdown
# Architecture

Three layers:

1. HTTP server (Express)
2. Counter store (in-memory `{ value: number }`)
3. Locking layer (single `Mutex`)

![architecture diagram](figures/architecture.svg)

The locking layer ensures concurrent increment requests do not race.
````

`examples/sample-wikipkg/chapters/request-flow.md`:

````markdown
# Request Flow

When a client POSTs `/increment`:

1. Express route matches `POST /increment`
2. Handler acquires the mutex
3. Handler reads `counter.value`, increments, writes back
4. Releases mutex
5. Returns `{ value: <new> }` as JSON

The mutex is held only across the read-modify-write, not during JSON serialization.
````

- [ ] **Step 3: 创建 3 个 quiz JSON**

`examples/sample-wikipkg/quizzes/intro.json`:

```json
{
  "schema_version": "1.0",
  "chapter_id": "intro",
  "questions": [
    {
      "id": "intro-q1",
      "type": "mcq-single",
      "stem": "Why does this wiki exist?",
      "options": [
        { "id": "a", "text": "To document a real production service" },
        { "id": "b", "text": "As a test fixture for codebase-wiki service development" },
        { "id": "c", "text": "As a tutorial for HTTP servers" }
      ],
      "answer": ["b"],
      "explanation": "Stated explicitly in the intro chapter.",
      "difficulty": "easy"
    }
  ]
}
```

`examples/sample-wikipkg/quizzes/architecture.json`:

```json
{
  "schema_version": "1.0",
  "chapter_id": "architecture",
  "questions": [
    {
      "id": "architecture-q1",
      "type": "mcq-single",
      "stem": "How many layers does Tiny Counter have?",
      "options": [
        { "id": "a", "text": "1" },
        { "id": "b", "text": "2" },
        { "id": "c", "text": "3" },
        { "id": "d", "text": "4" }
      ],
      "answer": ["c"],
      "difficulty": "easy"
    },
    {
      "id": "architecture-q2",
      "type": "mcq-multi",
      "stem": "Which statements about the locking layer are true?",
      "options": [
        { "id": "a", "text": "Prevents race on increment" },
        { "id": "b", "text": "Uses a Mutex" },
        { "id": "c", "text": "Held during JSON serialization" }
      ],
      "answer": ["a", "b"],
      "difficulty": "medium"
    }
  ]
}
```

`examples/sample-wikipkg/quizzes/request-flow.json`:

```json
{
  "schema_version": "1.0",
  "chapter_id": "request-flow",
  "questions": [
    {
      "id": "request-flow-q1",
      "type": "mcq-single",
      "stem": "What does the handler do AFTER releasing the mutex?",
      "options": [
        { "id": "a", "text": "Reads counter.value" },
        { "id": "b", "text": "Returns JSON response" },
        { "id": "c", "text": "Acquires mutex again" }
      ],
      "answer": ["b"],
      "difficulty": "easy"
    }
  ]
}
```

- [ ] **Step 4: 创建 tour markdown**

`examples/sample-wikipkg/tours/main/00-overview.md`:

````markdown
# Tour: Following a single increment request

This tour follows what happens when a client POSTs `/increment`. Two steps.
````

`examples/sample-wikipkg/tours/main/01-http-entry.md`:

````markdown
# Step 1: HTTP entry

Express's router matches `POST /increment` and dispatches to the handler.

**Naive design:** call counter update directly. **Fails** if two requests arrive concurrently — last-write-wins race. **Actual design** (next step) inserts a mutex.
````

`examples/sample-wikipkg/tours/main/02-counter-update.md`:

````markdown
# Step 2: Counter update under lock

Handler:

1. Acquires the mutex
2. Reads `counter.value`
3. Increments
4. Writes back
5. Releases mutex
6. Returns JSON

This ensures linearizable increment semantics.
````

- [ ] **Step 5: 创建 figure SVG**

`examples/sample-wikipkg/figures/architecture.svg`:

```svg
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 160">
  <rect data-role="box" x="20" y="20" width="280" height="30" fill="none" stroke="currentColor"/>
  <text x="160" y="40" text-anchor="middle" font-family="sans-serif" font-size="14">HTTP server (Express)</text>
  <rect data-role="box" x="20" y="65" width="280" height="30" fill="none" stroke="currentColor"/>
  <text x="160" y="85" text-anchor="middle" font-family="sans-serif" font-size="14">Locking layer (Mutex)</text>
  <rect data-role="box" x="20" y="110" width="280" height="30" fill="none" stroke="currentColor"/>
  <text x="160" y="130" text-anchor="middle" font-family="sans-serif" font-size="14">Counter store (in-memory)</text>
</svg>
```

注意:**无 `<style>` 标签 / 无 `<script>` 标签**,所有 stroke/fill 用 `currentColor` 或属性形式。

- [ ] **Step 6: 创建 glossary**

`examples/sample-wikipkg/glossary.json`:

```json
{
  "schema_version": "1.0",
  "terms": [
    {
      "id": "mutex",
      "term": "Mutex",
      "aliases": ["mutual exclusion lock"],
      "definition": "A synchronization primitive that ensures only one thread/handler accesses a shared resource at a time.",
      "see_also": ["race-condition"]
    },
    {
      "id": "race-condition",
      "term": "Race condition",
      "definition": "A bug class where the outcome depends on non-deterministic ordering of concurrent operations.",
      "see_also": ["mutex"]
    }
  ]
}
```

- [ ] **Step 7: 用 wikipkg validate 跑一遍**

Run:
```bash
cd /Users/xgliu/Documents/git/codebase-wiki && node tools/wikipkg/dist/cli.js validate examples/sample-wikipkg
```
Expected: `OK: examples/sample-wikipkg validates as wikipkg schema_version=1.0`,exit 0。

如果失败,按错误信息修对应文件(常见错误:JSON 拼写、path 与文件名不匹配)。

- [ ] **Step 8: 用 wikipkg pack 跑一遍**

Run:
```bash
cd /Users/xgliu/Documents/git/codebase-wiki && node tools/wikipkg/dist/cli.js pack examples/sample-wikipkg /tmp/tiny-counter-v0.1.0.wikipkg.tar.gz
ls -la /tmp/tiny-counter-v0.1.0.wikipkg.tar.gz
tar -tzf /tmp/tiny-counter-v0.1.0.wikipkg.tar.gz | sort
rm /tmp/tiny-counter-v0.1.0.wikipkg.tar.gz
```
Expected: 输出 `OK: packed ...`;文件存在;tar -tzf 列出所有 13+ 个文件。

- [ ] **Step 9: commit**

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && git add examples/sample-wikipkg/ && git commit -m "examples/sample-wikipkg: tiny-counter fixture (3 chapters + 1 tour + figure + glossary + quizzes)"
```

---

## Task 12: `reference/wikipkg-format.md` 数据契约文档

**Files:**
- Create: `reference/wikipkg-format.md`

**Context:** 一份给生成器(和未来的人/agent)看的标准参考。不是教学,是契约。

- [ ] **Step 1: 写文档**

写入 `reference/wikipkg-format.md`:

````markdown
# wikipkg format reference

The **wikipkg** (`.wikipkg.tar.gz`) is the on-disk artifact produced by the codebase-wiki skill and consumed by the codebase-wiki service. This document is the **authoritative contract**: anything not specified here is undefined behavior.

For the **why** behind these decisions, see `docs/specs/2026-05-25-codebase-wiki-service-design.md` (§2).

## File name

```
<subject-slug>-<version-label>.wikipkg.tar.gz
```

- `<subject-slug>` matches `^[a-z0-9][a-z0-9-]{0,63}$`
- `<version-label>` matches `^v?[0-9][0-9a-zA-Z.\-+]{0,63}$`
- Double extension `.wikipkg.tar.gz` is a recognition hint

## Tarball layout

The tarball has **no top-level directory** — files are at the root:

```
manifest.json
chapters/<chapter-slug>.md
tours/<tour-slug>/00-overview.md
tours/<tour-slug>/NN-<step-slug>.md
quizzes/<chapter-slug>.json
figures/<figure-slug>.svg
glossary.json
meta/README.md            (optional)
meta/CHANGELOG.md         (optional)
```

File names are slugs; **ordering is governed by `manifest.json`, not file names**.

## manifest.json

Authoritative schema: `@codebase-wiki/shared` → `ManifestSchema`.

```json
{
  "schema_version": "1.0",
  "content_type": "codebase",
  "subject": { "slug": "...", "name": "...", "language": "zh-CN" },
  "wiki_version": {
    "label": "...",
    "generated_at": "<ISO8601>",
    "generator": { "name": "codebase-wiki", "version": "..." }
  },
  "source": {
    "type": "codebase",
    "codebase": {
      "repo_url": "https://...",
      "target_ref": "...",
      "target_commit": "<short-or-full SHA>",
      "deep_link_template": "https://.../blob/{commit}/{path}#L{line}"
    }
  },
  "chapters": [
    { "id": "...", "order": 1, "title": "...", "path": "chapters/....md",
      "estimated_minutes": 12, "quiz_path": "quizzes/....json", "tags": [] }
  ],
  "tours": [
    { "id": "...", "title": "...", "overview_path": "...",
      "steps": [{ "order": 1, "title": "...", "path": "..." }] }
  ],
  "glossary_path": "glossary.json",
  "figures": [{ "id": "...", "path": "figures/....svg", "title": "..." }]
}
```

### Identifier stability rule

`chapters[].id`, `tours[].id`, `figures[].id`, `glossary.terms[].id`, and quiz `questions[].id` are **stable across regenerations of the same subject** when the underlying content is unchanged. Service-side user state (progress, attempts, addenda) is keyed by these ids. Renaming an id breaks user history for that resource — treat it as a content deletion + creation.

## quizzes/<chapter-slug>.json

Authoritative schema: `QuizSchema`.

```json
{
  "schema_version": "1.0",
  "chapter_id": "<must match manifest.chapters[].id>",
  "questions": [
    {
      "id": "<chapter-slug>-q<N>",
      "type": "mcq-single" | "mcq-multi",
      "stem": "...",
      "options": [
        { "id": "a", "text": "..." },
        { "id": "b", "text": "..." }
      ],
      "answer": ["a"],
      "explanation": "...",
      "references": [{ "chapter_id": "...", "anchor": "..." }],
      "difficulty": "easy" | "medium" | "hard",
      "tags": []
    }
  ]
}
```

- `answer` is always an array, even for `mcq-single` (length 1)
- Each `answer[i]` must reference an existing `options[].id`
- Option ids are single lowercase letters (`a`-`h`)
- Question ids: `<chapter-slug>-q<N>` convention; stable across regenerations

## glossary.json

```json
{
  "schema_version": "1.0",
  "terms": [
    {
      "id": "kv-cache",
      "term": "KV cache",
      "aliases": ["key-value cache"],
      "definition": "...",
      "see_also": ["paged-attention"]
    }
  ]
}
```

`see_also` refers to other `terms[].id` values. Dangling references are tolerated (viewer skips silently).

## figures/*.svg

- **No `<script>` tags** — rejected at upload
- **No inline `<style>` tags** — rejected at upload (theme is injected by viewer via CSS variables)
- Stroke/fill should use `currentColor` or `data-role="..."` attributes so viewer CSS can theme them

## meta/ (optional)

- `meta/README.md`: human-readable summary of this wikipkg
- `meta/CHANGELOG.md`: notable changes between versions
- Service ignores these for now; they exist for human consumption

## Schema versioning

`schema_version` is `MAJOR.MINOR`:

- **MINOR** bump: additive-only (new optional fields). Consumers ignore unknown additive fields.
- **MAJOR** bump: breaking. Consumers must declare explicit support.

See `docs/specs/2026-05-25-codebase-wiki-service-design.md` for the full compatibility matrix.

## Validation

Use `wikipkg validate <dir>` to check a wikipkg before packing:

```bash
node tools/wikipkg/dist/cli.js validate examples/sample-wikipkg
```

Then pack:

```bash
node tools/wikipkg/dist/cli.js pack examples/sample-wikipkg ./out/<subject>-<version>.wikipkg.tar.gz
```
````

- [ ] **Step 2: commit**

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && git add reference/wikipkg-format.md && git commit -m "reference/wikipkg-format: authoritative on-disk contract"
```

---

## Task 13: `templates/chapter-quiz-prompt.md` — quiz 生成模板

**Files:**
- Create: `templates/chapter-quiz-prompt.md`

**Context:** skill 在 Phase X 调用此 prompt 对**每个章节**生成一个 `quizzes/<chapter-slug>.json`。模板里有 `{{CHAPTER_SLUG}}` / `{{CHAPTER_TITLE}}` / `{{CHAPTER_CONTENT}}` 占位,被 skill controller 替换。

- [ ] **Step 1: 写模板**

```markdown
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
```

- [ ] **Step 2: commit**

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && git add templates/chapter-quiz-prompt.md && git commit -m "templates/chapter-quiz-prompt: per-chapter MCQ generator instructions"
```

---

## Task 14: SKILL.md 新增 Phase + wikipkg mode

**Files:**
- Modify: `SKILL.md`

**Context:** 在现有 7 阶段 流程后加 Phase 8(quiz generation)和 Phase 9(wikipkg pack),并增加一个 entry mode `wikipkg` 用于直接产 service-format。老 mode 全部保留。

- [ ] **Step 1: Locate the Phase list in SKILL.md**

Run:
```bash
cd /Users/xgliu/Documents/git/codebase-wiki && grep -nE '^## Phase|^### Phase|Phase [0-9]' SKILL.md | head -40
```
Note the line numbers and current Phase names for the next steps.

- [ ] **Step 2: Add Phase 8 + Phase 9 sections**

Find the existing "Phase 7" closing block (typically near "publish"/"deploy" section). Insert two new sections after it.

Insert:

```markdown
## Phase 8 — Generate chapter quizzes (wikipkg mode only)

For each chapter in `CHAPTERS`:

1. Read the chapter markdown content
2. Dispatch a subagent with `templates/chapter-quiz-prompt.md`, substituting:
   - `{{CHAPTER_SLUG}}` → the chapter id (slug form)
   - `{{CHAPTER_TITLE}}` → the chapter title
   - `{{CHAPTER_CONTENT}}` → the full chapter markdown
3. Receive JSON output; write to `quizzes/<chapter-slug>.json` inside the wikipkg directory
4. Run `node tools/wikipkg/dist/cli.js validate <wikipkg-dir>` after **all** quizzes are written
5. If validation fails on any quiz JSON, re-dispatch that chapter's prompt with the validation error in the input
6. Loop until all quizzes validate

**Skip Phase 8** if the user invoked the legacy static-site mode (no service target).

## Phase 9 — Build manifest + pack wikipkg

1. Construct `manifest.json` in the wikipkg directory with all chapters / tours / figures / glossary path / source metadata. Use the schema in `reference/wikipkg-format.md`
2. Run `node tools/wikipkg/dist/cli.js validate <wikipkg-dir>` — fix any errors
3. Run `node tools/wikipkg/dist/cli.js pack <wikipkg-dir> <subject-slug>-<version-label>.wikipkg.tar.gz`
4. Hand the resulting `.wikipkg.tar.gz` to the user with upload instructions for the codebase-wiki service

**Skip Phase 9** if the user invoked the legacy static-site mode.
```

(Insert location: between current Phase 7 and any "## After publish" / appendix sections.)

- [ ] **Step 3: Add entry mode detection in Phase 0**

Find the section of SKILL.md describing Phase 0 / entry mode dispatch (currently has modes like "generate", "import", "add-tour", "qa-addendum"). Add a new mode:

```markdown
- **wikipkg mode** — triggered when the user says one of:
  - "generate a wikipkg for ..."
  - "produce a wiki package for ..."
  - "for the codebase-wiki service" (in conjunction with a generate request)

  Flow: Phases 1-6 (exploration + chapter content), then **skip Phase 7** (static-site web setup),
  then **Phase 8** (quiz generation), then **Phase 9** (manifest + pack).

  Output is a single `.wikipkg.tar.gz` ready for service upload.
```

Insert near other mode descriptions.

- [ ] **Step 4: Add a note about backward compat at the top of SKILL.md**

Find the existing top-of-file description. Add (or update) a note:

```markdown
> **As of 2026-05-25:** there are two production output modes. The legacy **static-site mode** (default for now) produces a self-contained HTML+JS+MD wiki suitable for GitHub Pages. The new **wikipkg mode** produces a `.wikipkg.tar.gz` for upload to a codebase-wiki service instance. Switch modes by stating intent at the top of the conversation; otherwise the skill defaults to static-site.
```

- [ ] **Step 5: Verify SKILL.md still parses (grep landmarks)**

Run:
```bash
cd /Users/xgliu/Documents/git/codebase-wiki && grep -nE '^## Phase' SKILL.md
```
Expected: see Phase 0 through Phase 9 listed in order.

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && grep -n 'wikipkg mode' SKILL.md
```
Expected: at least 2 matches (Phase 0 description + Phase 9 reference).

- [ ] **Step 6: commit**

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && git add SKILL.md && git commit -m "SKILL.md: add Phase 8/9 (quiz + pack) and wikipkg entry mode"
```

---

## Task 15: AGENTS.md 更新 + 收尾

**Files:**
- Modify: `AGENTS.md`

**Context:** AGENTS.md 是给 Claude / 协作者看的 repo guide。需要把新 layout(shared/、tools/、examples/)和 wikipkg mode 写进去。也要更新"No automated tests"的声明 —— 新的服务/共享代码用 vitest。

- [ ] **Step 1: Update repo layout block in AGENTS.md**

Find the section currently describing repo layout. Update the tree to include the new dirs:

```
SKILL.md                — main skill spec (entry mode dispatch + phases)
reference/              — methodology + on-disk contracts
  wikipkg-format.md     — wikipkg data format reference (the contract)
templates/              — copied verbatim into each generated static-site wiki
  web/                  — viewer (JS + CSS, no build step)
  *-prompt.md           — agent prompt templates (now incl. chapter-quiz-prompt)
shared/                 — TS workspace: zod schemas, consumed by wikipkg CLI + future service/viewer
tools/wikipkg/          — TS workspace: `wikipkg validate` / `wikipkg pack` CLI
examples/
  sample-wikipkg/       — minimal fixture (tiny-counter), used by codebase-wiki service tests
docs/
  specs/                — design docs
  plans/                — implementation plans
  decisions/            — ADR-style decision records
INSTALL.md              — user-facing install instructions
```

- [ ] **Step 2: Update "Conventions" section**

Find the "No automated tests" line and update to:

```markdown
- **Testing**:
  - **Skill content** (SKILL.md, templates/, reference/): no automated tests. Verification is `node --check`, `grep`, `wc -l`, `python3 -m json.tool`, and manual browser inspection.
  - **TypeScript workspaces** (`shared/`, `tools/wikipkg/`, future `server/` and `viewer/`): use **vitest** for unit + lightweight integration tests. Run via `npm test --workspace <name>`.
```

- [ ] **Step 3: Add wikipkg mode reference**

Find the "Where to look for 'why'" section. Add an entry under decisions:

```markdown
- `2026-05-25-codebase-wiki-service-design.md` (spec) — full service+data redesign;
  introduces `.wikipkg.tar.gz` as a versioned, immutable data artifact distinct from
  the legacy static-site output. See § "Wiki package 格式" for the data contract
  (also reflected verbatim in `reference/wikipkg-format.md`).
```

- [ ] **Step 4: smoke check**

Run:
```bash
cd /Users/xgliu/Documents/git/codebase-wiki && grep -E 'shared/|tools/wikipkg|wikipkg mode|vitest' AGENTS.md
```
Expected: at least 4 lines hit.

- [ ] **Step 5: commit**

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && git add AGENTS.md && git commit -m "AGENTS.md: document shared/, tools/wikipkg, testing split, service spec link"
```

---

## Task 16: Integration verification

**Files:** none new — pure verification.

**Context:** Plan A 已完成所有交付,这步只是把所有东西从 zero state 端到端跑一次。

- [ ] **Step 1: 干净 install + build + test**

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && rm -rf node_modules shared/node_modules shared/dist tools/wikipkg/node_modules tools/wikipkg/dist
cd /Users/xgliu/Documents/git/codebase-wiki && npm install
cd /Users/xgliu/Documents/git/codebase-wiki && npm run build
cd /Users/xgliu/Documents/git/codebase-wiki && npm test
```
Expected: 全部成功;test 输出显示 shared 30+ 用例 + wikipkg 6+ 用例全过。

- [ ] **Step 2: 端到端 fixture pack**

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && node tools/wikipkg/dist/cli.js pack examples/sample-wikipkg /tmp/tiny-counter-v0.1.0.wikipkg.tar.gz
ls -la /tmp/tiny-counter-v0.1.0.wikipkg.tar.gz
```
Expected: tarball 存在,大小 1-5 KB。

- [ ] **Step 3: 检查 tarball 内容(无顶层目录)**

```bash
tar -tzf /tmp/tiny-counter-v0.1.0.wikipkg.tar.gz | head -3
```
Expected: 前三行不应以单个目录开头(应该是 `chapters/`、`manifest.json`、`figures/` 之类的混合),证明无包裹目录。

- [ ] **Step 4: 把 tarball 解包到临时目录,用 validate 验证**

```bash
mkdir -p /tmp/wikipkg-rt && tar -xzf /tmp/tiny-counter-v0.1.0.wikipkg.tar.gz -C /tmp/wikipkg-rt
cd /Users/xgliu/Documents/git/codebase-wiki && node tools/wikipkg/dist/cli.js validate /tmp/wikipkg-rt
```
Expected: `OK: /tmp/wikipkg-rt validates as wikipkg schema_version=1.0`,exit 0。

```bash
rm -rf /tmp/wikipkg-rt /tmp/tiny-counter-v0.1.0.wikipkg.tar.gz
```

- [ ] **Step 5: 把 sample fixture 路径暴露给 Plan B**

Append to `examples/sample-wikipkg/README.md`:

```markdown
# tiny-counter sample wikipkg

A minimal but realistic wikipkg fixture used for testing the codebase-wiki **service** (Plan B).
3 chapters, 1 tour with 2 steps, 1 figure, glossary with 2 terms, quizzes for every chapter.

## Usage in Plan B tests

```bash
node tools/wikipkg/dist/cli.js pack examples/sample-wikipkg /tmp/tiny-counter-v0.1.0.wikipkg.tar.gz
```

Upload the resulting tarball via `POST /api/v1/admin/wikis` (Plan B Task X).
```

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && git add examples/sample-wikipkg/README.md && git commit -m "examples/sample-wikipkg: usage note for Plan B service tests"
```

- [ ] **Step 6: 跑全测最后一次 + 总结**

Run:
```bash
cd /Users/xgliu/Documents/git/codebase-wiki && npm test
```
Expected: 全过。

记录 Plan A 完成状态:

```bash
cd /Users/xgliu/Documents/git/codebase-wiki && git log --oneline | head -20
```

Plan A 应产出约 15-16 个 commits。

---

## Done. What you can do next:

- **Plan B**(服务核心):需要 `shared/` 的 ManifestSchema/QuizSchema、`examples/sample-wikipkg/` 作为上传夹具
- **Plan D**(viewer):需要 `shared/` 的 RedactedQuizSchema
- Plan C 在 Plan B 之后

Plan A 给以上每个后续 plan 提供了**契约层**(schemas)和**夹具**(sample-wikipkg)。
