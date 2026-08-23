CREATE TABLE `ai_usage_daily` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`feature` text NOT NULL,
	`usage_day` text NOT NULL,
	`request_count` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_usage_owner_day_idx` ON `ai_usage_daily` (`owner_id`,`usage_day`);--> statement-breakpoint
