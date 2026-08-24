CREATE TABLE `exchange_rates` (
	`currency` text NOT NULL,
	`quoted_on` text NOT NULL,
	`rate_micros` integer NOT NULL,
	`source` text DEFAULT 'BCB PTAX' NOT NULL,
	`fetched_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exchange_rates_currency_day_unq` ON `exchange_rates` (`currency`,`quoted_on`);--> statement-breakpoint
CREATE TABLE `reward_redemptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`card_id` text NOT NULL,
	`kind` text NOT NULL,
	`amount` integer NOT NULL,
	`account_id` text,
	`transaction_id` text,
	`redeemed_on` text NOT NULL,
	`note` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `reward_redemptions_card_idx` ON `reward_redemptions` (`card_id`,`redeemed_on`);--> statement-breakpoint
CREATE INDEX `reward_redemptions_user_idx` ON `reward_redemptions` (`user_id`);--> statement-breakpoint
ALTER TABLE `transactions` ADD `reward_points_milli` integer;--> statement-breakpoint
ALTER TABLE `transactions` ADD `reward_cashback_cents` integer;--> statement-breakpoint
ALTER TABLE `transactions` ADD `reward_usd_rate_micros` integer;