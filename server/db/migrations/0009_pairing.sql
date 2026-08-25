CREATE TABLE `pairing_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`poll_token` text NOT NULL,
	`device_id` text NOT NULL,
	`device_name` text,
	`platform` text,
	`app_version` text,
	`approved_by_user_id` text,
	`approved_at` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`approved_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pairing_requests_code_unique` ON `pairing_requests` (`code`);--> statement-breakpoint
CREATE INDEX `pairing_requests_expires_idx` ON `pairing_requests` (`expires_at`);