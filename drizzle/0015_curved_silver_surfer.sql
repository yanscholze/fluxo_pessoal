ALTER TABLE `transactions` ADD `import_batch_id` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `import_batch_name` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `import_batch_month` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `imported_at` text;--> statement-breakpoint
CREATE INDEX `transactions_owner_import_batch_idx` ON `transactions` (`owner_id`,`import_batch_id`);--> statement-breakpoint
UPDATE `transactions`
SET
  `deleted_at` = CURRENT_TIMESTAMP,
  `version` = `version` + 1,
  `device_id` = 'web',
  `last_mutation_id` = NULL,
  `updated_at` = CURRENT_TIMESTAMP
WHERE `owner_id` IN (
  SELECT `id` FROM `users` WHERE lower(`email`) = 'yanaugustoscholze@gmail.com'
)
  AND `source` = 'import'
  AND `payment_method` = 'credit'
  AND `deleted_at` IS NULL;
