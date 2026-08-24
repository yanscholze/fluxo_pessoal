CREATE TABLE `categorization_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`match_text` text NOT NULL,
	`category_id` text NOT NULL,
	`hit_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categorization_rules_user_match_unq` ON `categorization_rules` (`user_id`,`match_text`);--> statement-breakpoint
CREATE INDEX `categorization_rules_user_idx` ON `categorization_rules` (`user_id`);--> statement-breakpoint
CREATE TABLE `import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`filename` text NOT NULL,
	`format` text NOT NULL,
	`target_account_id` text,
	`target_card_id` text,
	`competence` text,
	`status` text DEFAULT 'review' NOT NULL,
	`found_count` integer DEFAULT 0 NOT NULL,
	`fresh_count` integer DEFAULT 0 NOT NULL,
	`duplicate_count` integer DEFAULT 0 NOT NULL,
	`without_category_count` integer DEFAULT 0 NOT NULL,
	`possible_transfer_count` integer DEFAULT 0 NOT NULL,
	`discarded_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`committed_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `import_batches_user_status_idx` ON `import_batches` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `import_batches_user_created_idx` ON `import_batches` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `import_items` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`user_id` text NOT NULL,
	`raw_text` text NOT NULL,
	`external_id` text,
	`occurred_on` text NOT NULL,
	`description` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`installment_current` integer,
	`installment_total` integer,
	`fingerprint` text NOT NULL,
	`verdict` text NOT NULL,
	`category_id` text,
	`transfer_counterpart_id` text,
	`decision` text DEFAULT 'pendente' NOT NULL,
	`transaction_id` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `import_batches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`transfer_counterpart_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `import_items_batch_idx` ON `import_items` (`batch_id`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `import_items_batch_fingerprint_unq` ON `import_items` (`batch_id`,`fingerprint`);--> statement-breakpoint
CREATE INDEX `import_items_user_idx` ON `import_items` (`user_id`);