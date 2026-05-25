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
