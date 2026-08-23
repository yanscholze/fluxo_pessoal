ALTER TABLE `accounts` ADD `goal_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `accounts` ADD `monthly_yield_basis_points` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `accounts` ADD `fixed` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `categories` ADD `essential` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `recurring_entries` ADD `payment_method` text DEFAULT 'transfer' NOT NULL;--> statement-breakpoint
ALTER TABLE `recurring_entries` ADD `card_id` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `invoice_month` text;