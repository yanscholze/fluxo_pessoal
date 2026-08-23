CREATE TABLE `reward_redemptions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`card_id` text NOT NULL,
	`kind` text NOT NULL,
	`amount_milli` integer NOT NULL,
	`account` text,
	`redeemed_at` text NOT NULL,
	`note` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `reward_redemptions_owner_date_idx` ON `reward_redemptions` (`owner_id`,`redeemed_at`);--> statement-breakpoint
CREATE INDEX `reward_redemptions_owner_card_idx` ON `reward_redemptions` (`owner_id`,`card_id`);--> statement-breakpoint
ALTER TABLE `cards` ADD `image_data` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `destination_account` text;