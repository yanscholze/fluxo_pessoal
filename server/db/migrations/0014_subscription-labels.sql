-- Classificação de assinatura: streaming, IA, anuidade do cartão.
--
-- É um eixo diferente da categoria. A categoria responde "que tipo de gasto é"
-- para o orçamento inteiro; a classificação responde "que tipo de assinatura é"
-- dentro do bolo de assinaturas. Usar categoria para os dois misturaria os
-- eixos: ou o orçamento ganha seis categorias de assinatura, ou o relatório de
-- assinaturas fica sem detalhe.

CREATE TABLE `subscription_labels` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#6366f1' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscription_labels_user_name_unq` ON `subscription_labels` (`user_id`,`name`);--> statement-breakpoint
ALTER TABLE `recurrences` ADD `subscription_label_id` text REFERENCES subscription_labels(id);
