-- Estado por usuário. Ler não resolve o compromisso, e resolver não apaga o histórico.
CREATE TABLE `notifications` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `event_key` text NOT NULL,
  `source` text NOT NULL CHECK (`source` IN ('rule', 'analysis')),
  `category` text NOT NULL CHECK (`category` IN ('critical', 'attention', 'insight', 'opportunity', 'reminder')),
  `priority` integer NOT NULL CHECK (`priority` BETWEEN 1 AND 5),
  `title` text NOT NULL,
  `body` text NOT NULL,
  `screen` text NOT NULL,
  `href` text NOT NULL,
  `ask_prompt` text NOT NULL,
  `facts_json` text NOT NULL DEFAULT '{}',
  `revision` integer NOT NULL DEFAULT 1,
  `read_at` text,
  `resolved_at` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_user_event_unq` ON `notifications` (`user_id`, `event_key`);
--> statement-breakpoint
CREATE INDEX `notifications_user_active_unread_idx` ON `notifications` (`user_id`, `resolved_at`, `read_at`);
