-- FTS5 full-text index over the plain-text copies of papers(title, abstract), kept in sync
-- by triggers. External-content table: rows live in `papers`, FTS only stores the index.
-- The *_text columns are filled by the app with stripHtml(), since triggers can't call it.
CREATE VIRTUAL TABLE papers_fts USING fts5(
  title_text,
  abstract_text,
  content='papers',
  content_rowid='id'
);
--> statement-breakpoint
CREATE TRIGGER papers_fts_ai AFTER INSERT ON papers BEGIN
  INSERT INTO papers_fts(rowid, title_text, abstract_text)
  VALUES (new.id, new.title_text, new.abstract_text);
END;
--> statement-breakpoint
CREATE TRIGGER papers_fts_ad AFTER DELETE ON papers BEGIN
  INSERT INTO papers_fts(papers_fts, rowid, title_text, abstract_text)
  VALUES ('delete', old.id, old.title_text, old.abstract_text);
END;
--> statement-breakpoint
-- Only on text changes, so bumping updated_at or merging metadata doesn't re-index.
CREATE TRIGGER papers_fts_au AFTER UPDATE OF title_text, abstract_text ON papers BEGIN
  INSERT INTO papers_fts(papers_fts, rowid, title_text, abstract_text)
  VALUES ('delete', old.id, old.title_text, old.abstract_text);
  INSERT INTO papers_fts(rowid, title_text, abstract_text)
  VALUES (new.id, new.title_text, new.abstract_text);
END;
