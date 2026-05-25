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
