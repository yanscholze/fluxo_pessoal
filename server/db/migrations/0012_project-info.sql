-- Ficha do projeto: onde ele mora e por onde se entra.
--
-- Painel da infraestrutura, painel administrativo e o usuário de acesso. A
-- senha **não** entra: `credentials_hint` guarda onde ela está — "1Password,
-- cofre Clientes" —, porque senha em texto no banco transformaria um
-- vazamento do Fluxo num vazamento de todos os projetos do usuário.

ALTER TABLE `projects` ADD `infra_url` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `admin_url` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `admin_user` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `credentials_hint` text;
