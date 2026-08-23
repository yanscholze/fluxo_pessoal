CREATE TABLE `cards` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`linked_account` text NOT NULL,
	`kind` text DEFAULT 'credit' NOT NULL,
	`brand` text DEFAULT 'Mastercard' NOT NULL,
	`tier` text DEFAULT 'Black' NOT NULL,
	`last4` text DEFAULT '0000' NOT NULL,
	`limit_cents` integer DEFAULT 0 NOT NULL,
	`closing_day` integer DEFAULT 1 NOT NULL,
	`due_day` integer DEFAULT 8 NOT NULL,
	`due_adjustment` text DEFAULT 'next' NOT NULL,
	`points_per_dollar_milli` integer DEFAULT 0 NOT NULL,
	`cashback_basis_points` integer DEFAULT 0 NOT NULL,
	`reward_mode` text DEFAULT 'none' NOT NULL,
	`points_goal` integer DEFAULT 0 NOT NULL,
	`manual_usd_rate_micros` integer DEFAULT 0 NOT NULL,
	`color` text DEFAULT 'black' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cards_owner_idx` ON `cards` (`owner_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `cards_owner_name_idx` ON `cards` (`owner_id`,`name`);--> statement-breakpoint
ALTER TABLE `recurring_entries` ADD `calculation_mode` text DEFAULT 'fixed' NOT NULL;--> statement-breakpoint
ALTER TABLE `recurring_entries` ADD `schedule_mode` text DEFAULT 'day-of-month' NOT NULL;--> statement-breakpoint
ALTER TABLE `recurring_entries` ADD `date_adjustment` text DEFAULT 'previous' NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `payment_method` text DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `card_id` text;