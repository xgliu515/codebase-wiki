import { describe, it, expect } from 'vitest';
import { createApp } from '../src/app.js';

describe('GET /healthz', () => {
  it('returns ok + server_version + supported_schema_majors', async () => {
    const app = createApp();
    const res = await app.request('/healthz');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.server_version).toBeTypeOf('string');
    expect(body.supported_schema_majors).toEqual(['1']);
  });
});
