import { describe, it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { openDatabase } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrations.js';

describe('migrations', () => {
  it('creates schema_migrations table on first run', async () => {
    const dir = await mkdtemp(resolve(tmpdir(), 'cwsvc-'));
    const db = openDatabase(resolve(dir, 'test.db'));
    try {
      runMigrations(db);
      const row = db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'`)
        .get();
      expect(row).toBeDefined();
    } finally {
      db.close();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('is idempotent on second run', async () => {
    const dir = await mkdtemp(resolve(tmpdir(), 'cwsvc-'));
    const db = openDatabase(resolve(dir, 'test.db'));
    try {
      runMigrations(db);
      const before = db
        .prepare(`SELECT COUNT(*) AS n FROM schema_migrations`)
        .get() as { n: number };
      runMigrations(db);
      const after = db
        .prepare(`SELECT COUNT(*) AS n FROM schema_migrations`)
        .get() as { n: number };
      expect(after.n).toBe(before.n);
    } finally {
      db.close();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('creates users + sessions + subjects + wiki_versions tables', async () => {
    const dir = await mkdtemp(resolve(tmpdir(), 'cwsvc-'));
    const db = openDatabase(resolve(dir, 'test.db'));
    try {
      runMigrations(db);
      const tables = db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
        .all() as Array<{ name: string }>;
      const names = tables.map((t) => t.name);
      expect(names).toContain('users');
      expect(names).toContain('sessions');
      expect(names).toContain('subjects');
      expect(names).toContain('wiki_versions');
      expect(names).toContain('schema_migrations');
    } finally {
      db.close();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('enables WAL mode', async () => {
    const dir = await mkdtemp(resolve(tmpdir(), 'cwsvc-'));
    const db = openDatabase(resolve(dir, 'test.db'));
    try {
      runMigrations(db);
      const mode = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
      expect(mode.journal_mode).toBe('wal');
    } finally {
      db.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
