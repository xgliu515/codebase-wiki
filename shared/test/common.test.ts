import { describe, it, expect } from 'vitest';
import {
  SlugSchema,
  VersionLabelSchema,
  RelativePathSchema,
  LanguageSchema,
  ContentTypeSchema,
  SchemaVersionSchema,
  parseSchemaMajor,
} from '../src/common.js';

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
    expect(SlugSchema.safeParse('a-').success).toBe(false);
    expect(SlugSchema.safeParse('abc-').success).toBe(false);
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

describe('ContentTypeSchema', () => {
  it('accepts codebase', () => {
    expect(ContentTypeSchema.safeParse('codebase').success).toBe(true);
  });

  it('rejects unsupported types (v1 scope)', () => {
    expect(ContentTypeSchema.safeParse('article').success).toBe(false);
    expect(ContentTypeSchema.safeParse('story').success).toBe(false);
    expect(ContentTypeSchema.safeParse('').success).toBe(false);
  });
});

describe('SchemaVersionSchema', () => {
  it('accepts MAJOR.MINOR pairs', () => {
    expect(SchemaVersionSchema.safeParse('1.0').success).toBe(true);
    expect(SchemaVersionSchema.safeParse('2.13').success).toBe(true);
    expect(SchemaVersionSchema.safeParse('10.99').success).toBe(true);
  });

  it('rejects malformed versions', () => {
    expect(SchemaVersionSchema.safeParse('1').success).toBe(false);
    expect(SchemaVersionSchema.safeParse('1.0.0').success).toBe(false);
    expect(SchemaVersionSchema.safeParse('v1.0').success).toBe(false);
    expect(SchemaVersionSchema.safeParse('').success).toBe(false);
  });
});

describe('parseSchemaMajor', () => {
  it('extracts major', () => {
    expect(parseSchemaMajor('1.0')).toBe(1);
    expect(parseSchemaMajor('2.13')).toBe(2);
    expect(parseSchemaMajor('10.99')).toBe(10);
  });

  it('throws on malformed input', () => {
    expect(() => parseSchemaMajor('1.0.0')).toThrow(/invalid schema_version/);
    expect(() => parseSchemaMajor('v1.0')).toThrow();
    expect(() => parseSchemaMajor('')).toThrow();
  });
});
