import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { GlossarySchema, type Manifest } from '@codebase-wiki/shared';
import type { DB } from '../db/connection.js';

function stripMarkdown(s: string): string {
  return s
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]+`/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/[#*_>~|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

type Doc = { doc_type: string; doc_id: string; title: string; body: string };

export async function indexVersion(
  db: DB,
  subjectSlug: string,
  versionLabel: string,
  dataDir: string,
  manifest: Manifest,
): Promise<void> {
  const docs: Doc[] = [];

  for (const ch of manifest.chapters) {
    const md = await readFile(resolve(dataDir, ch.path), 'utf8');
    docs.push({ doc_type: 'chapter', doc_id: ch.id, title: ch.title, body: stripMarkdown(md) });
  }
  for (const t of manifest.tours) {
    const overview = await readFile(resolve(dataDir, t.overview_path), 'utf8');
    docs.push({ doc_type: 'tour_overview', doc_id: t.id, title: t.title, body: stripMarkdown(overview) });
    for (const s of t.steps) {
      const md = await readFile(resolve(dataDir, s.path), 'utf8');
      docs.push({
        doc_type: 'tour_step',
        doc_id: `${t.id}/${s.order}`,
        title: s.title,
        body: stripMarkdown(md),
      });
    }
  }
  const gRaw = await readFile(resolve(dataDir, manifest.glossary_path), 'utf8');
  const g = GlossarySchema.parse(JSON.parse(gRaw));
  for (const term of g.terms) {
    docs.push({ doc_type: 'glossary_term', doc_id: term.id, title: term.term, body: term.definition });
  }

  const insert = db.prepare(
    `INSERT INTO content_fts (subject_slug, version_label, doc_type, doc_id, title, body)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const writeTxn = db.transaction((arr: Doc[]) => {
    db.prepare(`DELETE FROM content_fts WHERE subject_slug=? AND version_label=?`).run(
      subjectSlug,
      versionLabel,
    );
    for (const d of arr) {
      insert.run(subjectSlug, versionLabel, d.doc_type, d.doc_id, d.title, d.body);
    }
  });
  writeTxn(docs);
}

export function deleteVersionIndex(db: DB, subjectSlug: string, versionLabel: string): void {
  db.prepare(`DELETE FROM content_fts WHERE subject_slug=? AND version_label=?`).run(
    subjectSlug,
    versionLabel,
  );
}
