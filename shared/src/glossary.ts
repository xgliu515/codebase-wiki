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
