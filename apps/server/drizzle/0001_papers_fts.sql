-- FTS5 full-text index over papers(title, abstract), kept in sync by triggers.
-- external-content table: rows live in `papers`, FTS only stores the index.
CREATE VIRTUAL TABLE papers_fts USING fts5(
  title,
  abstract,
  content='papers',
  content_rowid='rowid'
);
--> statement-breakpoint
CREATE TRIGGER papers_ai AFTER INSERT ON papers BEGIN
  INSERT INTO papers_fts(rowid, title, abstract) VALUES (new.rowid, new.title, new.abstract);
END;
--> statement-breakpoint
CREATE TRIGGER papers_ad AFTER DELETE ON papers BEGIN
  INSERT INTO papers_fts(papers_fts, rowid, title, abstract) VALUES ('delete', old.rowid, old.title, old.abstract);
END;
--> statement-breakpoint
CREATE TRIGGER papers_au AFTER UPDATE ON papers BEGIN
  INSERT INTO papers_fts(papers_fts, rowid, title, abstract) VALUES ('delete', old.rowid, old.title, old.abstract);
  INSERT INTO papers_fts(rowid, title, abstract) VALUES (new.rowid, new.title, new.abstract);
END;
