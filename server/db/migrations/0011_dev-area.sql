-- Área de trabalho: clientes, projetos, tarefas, horas, propostas, pagamentos,
-- deploys e histórico.
--
-- É a segunda metade do Fluxo: a primeira responde "como está meu dinheiro",
-- esta responde "de onde ele vem". Ver server/db/schema/dev.ts para o porquê
-- de cada decisão de modelagem — em especial hora como lançamento e parcela de
-- contrato ligada ao lançamento financeiro que a realizou.

CREATE TABLE `clients` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`contact_name` text,
	`email` text,
	`phone` text,
	`document` text,
	`notes` text,
	`color` text DEFAULT '#6366f1' NOT NULL,
	`archived_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `clients_user_idx` ON `clients` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `clients_user_name_unq` ON `clients` (`user_id`,`name`);--> statement-breakpoint
CREATE TABLE `project_deployments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`environment` text DEFAULT 'production' NOT NULL,
	`provider` text,
	`domain` text,
	`status` text DEFAULT 'unknown' NOT NULL,
	`last_deployed_at` text,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_deployments_user_project_idx` ON `project_deployments` (`user_id`,`project_id`);--> statement-breakpoint
CREATE TABLE `project_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`kind` text NOT NULL,
	`summary` text NOT NULL,
	`details` text,
	`occurred_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_events_user_project_idx` ON `project_events` (`user_id`,`project_id`);--> statement-breakpoint
CREATE TABLE `project_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`description` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`due_on` text NOT NULL,
	`received_on` text,
	`transaction_id` text,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `project_payments_user_project_idx` ON `project_payments` (`user_id`,`project_id`);--> statement-breakpoint
CREATE INDEX `project_payments_user_due_idx` ON `project_payments` (`user_id`,`due_on`);--> statement-breakpoint
CREATE TABLE `project_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`details` text,
	`kind` text DEFAULT 'feature' NOT NULL,
	`status` text DEFAULT 'todo' NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`due_on` text,
	`estimate_milli` integer DEFAULT 0 NOT NULL,
	`billable` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_tasks_user_project_idx` ON `project_tasks` (`user_id`,`project_id`);--> statement-breakpoint
CREATE INDEX `project_tasks_user_status_idx` ON `project_tasks` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`client_id` text,
	`name` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'active' NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`starts_on` text,
	`due_on` text,
	`delivered_on` text,
	`contract_cents` integer DEFAULT 0 NOT NULL,
	`hourly_rate_cents` integer DEFAULT 0 NOT NULL,
	`estimated_hours_milli` integer DEFAULT 0 NOT NULL,
	`repository_url` text,
	`main_branch` text,
	`production_url` text,
	`documentation_url` text,
	`notes` text,
	`color` text DEFAULT '#6366f1' NOT NULL,
	`archived_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `projects_user_status_idx` ON `projects` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `projects_user_client_idx` ON `projects` (`user_id`,`client_id`);--> statement-breakpoint
CREATE INDEX `projects_user_due_idx` ON `projects` (`user_id`,`due_on`);--> statement-breakpoint
CREATE TABLE `proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`project_id` text,
	`client_id` text,
	`title` text NOT NULL,
	`scope` text,
	`conditions` text,
	`amount_cents` integer DEFAULT 0 NOT NULL,
	`deadline_days` integer,
	`status` text DEFAULT 'draft' NOT NULL,
	`sent_on` text,
	`decided_on` text,
	`file_url` text,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `proposals_user_project_idx` ON `proposals` (`user_id`,`project_id`);--> statement-breakpoint
CREATE TABLE `time_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`task_id` text,
	`worked_on` text NOT NULL,
	`duration_milli` integer NOT NULL,
	`description` text NOT NULL,
	`billable` integer DEFAULT true NOT NULL,
	`rate_cents` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `project_tasks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `time_entries_user_project_idx` ON `time_entries` (`user_id`,`project_id`);--> statement-breakpoint
CREATE INDEX `time_entries_user_date_idx` ON `time_entries` (`user_id`,`worked_on`);
