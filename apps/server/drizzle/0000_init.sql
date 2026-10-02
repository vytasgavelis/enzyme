CREATE TABLE `papers` (
	`pmid` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`abstract` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
