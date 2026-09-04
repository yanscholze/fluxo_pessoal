-- O que entrou, quando não foi o combinado.
--
-- Uma parcela de R$ 1.500 paga com R$ 1.400 continua quitada — quem recebeu
-- decide isso — mas o razão precisa registrar R$ 1.400, que é o que o banco
-- mostra. Sem esta coluna, aceitar a sugestão de "valor diferente" lançava o
-- combinado no razão e o saldo do Fluxo passava a divergir do extrato.
--
-- Nulo significa "entrou o combinado", que é o caso normal.
ALTER TABLE project_payments ADD COLUMN received_amount_cents INTEGER;
