ALTER TABLE `transactions` ADD `installment_group_id` text;--> statement-breakpoint
CREATE INDEX `transactions_owner_installment_group_idx` ON `transactions` (`owner_id`,`installment_group_id`);--> statement-breakpoint
UPDATE `accounts`
SET
  `balance_cents` = `balance_cents`
    - COALESCE((
      SELECT SUM(
        CASE
          WHEN `t`.`deleted_at` IS NULL
            AND `t`.`status` = 'confirmed'
            AND `t`.`payment_method` IN ('debit', 'cash', 'transfer')
          THEN CASE WHEN `t`.`type` = 'income' THEN `t`.`amount_cents` ELSE -`t`.`amount_cents` END
          ELSE 0
        END
      )
      FROM `transactions` AS `t`
      WHERE `t`.`owner_id` = `accounts`.`owner_id`
        AND `t`.`account` = `accounts`.`name`
    ), 0)
    - COALESCE((
      SELECT SUM(
        CASE
          WHEN `t`.`deleted_at` IS NULL
            AND `t`.`status` = 'confirmed'
            AND `t`.`source` = 'account-transfer'
          THEN `t`.`amount_cents`
          ELSE 0
        END
      )
      FROM `transactions` AS `t`
      WHERE `t`.`owner_id` = `accounts`.`owner_id`
        AND `t`.`destination_account` = `accounts`.`name`
    ), 0),
  `updated_at` = CURRENT_TIMESTAMP
WHERE `owner_id` IN (
  SELECT `id` FROM `users` WHERE lower(`email`) = 'yanaugustoscholze@gmail.com'
)
  AND `kind` <> 'credit-card';--> statement-breakpoint
DELETE FROM `sync_mutations`
WHERE `owner_id` IN (
  SELECT `id` FROM `users` WHERE lower(`email`) = 'yanaugustoscholze@gmail.com'
)
  AND `entity_type` = 'transaction';--> statement-breakpoint
DELETE FROM `transactions`
WHERE `owner_id` IN (
  SELECT `id` FROM `users` WHERE lower(`email`) = 'yanaugustoscholze@gmail.com'
);
