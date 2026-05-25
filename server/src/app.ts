import { Hono } from 'hono';

export function createApp() {
  const app = new Hono();

  app.get('/healthz', (c) =>
    c.json({
      ok: true,
      server_version: '0.0.0',
      supported_schema_majors: ['1'],
    }),
  );

  return app;
}

export type App = ReturnType<typeof createApp>;
