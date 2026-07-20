CREATE TABLE `mobile_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`device_id` text NOT NULL,
	`name` text NOT NULL,
	`platform` text DEFAULT 'android' NOT NULL,
	`app_version` text,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mobile_devices_owner_device_idx` ON `mobile_devices` (`owner_id`,`device_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `mobile_devices_token_hash_idx` ON `mobile_devices` (`token_hash`);--> statement-breakpoint
CREATE INDEX `mobile_devices_owner_idx` ON `mobile_devices` (`owner_id`);