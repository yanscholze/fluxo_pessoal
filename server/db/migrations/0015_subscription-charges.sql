-- Cobrança de assinatura sai da fila de revisão.
--
-- Uma cobrança de assinatura já cadastrada não tem o que ser revisado: o valor
-- é conhecido, a data é conhecida, e pedir confirmação todo mês do que o
-- próprio usuário agendou transforma a fila num ritual que se aprende a
-- ignorar — e aí o que importa na fila passa despercebido junto.
--
-- Ela passa a viver na aba de Assinaturas, que é onde a pergunta sobre ela é
-- feita. A regra de reconhecimento está em core/domain/capture/reconcile.ts.

ALTER TABLE `capture_events` ADD `subscription_id` text REFERENCES recurrences(id);
