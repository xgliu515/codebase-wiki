import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { openDatabase, type DB } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrations.js';
import { seedDevAdminIfEnabled } from '../src/auth/dev.js';
import { getSessionUser } from '../src/auth/session.js';

describe('seedDevAdminIfEnabled', () => {
  let tmpDir: string;
  let db: DB;

  beforeEach(async () => {
    tmpDir = await mkdtemp(resolve(tmpdir(), 'cwdev-'));
    db = openDatabase(resolve(tmpDir, 'test.db'));
    runMigrations(db);
  });

  afterEach(async () => {
    db.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns null when DEV_ADMIN_LOGIN is unset', () => {
    expect(seedDevAdminIfEnabled(db, {})).toBeNull();
    expect(seedDevAdminIfEnabled(db, { DEV_ADMIN_LOGIN: '' })).toBeNull();
    expect(seedDevAdminIfEnabled(db, { DEV_ADMIN_LOGIN: '   ' })).toBeNull();
  });

  it('upserts a synthetic user and returns a usable session id', () => {
    const sid = seedDevAdminIfEnabled(db, { DEV_ADMIN_LOGIN: 'demo_admin' });
    expect(sid).toMatch(/^[0-9a-f]{64}$/);

    const u = getSessionUser(db, sid!);
    expect(u?.github_login).toBe('demo_admin');
    expect(u?.github_id).toBe(0);
    expect(u?.display_name).toBe('Dev Admin');
  });

  it('creates a fresh session on each call (no reuse)', () => {
    const sid1 = seedDevAdminIfEnabled(db, { DEV_ADMIN_LOGIN: 'demo_admin' });
    const sid2 = seedDevAdminIfEnabled(db, { DEV_ADMIN_LOGIN: 'demo_admin' });
    expect(sid1).not.toBe(sid2);
    expect(getSessionUser(db, sid1!)?.github_login).toBe('demo_admin');
    expect(getSessionUser(db, sid2!)?.github_login).toBe('demo_admin');
  });

  it('updates github_login on second call with a different name', () => {
    seedDevAdminIfEnabled(db, { DEV_ADMIN_LOGIN: 'alice' });
    seedDevAdminIfEnabled(db, { DEV_ADMIN_LOGIN: 'bob' });
    // Only one user row (synthetic github_id=0 is the conflict key)
    const rows = db.prepare(`SELECT github_login FROM users WHERE github_id=0`).all() as Array<{ github_login: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.github_login).toBe('bob');
  });

  it('does not collide with a real OAuth user using the same login', () => {
    // Pretend a real OAuth user 'demo_admin' (github_id=12345) signed in first
    db.prepare(
      `INSERT INTO users (github_id, github_login, created_at, last_seen_at)
       VALUES (?, ?, ?, ?)`,
    ).run(12345, 'demo_admin', Date.now(), Date.now());

    const sid = seedDevAdminIfEnabled(db, { DEV_ADMIN_LOGIN: 'demo_admin' });
    expect(sid).not.toBeNull();
    // Two rows now: real one + synthetic
    const rows = db.prepare(`SELECT github_id, github_login FROM users WHERE github_login='demo_admin' ORDER BY github_id`).all() as Array<{ github_id: number; github_login: string }>;
    expect(rows).toHaveLength(2);
    expect(rows[0]!.github_id).toBe(0);    // synthetic
    expect(rows[1]!.github_id).toBe(12345); // real

    // Session points to the synthetic one
    const u = getSessionUser(db, sid!);
    expect(u?.github_id).toBe(0);
  });
});
