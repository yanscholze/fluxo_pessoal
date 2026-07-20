CREATE TABLE `developer_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`sender_owner_id` text NOT NULL,
	`sender_name` text NOT NULL,
	`message` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `developer_feedback_sender_idx` ON `developer_feedback` (`sender_owner_id`);--> statement-breakpoint
CREATE INDEX `developer_feedback_status_created_idx` ON `developer_feedback` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `user_profiles` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`avatar_data` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
