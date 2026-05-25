import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DB } from './connection.js';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(here, 'migrations');

export function runMigrations(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id          INTEGER PRIMARY KEY,
      applied_at  INTEGER NOT NULL,
      description TEXT NOT NULL
    );
  `);

  const applied = new Set(
    (db.prepare('SELECT id FROM schema_migrations').all() as Array<{ id: number }>).map(
      (r) => r.id,
    ),
  );

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{4}-.*\.sql$/.test(f))
    .sort();

  for (const f of files) {
    const m = f.match(/^(\d{4})-(.+)\.sql$/);
    if (!m) continue;
    const id = Number(m[1]);
    const description = m[2]!;
    if (applied.has(id)) continue;

    const sql = readFileSync(resolve(MIGRATIONS_DIR, f), 'utf8');
    const txn = db.transaction(() => {
      db.exec(sql);
      db.prepare(
        'INSERT INTO schema_migrations (id, applied_at, description) VALUES (?, ?, ?)',
      ).run(id, Date.now(), description);
    });
    txn();
  }
}
