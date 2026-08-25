CREATE TABLE `capture_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`source_app` text NOT NULL,
	`raw_text` text NOT NULL,
	`description` text NOT NULL,
	`merchant` text,
	`amount_cents` integer NOT NULL,
	`kind` text NOT NULL,
	`method` text DEFAULT 'unknown' NOT NULL,
	`installment_current` integer,
	`installment_total` integer,
	`confidence_milli` integer DEFAULT 0 NOT NULL,
	`posted_at` integer NOT NULL,
	`occurred_on` text NOT NULL,
	`status` text DEFAULT 'pendente' NOT NULL,
	`transaction_id` text,
	`device_event_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `capture_events_user_status_idx` ON `capture_events` (`user_id`,`status`,`posted_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `capture_events_user_device_event_unq` ON `capture_events` (`user_id`,`device_event_id`);--> statement-breakpoint
CREATE TABLE `capture_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`source_app` text NOT NULL,
	`label` text,
	`action` text DEFAULT 'ignore' NOT NULL,
	`default_account_id` text,
	`default_card_id` text,
	`default_category_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`default_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`default_card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`default_category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `capture_sources_user_app_unq` ON `capture_sources` (`user_id`,`source_app`);