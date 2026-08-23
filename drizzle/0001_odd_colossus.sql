CREATE TABLE `recurring_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`description` text DEFAULT 'Salário' NOT NULL,
	`category` text DEFAULT 'Receita' NOT NULL,
	`account` text DEFAULT 'Nubank' NOT NULL,
	`amount_cents` integer DEFAULT 0 NOT NULL,
	`type` text DEFAULT 'income' NOT NULL,
	`day_of_month` integer DEFAULT 1 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`last_confirmed_month` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `recurring_entries_owner_idx` ON `recurring_entries` (`owner_id`);