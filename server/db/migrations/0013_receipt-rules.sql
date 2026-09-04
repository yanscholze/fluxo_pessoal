-- Conciliação de recebimento: quem paga o quê.
--
-- `receipt_rules` guarda o nome do pagador que o usuário aponta uma vez — o
-- contratante do projeto, a empresa do salário, o cartão de benefício. Quando
-- um pix chega, o remetente é comparado com estes nomes.
--
-- `capture_reconciliations` guarda o que o domínio decidiu para cada captura,
-- **com o motivo**. Só nome equivalente e valor idêntico dá baixa sozinho; o
-- resto vira sugestão na fila, e sem o motivo a tela não teria como explicar
-- por que parou ali. A régua mora em core/domain/capture/reconcile.ts.

CREATE TABLE `capture_reconciliations` (
	`capture_event_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`rule_id` text,
	`target` text NOT NULL,
	`payment_id` text,
	`outcome` text NOT NULL,
	`reason` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`capture_event_id`) REFERENCES `capture_events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`rule_id`) REFERENCES `receipt_rules`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`payment_id`) REFERENCES `project_payments`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `capture_reconciliations_user_idx` ON `capture_reconciliations` (`user_id`,`outcome`);--> statement-breakpoint
CREATE TABLE `receipt_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`payer_name` text NOT NULL,
	`target` text NOT NULL,
	`project_id` text,
	`account_id` text NOT NULL,
	`category_id` text,
	`is_active` integer DEFAULT true NOT NULL,
	`last_matched_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `receipt_rules_user_idx` ON `receipt_rules` (`user_id`,`is_active`);--> statement-breakpoint
CREATE UNIQUE INDEX `receipt_rules_user_payer_target_unq` ON `receipt_rules` (`user_id`,`payer_name`,`target`);
