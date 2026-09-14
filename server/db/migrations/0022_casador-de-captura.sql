-- Liga uma recorrência às notificações que a pagam.
--
-- `capture_match`: o texto que identifica o boleto ou a cobrança desta regra
-- dentro da notificação do banco. Bateu, confirmar a captura dá baixa na
-- ocorrência do mês em vez de criar um lançamento solto.
--
-- `capture_ignore`: o texto que significa "isto não é pagamento". O banco avisa
-- quando o boleto é **emitido** e de novo quando é **pago**; sem este filtro a
-- emissão entraria na fila todo mês, para ser ignorada à mão todo mês.
ALTER TABLE `recurrences` ADD COLUMN `capture_match` text;
--> statement-breakpoint
ALTER TABLE `recurrences` ADD COLUMN `capture_ignore` text;
