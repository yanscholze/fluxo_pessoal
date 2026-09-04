-- Em que o tempo foi gasto, e onde a proposta mora.
--
-- 1. `time_entries.activity` — "80 horas neste projeto" não é informação sobre
--    a qual dá para decidir; "50 de desenvolvimento e 30 de correção de bug" é.
--    O valor `development` para as linhas antigas é o que 100% delas
--    efetivamente eram: não havia outra coisa a registrar.
--
-- 2. `time_entries.rate_cents` sai. O valor/hora não é dado da sessão: uma
--    sessão registra que três horas aconteceram numa terça, não quanto elas
--    valeram. O valor/hora efetivo passa a ser sempre um cálculo do relatório
--    — receita do projeto dividida pelo tempo — e por isso reflete o dinheiro
--    que entrou, e não o preço que estava valendo no dia do lançamento.
--
-- A tabela é recriada em vez de alterada. `ALTER TABLE ... ADD COLUMN` recusa
-- default não constante, e `CURRENT_TIMESTAMP` é um deles; recriar resolve o
-- `updated_at` e o `DROP COLUMN` de uma vez, e é o caminho que o próprio
-- SQLite documenta para mudança estrutural.
--
-- 3. `project_documents` guarda a proposta e o contrato de verdade, e não um
--    link: link some quando a pasta é reorganizada, e some justamente no dia
--    da discussão sobre escopo. O conteúdo fica numa tabela à parte para que
--    listar os papéis de um projeto não arraste os megabytes de todos eles.
CREATE TABLE `time_entries_novo` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`task_id` text,
	`worked_on` text NOT NULL,
	`duration_milli` integer NOT NULL,
	`description` text NOT NULL,
	`activity` text DEFAULT 'development' NOT NULL,
	`billable` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `project_tasks`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
INSERT INTO `time_entries_novo` (`id`, `user_id`, `project_id`, `task_id`, `worked_on`, `duration_milli`, `description`, `activity`, `billable`, `created_at`, `updated_at`)
SELECT `id`, `user_id`, `project_id`, `task_id`, `worked_on`, `duration_milli`, `description`, 'development', `billable`, `created_at`, `created_at` FROM `time_entries`;--> statement-breakpoint
DROP TABLE `time_entries`;--> statement-breakpoint
ALTER TABLE `time_entries_novo` RENAME TO `time_entries`;--> statement-breakpoint
CREATE INDEX `time_entries_user_project_idx` ON `time_entries` (`user_id`,`project_id`);--> statement-breakpoint
CREATE INDEX `time_entries_user_date_idx` ON `time_entries` (`user_id`,`worked_on`);--> statement-breakpoint
CREATE INDEX `time_entries_user_activity_idx` ON `time_entries` (`user_id`,`activity`);--> statement-breakpoint
CREATE TABLE `project_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`kind` text DEFAULT 'other' NOT NULL,
	`name` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`notes` text,
	`uploaded_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `project_documents_user_project_idx` ON `project_documents` (`user_id`,`project_id`);--> statement-breakpoint
CREATE TABLE `project_document_blobs` (
	`document_id` text PRIMARY KEY NOT NULL,
	`content` blob NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `project_documents`(`id`) ON UPDATE no action ON DELETE cascade
);
