CREATE TABLE `app_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`feedback_id` text,
	`read_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `app_notifications_owner_created_idx` ON `app_notifications` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `app_notifications_owner_read_idx` ON `app_notifications` (`owner_id`,`read_at`);--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`device_id` text NOT NULL,
	`expo_push_token` text NOT NULL,
	`platform` text DEFAULT 'android' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`last_registered_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_owner_device_idx` ON `push_subscriptions` (`owner_id`,`device_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_token_idx` ON `push_subscriptions` (`expo_push_token`);--> statement-breakpoint
CREATE INDEX `push_subscriptions_owner_active_idx` ON `push_subscriptions` (`owner_id`,`active`);--> statement-breakpoint
ALTER TABLE `developer_feedback` ADD `developer_comment` text;