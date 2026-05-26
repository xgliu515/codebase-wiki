import { rename, mkdir, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import type { DB } from '../db/connection.js';
import type { Manifest } from '@codebase-wiki/shared';
import { indexVersion } from './fts.js';

export type InstallResult =
  | { ok: true; dataDir: string; subject: string; version: string }
  | { ok: false; error: 'wiki_version_exists' | 'storage_failed'; message: string };

export async function installWiki(
  db: DB,
  contentDir: string,
  manifest: Manifest,
  uploadedBy: number,
  dataDir: string,
  options: { force?: boolean } = {},
): Promise<InstallResult> {
  const subjectSlug = manifest.subject.slug;
  const versionLabel = manifest.wiki_version.label;
  const finalDir = resolve(dataDir, 'wikis', subjectSlug, versionLabel);

  // Check for collision BEFORE we move anything
  const existing = db
    .prepare(`SELECT data_dir, deleted_at FROM wiki_versions WHERE subject_slug=? AND version_label=?`)
    .get(subjectSlug, versionLabel) as { data_dir: string; deleted_at: number | null } | undefined;

  if (existing && existing.deleted_at === null && !options.force) {
    return {
      ok: false,
      error: 'wiki_version_exists',
      message: `(${subjectSlug}, ${versionLabel}) already exists; use ?force=true to overwrite`,
    };
  }

  const now = Date.now();
  const manifestJson = JSON.stringify(manifest);

  // DB transaction
  const txn = db.transaction(() => {
    db.prepare(
      `INSERT INTO subjects (slug, name, description, language, content_type, latest_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?)
       ON CONFLICT(slug) DO UPDATE SET
         name = excluded.name,
         description = excluded.description,
         language = excluded.language,
         content_type = excluded.content_type,
         updated_at = excluded.updated_at`,
    ).run(
      subjectSlug,
      manifest.subject.name,
      manifest.subject.description ?? null,
      manifest.subject.language,
      manifest.content_type,
      now,
      now,
    );

    if (existing) {
      // force overwrite (or undelete)
      db.prepare(
        `UPDATE wiki_versions
         SET schema_version=?, data_dir=?, manifest_json=?, uploaded_by=?, uploaded_at=?, deleted_at=NULL
         WHERE subject_slug=? AND version_label=?`,
      ).run(
        manifest.schema_version,
        finalDir,
        manifestJson,
        uploadedBy,
        now,
        subjectSlug,
        versionLabel,
      );
    } else {
      db.prepare(
        `INSERT INTO wiki_versions
         (subject_slug, version_label, schema_version, data_dir, manifest_json, uploaded_by, uploaded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(subjectSlug, versionLabel, manifest.schema_version, finalDir, manifestJson, uploadedBy, now);
    }

    // First-version: set latest. Existing subjects: do NOT auto-flip.
    const subj = db
      .prepare(`SELECT latest_version FROM subjects WHERE slug=?`)
      .get(subjectSlug) as { latest_version: string | null };
    if (subj.latest_version === null) {
      db.prepare(`UPDATE subjects SET latest_version=? WHERE slug=?`).run(versionLabel, subjectSlug);
    }
  });
  txn();

  // FS move
  try {
    if (existing && options.force) {
      await rm(finalDir, { recursive: true, force: true });
    }
    await mkdir(dirname(finalDir), { recursive: true });
    await rename(contentDir, finalDir);
  } catch (e) {
    // Rollback DB row to avoid orphan record
    db.prepare(`DELETE FROM wiki_versions WHERE subject_slug=? AND version_label=?`).run(
      subjectSlug,
      versionLabel,
    );
    return { ok: false, error: 'storage_failed', message: String(e) };
  }

  try {
    await indexVersion(db, subjectSlug, versionLabel, finalDir, manifest);
  } catch (e) {
    // Indexing failed — but content is on disk + row in DB. Log and move on.
    // The wiki is still readable; only search is degraded for this version.
    console.error('[fts] indexing failed:', e);
  }

  return { ok: true, dataDir: finalDir, subject: subjectSlug, version: versionLabel };
}
