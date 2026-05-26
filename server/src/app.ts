import { Hono } from 'hono';
import type { DB } from './db/connection.js';
import { createAuthRoutes, type AuthEnv } from './auth/routes.js';
import { createAdminRegistryRoutes } from './registry/routes.js';

export type ServerEnv = AuthEnv & {
  DATA_DIR: string;
  PUBLIC_READ: string;
};

export type AppOptions = {
  db: DB;
  env: ServerEnv;
};

export function createApp(opts?: AppOptions) {
  const app = new Hono();

  app.get('/healthz', (c) =>
    c.json({
      ok: true,
      server_version: '0.0.0',
      supported_schema_majors: ['1'],
    }),
  );

  if (opts) {
    app.route('/api/v1/auth', createAuthRoutes(opts.db, opts.env));
    app.route('/api/v1/admin', createAdminRegistryRoutes(opts.db, opts.env));
  }

  return app;
}

export type App = ReturnType<typeof createApp>;
