import { randomBytes } from 'node:crypto';
import type { DB } from '../db/connection.js';

const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;  // 30 days

export type SessionUser = {
  user_id: number;
  github_id: number;
  github_login: string;
  display_name: string | null;
  avatar_url: string | null;
};

export function createSession(
  db: DB,
  userId: number,
  opts: { ttlMs?: number } = {},
): string {
  const id = randomBytes(32).toString('hex');
  const now = Date.now();
  const ttl = opts.ttlMs ?? DEFAULT_TTL_MS;
  db.prepare(
    `INSERT INTO sessions (id, user_id, created_at, expires_at, last_used_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, userId, now, now + ttl, now);
  return id;
}

export function getSessionUser(db: DB, sessionId: string): SessionUser | undefined {
  const row = db
    .prepare(
      `SELECT u.id AS user_id, u.github_id, u.github_login, u.display_name, u.avatar_url
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > ?`,
    )
    .get(sessionId, Date.now()) as SessionUser | undefined;
  if (row) {
    db.prepare('UPDATE sessions SET last_used_at = ? WHERE id = ?').run(Date.now(), sessionId);
  }
  return row;
}

export function deleteSession(db: DB, sessionId: string): void {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}
