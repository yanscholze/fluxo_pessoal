ALTER TABLE `transactions` ADD `reward_points_milli` integer;--> statement-breakpoint
ALTER TABLE `transactions` ADD `reward_cashback_cents` integer;--> statement-breakpoint
ALTER TABLE `transactions` ADD `reward_usd_rate_micros` integer;