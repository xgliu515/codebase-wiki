import type { DB } from '../db/connection.js';
import { createSession } from './session.js';

export type DevEnv = { DEV_ADMIN_LOGIN?: string };

const DEV_GITHUB_ID = 0;  // Real GitHub IDs start at 1; 0 is reserved for the synthetic dev user.

/**
 * Local-dev convenience: when DEV_ADMIN_LOGIN is set, upsert a synthetic user
 * with that login and create a fresh session. Returns the session id (paste into
 * browser cookie to sign in) or null when the env var is unset.
 *
 * The login is NOT auto-granted admin role; for admin you must also include
 * the same login in ADMIN_GITHUB_LOGINS. Keeping the two env vars independent
 * lets local testing exercise both "regular logged-in user" and "admin" paths.
 *
 * DO NOT set DEV_ADMIN_LOGIN in production — it bypasses OAuth entirely.
 */
export function seedDevAdminIfEnabled(db: DB, env: DevEnv): string | null {
  const login = env.DEV_ADMIN_LOGIN?.trim();
  if (!login) return null;

  const now = Date.now();
  const row = db
    .prepare(
      `INSERT INTO users (github_id, github_login, display_name, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(github_id) DO UPDATE SET
         github_login = excluded.github_login,
         display_name = excluded.display_name,
         last_seen_at = excluded.last_seen_at
       RETURNING id`,
    )
    .get(DEV_GITHUB_ID, login, 'Dev Admin', now, now) as { id: number };

  return createSession(db, row.id);
}
