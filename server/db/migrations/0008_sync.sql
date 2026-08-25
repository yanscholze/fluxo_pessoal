CREATE TABLE `sync_mutations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`mutation_id` text NOT NULL,
	`device_id` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`operation` text NOT NULL,
	`status` text NOT NULL,
	`result_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_mutations_user_mutation_unq` ON `sync_mutations` (`user_id`,`mutation_id`);--> statement-breakpoint
CREATE INDEX `sync_mutations_user_created_idx` ON `sync_mutations` (`user_id`,`created_at`);