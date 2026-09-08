-- Pontos que o cartão já tinha antes do Fluxo começar a acompanhar.
--
-- Sem isto o saldo mostrado é só o que o app viu desde a instalação, e fica
-- permanentemente abaixo do saldo do emissor. Zero é o padrão correto: um
-- cartão novo não tem saldo anterior.
ALTER TABLE `cards` ADD COLUMN `points_opening_milli` integer DEFAULT 0 NOT NULL;
