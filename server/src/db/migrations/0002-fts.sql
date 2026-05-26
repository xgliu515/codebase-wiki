CREATE VIRTUAL TABLE content_fts USING fts5(
  subject_slug   UNINDEXED,
  version_label  UNINDEXED,
  doc_type       UNINDEXED,
  doc_id         UNINDEXED,
  title,
  body,
  tokenize = 'unicode61 remove_diacritics 2'
);
