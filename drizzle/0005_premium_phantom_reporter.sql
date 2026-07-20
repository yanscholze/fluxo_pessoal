CREATE TABLE `sync_mutations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`mutation_id` text NOT NULL,
	`device_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`operation` text NOT NULL,
	`status` text NOT NULL,
	`response_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_mutations_owner_mutation_idx` ON `sync_mutations` (`owner_id`,`mutation_id`);--> statement-breakpoint
CREATE INDEX `sync_mutations_owner_created_idx` ON `sync_mutations` (`owner_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `transactions` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `deleted_at` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `device_id` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `last_mutation_id` text;--> statement-breakpoint
CREATE INDEX `transactions_owner_updated_idx` ON `transactions` (`owner_id`,`updated_at`);