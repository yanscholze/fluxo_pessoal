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
-- Sem `REFERENCES` na coluna, de propósito.
--
-- A migration inteira vai num lote atômico, e o D1 prepara as instruções antes
-- de executá-las: uma chave estrangeira apontando para a tabela criada duas
-- linhas acima não encontra o destino na hora da preparação, e o lote falha
-- inteiro. Foi o que travou a produção na décima quarta migration, com o
-- migrator repetindo a mesma falha a cada requisição.
--
-- A referência das outras migrations funciona porque aponta para tabela que já
-- existia antes do lote — `categories` na décima, `recurrences` na décima
-- quinta. Aqui o destino nasce junto.
--
-- Quem garante a integridade é o serviço: `createSubscription` e
-- `updateSubscription` conferem a classificação contra `listLabels` antes de
-- gravar, e `archiveLabel` arquiva em vez de apagar justamente para nenhuma
-- assinatura ficar apontando para o vazio.
ALTER TABLE `recurrences` ADD `subscription_label_id` text;
