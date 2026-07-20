CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`institution` text DEFAULT 'manual' NOT NULL,
	`kind` text DEFAULT 'checking' NOT NULL,
	`balance_cents` integer DEFAULT 0 NOT NULL,
	`color` text DEFAULT 'teal' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `accounts_owner_idx` ON `accounts` (`owner_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_owner_name_idx` ON `accounts` (`owner_id`,`name`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'expense' NOT NULL,
	`color` text DEFAULT 'teal' NOT NULL,
	`icon` text DEFAULT 'circle' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `categories_owner_idx` ON `categories` (`owner_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `categories_owner_name_idx` ON `categories` (`owner_id`,`name`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`description` text NOT NULL,
	`category` text DEFAULT 'Outros' NOT NULL,
	`account` text DEFAULT 'Nubank' NOT NULL,
	`occurred_at` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`type` text NOT NULL,
	`installments` text,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`fingerprint` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `transactions_owner_date_idx` ON `transactions` (`owner_id`,`occurred_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_owner_fingerprint_idx` ON `transactions` (`owner_id`,`fingerprint`);