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

// Forward-looking: in v1 the discriminated union already rejects any source.type
// outside the supported content_types, so this guard is structurally unreachable.
// It activates once a second content_type (e.g. 'article') is added to BOTH
// ContentTypeSchema and SourceSchema's discriminated union — at that point this
// check prevents valid-individually-but-inconsistent combinations.
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

function refineUniqueIds(
  arr: ReadonlyArray<{ id: string }>,
  label: 'chapters' | 'tours',
  ctx: z.RefinementCtx,
) {
  const seen = new Set<string>();
  arr.forEach((item, i) => {
    if (seen.has(item.id)) {
      ctx.addIssue({
        code: 'custom',
        path: [label, i, 'id'],
        message: `duplicate ${label} id: ${item.id}`,
      });
    }
    seen.add(item.id);
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
    refineUniqueIds(m.chapters, 'chapters', ctx);
    refineUniqueIds(m.tours, 'tours', ctx);
  });

export type Manifest = z.infer<typeof ManifestSchema>;
export type Subject = z.infer<typeof SubjectSchema>;
export type ChapterEntry = z.infer<typeof ChapterEntrySchema>;
export type Tour = z.infer<typeof TourSchema>;
export type TourStep = z.infer<typeof TourStepSchema>;
export type FigureEntry = z.infer<typeof FigureEntrySchema>;
