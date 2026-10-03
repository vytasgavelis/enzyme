CREATE TABLE `papers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`source_id` text NOT NULL,
	`pmid` text,
	`pmcid` text,
	`doi` text,
	`title` text,
	`abstract` text,
	`title_text` text,
	`abstract_text` text,
	`authors` text,
	`journal` text,
	`pub_date` text,
	`pub_year` integer,
	`pub_types` text,
	`mesh_headings` text,
	`keywords` text,
	`cited_by_count` integer,
	`is_open_access` integer,
	`is_preprint` integer NOT NULL,
	`full_text_urls` text,
	`raw` text NOT NULL,
	`first_seen_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `papers_source_uq` ON `papers` (`source`,`source_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `papers_pmid_uq` ON `papers` (`pmid`);--> statement-breakpoint
CREATE UNIQUE INDEX `papers_doi_uq` ON `papers` (`doi`);--> statement-breakpoint
CREATE INDEX `papers_pub_date_idx` ON `papers` (`pub_date`);--> statement-breakpoint
CREATE TABLE `pull_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`search_id` integer NOT NULL,
	`started_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`finished_at` integer,
	`hit_count` integer,
	`fetched` integer DEFAULT 0 NOT NULL,
	`inserted` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`error` text,
	FOREIGN KEY (`search_id`) REFERENCES `saved_searches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pull_runs_search_idx` ON `pull_runs` (`search_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `saved_searches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`query` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`last_run_at` integer,
	`last_viewed_at` integer
);
--> statement-breakpoint
CREATE TABLE `search_papers` (
	`search_id` integer NOT NULL,
	`paper_id` integer NOT NULL,
	`first_matched_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`search_id`, `paper_id`),
	FOREIGN KEY (`search_id`) REFERENCES `saved_searches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`paper_id`) REFERENCES `papers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `search_papers_paper_idx` ON `search_papers` (`paper_id`);