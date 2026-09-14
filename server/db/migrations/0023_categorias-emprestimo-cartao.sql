-- Empréstimo feito no cartão é dinheiro de outra pessoa passando pelo Fluxo.
-- A cobrança e o recebimento correspondente precisam ter categorias próprias
-- e ficar fora do livre para gastar, sem depender do usuário lembrar de marcar
-- a opção nas configurações.

UPDATE `categories`
SET
  `exclude_from_free_to_spend` = true,
  `updated_at` = CURRENT_TIMESTAMP
WHERE
  `archived_at` IS NULL
  AND `kind` = 'expense'
  AND lower(`name`) IN (
    lower('Empréstimo de cartão'),
    lower('Empréstimo do cartão'),
    lower('Emprestimo de cartao'),
    lower('Emprestimo do cartao')
  );
--> statement-breakpoint
INSERT INTO `categories` (
  `id`,
  `user_id`,
  `name`,
  `kind`,
  `parent_id`,
  `color`,
  `icon`,
  `is_essential`,
  `exclude_from_free_to_spend`,
  `sort_order`,
  `created_at`,
  `updated_at`
)
SELECT
  'category:card-loan-expense:' || `users`.`id`,
  `users`.`id`,
  'Empréstimo de cartão',
  'expense',
  NULL,
  '#7056b8',
  'credit-card',
  false,
  true,
  COALESCE((SELECT MAX(`sort_order`) + 1 FROM `categories` WHERE `user_id` = `users`.`id`), 0),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM `users`
WHERE NOT EXISTS (
  SELECT 1
  FROM `categories`
  WHERE
    `categories`.`user_id` = `users`.`id`
    AND `categories`.`archived_at` IS NULL
    AND `categories`.`kind` = 'expense'
    AND lower(`categories`.`name`) IN (
      lower('Empréstimo de cartão'),
      lower('Empréstimo do cartão'),
      lower('Emprestimo de cartao'),
      lower('Emprestimo do cartao')
    )
);
--> statement-breakpoint
UPDATE `categories`
SET
  `exclude_from_free_to_spend` = true,
  `updated_at` = CURRENT_TIMESTAMP
WHERE
  `archived_at` IS NULL
  AND `kind` = 'income'
  AND lower(`name`) IN (
    lower('Pagamento de empréstimo de cartão'),
    lower('Pagamento do empréstimo de cartão'),
    lower('Pagamento de emprestimo de cartao'),
    lower('Pagamento do emprestimo de cartao')
  );
--> statement-breakpoint
INSERT INTO `categories` (
  `id`,
  `user_id`,
  `name`,
  `kind`,
  `parent_id`,
  `color`,
  `icon`,
  `is_essential`,
  `exclude_from_free_to_spend`,
  `sort_order`,
  `created_at`,
  `updated_at`
)
SELECT
  'category:card-loan-income:' || `users`.`id`,
  `users`.`id`,
  'Pagamento de empréstimo de cartão',
  'income',
  NULL,
  '#7056b8',
  'credit-card',
  false,
  true,
  COALESCE((SELECT MAX(`sort_order`) + 1 FROM `categories` WHERE `user_id` = `users`.`id`), 0),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM `users`
WHERE NOT EXISTS (
  SELECT 1
  FROM `categories`
  WHERE
    `categories`.`user_id` = `users`.`id`
    AND `categories`.`archived_at` IS NULL
    AND `categories`.`kind` = 'income'
    AND lower(`categories`.`name`) IN (
      lower('Pagamento de empréstimo de cartão'),
      lower('Pagamento do empréstimo de cartão'),
      lower('Pagamento de emprestimo de cartao'),
      lower('Pagamento do emprestimo de cartao')
    )
);
