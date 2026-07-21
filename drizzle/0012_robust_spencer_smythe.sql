ALTER TABLE `cards` ADD `is_favorite` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `cards` ADD `sort_order` integer DEFAULT 0 NOT NULL;