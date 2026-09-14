-- Nome de conta, cartão e categoria deixa de ficar preso depois de arquivado.
--
-- O índice único não distinguia arquivado de ativo, então uma conta que saiu de
-- cena continuava reservando o nome para sempre. Quem desfez uma importação e
-- refez ficava com "Nubank Conta (2)" e "Combustível 2" sem nenhuma forma de
-- voltar atrás: renomear o arquivado exigia alcançá-lo, e ele não aparece em
-- lugar nenhum da interface.
--
-- Índice parcial resolve na raiz: só o que está em uso reserva nome.

DROP INDEX IF EXISTS `accounts_user_name_unq`;--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_user_name_unq` ON `accounts` (`user_id`,`name`) WHERE `archived_at` IS NULL;--> statement-breakpoint
DROP INDEX IF EXISTS `cards_user_name_unq`;--> statement-breakpoint
CREATE UNIQUE INDEX `cards_user_name_unq` ON `cards` (`user_id`,`name`) WHERE `archived_at` IS NULL;--> statement-breakpoint
DROP INDEX IF EXISTS `categories_user_name_kind_unq`;--> statement-breakpoint
CREATE UNIQUE INDEX `categories_user_name_kind_unq` ON `categories` (`user_id`,`name`,`kind`) WHERE `archived_at` IS NULL;
