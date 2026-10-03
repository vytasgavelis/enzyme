CREATE TABLE `cards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`paper_id` integer NOT NULL,
	`model_id` text NOT NULL,
	`card` text NOT NULL,
	`latency_ms` integer NOT NULL,
	`input_tokens` integer,
	`output_tokens` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`paper_id`) REFERENCES `papers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cards_paper_idx` ON `cards` (`paper_id`,`created_at`);