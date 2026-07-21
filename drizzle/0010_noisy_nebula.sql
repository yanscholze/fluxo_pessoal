CREATE TABLE `trips` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`currency` text DEFAULT 'BRL' NOT NULL,
	`exchange_rate_micros` integer DEFAULT 1000000 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `trips_owner_dates_idx` ON `trips` (`owner_id`,`start_date`,`end_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `trips_owner_name_dates_idx` ON `trips` (`owner_id`,`name`,`start_date`);--> statement-breakpoint
ALTER TABLE `transactions` ADD `trip_id` text;--> statement-breakpoint
CREATE INDEX `transactions_owner_trip_idx` ON `transactions` (`owner_id`,`trip_id`);