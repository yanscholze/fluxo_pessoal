-- Foto do cartão, num blob à parte.
--
-- A coluna `image_url` já existia em `cards` e nunca foi usada. Guardar a
-- imagem nela, em base64, engordaria toda listagem de cartão — e a listagem é
-- o que o painel e o aplicativo carregam a cada abertura. Aqui a coluna passa a
-- guardar só o caminho, e os bytes vivem numa tabela que só é lida quando
-- alguém pede a imagem.

CREATE TABLE `card_images` (
	`card_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`content` blob NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `card_images_user_idx` ON `card_images` (`user_id`);
