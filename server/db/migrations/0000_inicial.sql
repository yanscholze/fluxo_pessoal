CREATE TABLE `auth_attempts` (
	`key_hash` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`failures` integer DEFAULT 0 NOT NULL,
	`window_started_at` text NOT NULL,
	`blocked_until` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auth_attempts_updated_idx` ON `auth_attempts` (`updated_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`token_hash` text NOT NULL,
	`device_id` text,
	`device_name` text,
	`platform` text,
	`app_version` text,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_unq` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `sessions_user_kind_idx` ON `sessions` (`user_id`,`kind`);--> statement-breakpoint
CREATE INDEX `sessions_expires_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `user_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`avatar_url` text,
	`preferences` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`password_hash` text NOT NULL,
	`password_salt` text NOT NULL,
	`password_iterations` integer DEFAULT 210000 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unq` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`institution` text DEFAULT 'manual' NOT NULL,
	`kind` text NOT NULL,
	`currency` text DEFAULT 'BRL' NOT NULL,
	`opening_balance_cents` integer DEFAULT 0 NOT NULL,
	`opened_on` text NOT NULL,
	`goal_cents` integer,
	`monthly_yield_basis_points` integer DEFAULT 0 NOT NULL,
	`include_in_totals` integer DEFAULT true NOT NULL,
	`is_protected` integer DEFAULT false NOT NULL,
	`color` text DEFAULT '#6b7280' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_user_name_unq` ON `accounts` (`user_id`,`name`);--> statement-breakpoint
CREATE INDEX `accounts_user_idx` ON `accounts` (`user_id`);--> statement-breakpoint
CREATE TABLE `cards` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`payment_account_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`brand` text DEFAULT '' NOT NULL,
	`tier` text DEFAULT '' NOT NULL,
	`last4` text DEFAULT '' NOT NULL,
	`limit_cents` integer DEFAULT 0 NOT NULL,
	`closing_day` integer NOT NULL,
	`due_day` integer NOT NULL,
	`due_adjustment` text DEFAULT 'next' NOT NULL,
	`reward_mode` text DEFAULT 'none' NOT NULL,
	`points_per_dollar_milli` integer DEFAULT 0 NOT NULL,
	`cashback_basis_points` integer DEFAULT 0 NOT NULL,
	`points_goal` integer DEFAULT 0 NOT NULL,
	`manual_usd_rate_micros` integer DEFAULT 0 NOT NULL,
	`color` text DEFAULT '#6b7280' NOT NULL,
	`image_url` text,
	`is_primary` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`payment_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cards_user_name_unq` ON `cards` (`user_id`,`name`);--> statement-breakpoint
CREATE INDEX `cards_user_idx` ON `cards` (`user_id`);--> statement-breakpoint
CREATE INDEX `cards_payment_account_idx` ON `cards` (`payment_account_id`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`parent_id` text,
	`color` text DEFAULT '#6b7280' NOT NULL,
	`icon` text DEFAULT 'tag' NOT NULL,
	`is_essential` integer DEFAULT false NOT NULL,
	`exclude_from_free_to_spend` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_user_name_kind_unq` ON `categories` (`user_id`,`name`,`kind`);--> statement-breakpoint
CREATE INDEX `categories_user_parent_idx` ON `categories` (`user_id`,`parent_id`);--> statement-breakpoint
CREATE TABLE `trips` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`currency` text DEFAULT 'BRL' NOT NULL,
	`exchange_rate_micros` integer DEFAULT 1000000 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trips_user_name_start_unq` ON `trips` (`user_id`,`name`,`start_date`);--> statement-breakpoint
CREATE INDEX `trips_user_period_idx` ON `trips` (`user_id`,`start_date`);--> statement-breakpoint
CREATE TABLE `installment_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`card_id` text NOT NULL,
	`category_id` text,
	`description` text NOT NULL,
	`total_amount_cents` integer NOT NULL,
	`installment_count` integer NOT NULL,
	`purchase_date` text NOT NULL,
	`first_competence` text NOT NULL,
	`monthly_interest_basis_points` integer DEFAULT 0 NOT NULL,
	`label` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `installment_plans_user_status_idx` ON `installment_plans` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `installment_plans_card_idx` ON `installment_plans` (`card_id`);--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`card_id` text NOT NULL,
	`competence` text NOT NULL,
	`closing_date` text NOT NULL,
	`due_date` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`closed_at` text,
	`paid_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_card_competence_unq` ON `invoices` (`card_id`,`competence`);--> statement-breakpoint
CREATE INDEX `invoices_user_due_idx` ON `invoices` (`user_id`,`due_date`);--> statement-breakpoint
CREATE TABLE `ledger_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`transaction_id` text NOT NULL,
	`account_id` text,
	`card_id` text,
	`amount_cents` integer NOT NULL,
	`effective_on` text NOT NULL,
	`competence` text NOT NULL,
	`state` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ledger_account_date_idx` ON `ledger_entries` (`user_id`,`account_id`,`effective_on`);--> statement-breakpoint
CREATE INDEX `ledger_card_competence_idx` ON `ledger_entries` (`user_id`,`card_id`,`competence`);--> statement-breakpoint
CREATE INDEX `ledger_transaction_idx` ON `ledger_entries` (`transaction_id`);--> statement-breakpoint
CREATE INDEX `ledger_user_state_date_idx` ON `ledger_entries` (`user_id`,`state`,`effective_on`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`state` text DEFAULT 'confirmed' NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`description` text NOT NULL,
	`category_id` text,
	`amount_cents` integer NOT NULL,
	`currency` text DEFAULT 'BRL' NOT NULL,
	`occurred_on` text NOT NULL,
	`competence` text NOT NULL,
	`origin_account_id` text,
	`origin_card_id` text,
	`destination_account_id` text,
	`destination_card_id` text,
	`trip_id` text,
	`installment_plan_id` text,
	`installment_number` integer,
	`invoice_id` text,
	`notes` text,
	`fingerprint` text,
	`version` integer DEFAULT 1 NOT NULL,
	`deleted_at` text,
	`last_mutation_id` text,
	`device_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`origin_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`origin_card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`destination_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`destination_card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`installment_plan_id`) REFERENCES `installment_plans`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_user_fingerprint_unq` ON `transactions` (`user_id`,`fingerprint`);--> statement-breakpoint
CREATE INDEX `transactions_user_occurred_idx` ON `transactions` (`user_id`,`occurred_on`);--> statement-breakpoint
CREATE INDEX `transactions_user_competence_idx` ON `transactions` (`user_id`,`competence`);--> statement-breakpoint
CREATE INDEX `transactions_user_updated_idx` ON `transactions` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `transactions_plan_idx` ON `transactions` (`installment_plan_id`,`installment_number`);--> statement-breakpoint
CREATE INDEX `transactions_invoice_idx` ON `transactions` (`invoice_id`);--> statement-breakpoint
CREATE INDEX `transactions_trip_idx` ON `transactions` (`user_id`,`trip_id`);--> statement-breakpoint
CREATE TABLE `recurrence_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`recurrence_id` text NOT NULL,
	`competence` text NOT NULL,
	`transaction_id` text,
	`outcome` text NOT NULL,
	`scheduled_for` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`ran_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recurrence_id`) REFERENCES `recurrences`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recurrence_runs_recurrence_competence_unq` ON `recurrence_runs` (`recurrence_id`,`competence`);--> statement-breakpoint
CREATE INDEX `recurrence_runs_user_idx` ON `recurrence_runs` (`user_id`,`competence`);--> statement-breakpoint
CREATE TABLE `recurrences` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'standard' NOT NULL,
	`kind` text NOT NULL,
	`description` text NOT NULL,
	`category_id` text,
	`account_id` text,
	`card_id` text,
	`destination_account_id` text,
	`amount_cents` integer NOT NULL,
	`amount_mode` text DEFAULT 'fixed' NOT NULL,
	`schedule_mode` text DEFAULT 'day_of_month' NOT NULL,
	`schedule_day` integer NOT NULL,
	`day_adjustment` text DEFAULT 'next' NOT NULL,
	`interval` text DEFAULT 'monthly' NOT NULL,
	`starts_on` text NOT NULL,
	`ends_on` text,
	`is_active` integer DEFAULT true NOT NULL,
	`auto_confirm` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`destination_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recurrences_user_active_idx` ON `recurrences` (`user_id`,`is_active`);--> statement-breakpoint
CREATE INDEX `recurrences_user_role_idx` ON `recurrences` (`user_id`,`role`);