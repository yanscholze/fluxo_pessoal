/**
 * Conciliação de recebimento, contra o banco.
 *
 * O teste de domínio prova que a régua está certa. Este prova que ela recebe os
 * dados certos — os candidatos montados a partir do que o usuário cadastrou — e
 * que a baixa, quando acontece, move dinheiro de verdade no razão.
 */

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { cents } from "../../core/kernel/money.ts";
import { localDate } from "../../core/time/local-date.ts";
import { ambiente, zerar } from "../testing/cenario.ts";

const AGORA = new Date("2026-09-10T12:00:00Z");

/** Um projeto com uma parcela de R$ 3.000 em aberto, e a regra do pagador. */
async function cenarioDeProjeto(userId: string, contaId: string) {
  const { createClient, createProject, schedulePayment } = await import("./work.ts");
  const { createReceiptRule } = await import("./reconciliation.ts");

  const clienteId = await createClient(userId, { name: "Padaria do Bairro" }, AGORA);
  const projetoId = await createProject(
    userId,
    { name: "Site institucional", clientId: clienteId, contract: cents(300_000) },
    AGORA,
  );
  const parcelaId = await schedulePayment(
    userId,
    {
      projectId: projetoId,
      description: "Entrada",
      amount: cents(300_000),
      dueOn: localDate("2026-09-15"),
    },
    AGORA,
  );

  const regraId = await createReceiptRule(
    userId,
    {
      payerName: "Padaria do Bairro",
      target: "project",
      projectId: projetoId,
      accountId: contaId,
    },
    AGORA,
  );

  return { projetoId, parcelaId, regraId };
}

/** Uma notificação de pix recebido, como o Android a envia. */
function pix(de: string, valor: string) {
  return {
    sourceApp: "com.nu.production",
    title: "Você recebeu uma transferência",
    text: `Você recebeu um Pix de R$ ${valor} de ${de}`,
    postedAt: AGORA.getTime(),
    deviceEventId: `evento-${de}-${valor}`,
  };
}

describe("conciliação de recebimento", () => {
  beforeEach(() => zerar());

  it("dá baixa sozinha quando nome e valor batem", async () => {
    const { ingest } = await import("./captures.ts");
    const { buildProjectDetail } = await import("./work.ts");
    const { buildAccountsView } = await import("./accounts.ts");
    const alvo = await ambiente(500_000);
    const { projetoId } = await cenarioDeProjeto(alvo.userId, alvo.contaId);

    const resultado = await ingest(alvo.userId, [pix("PADARIA DO BAIRRO LTDA", "3.000,00")], AGORA);

    assert.equal(resultado.captured, 1);
    assert.equal(resultado.settled, 1, "casamento perfeito dispensa revisão");

    const detalhe = await buildProjectDetail(alvo.userId, projetoId, AGORA);
    assert.equal(detalhe.health.finance.received, 300_000, "a parcela foi quitada");

    const contas = await buildAccountsView(alvo.userId, AGORA);
    assert.equal(
      contas.accounts.find((conta) => conta.id === alvo.contaId)?.balanceCents,
      800_000,
      "e o dinheiro entrou no razão",
    );
  });

  it("valor diferente vira sugestão, não baixa", async () => {
    const { ingest } = await import("./captures.ts");
    const { buildProjectDetail } = await import("./work.ts");
    const alvo = await ambiente(500_000);
    const { projetoId } = await cenarioDeProjeto(alvo.userId, alvo.contaId);

    const resultado = await ingest(alvo.userId, [pix("PADARIA DO BAIRRO LTDA", "2.999,99")], AGORA);

    assert.equal(resultado.settled, 0);
    assert.equal(resultado.suggested, 1);

    const detalhe = await buildProjectDetail(alvo.userId, projetoId, AGORA);
    assert.equal(detalhe.health.finance.received, 0, "nada foi quitado sem decisão");
  });

  it("pagador desconhecido não vira sugestão nenhuma", async () => {
    const { ingest } = await import("./captures.ts");
    const alvo = await ambiente(500_000);
    await cenarioDeProjeto(alvo.userId, alvo.contaId);

    const resultado = await ingest(alvo.userId, [pix("OUTRA EMPRESA SA", "3.000,00")], AGORA);

    assert.equal(resultado.captured, 1, "a captura entra na fila normalmente");
    assert.equal(resultado.settled, 0);
    assert.equal(resultado.suggested, 0, "sem regra que case, não há o que sugerir");
  });

  it("confirmar a sugestão quita a parcela", async () => {
    const { ingest, buildCapturesView } = await import("./captures.ts");
    const { acceptReconciliation } = await import("./reconciliation.ts");
    const { buildProjectDetail } = await import("./work.ts");
    const alvo = await ambiente(500_000);
    const { projetoId } = await cenarioDeProjeto(alvo.userId, alvo.contaId);

    await ingest(alvo.userId, [pix("PADARIA DO BAIRRO LTDA", "2.500,00")], AGORA);

    const fila = await buildCapturesView(alvo.userId, AGORA);
    const pendente = fila.pending[0];
    assert.ok(pendente, "a captura precisa estar na fila");

    await acceptReconciliation(alvo.userId, pendente.id, AGORA);

    const detalhe = await buildProjectDetail(alvo.userId, projetoId, AGORA);
    assert.equal(
      detalhe.health.finance.received,
      250_000,
      "quita a parcela, mas conta o que entrou — não o combinado",
    );
    assert.equal(detalhe.health.finance.pending, 0, "não sobra parcela em aberto");
  });

  it("o razão registra o valor recebido, não o combinado", async () => {
    const { ingest, buildCapturesView } = await import("./captures.ts");
    const { acceptReconciliation } = await import("./reconciliation.ts");
    const { buildAccountsView } = await import("./accounts.ts");
    const alvo = await ambiente(500_000);
    await cenarioDeProjeto(alvo.userId, alvo.contaId);

    // R$ 2.500 numa parcela de R$ 3.000: o usuário decide que quita, mas o que
    // entrou na conta foram R$ 2.500. Lançar R$ 3.000 faria o saldo do Fluxo
    // divergir do extrato do banco — a falha que ninguém percebe até o mês
    // fechar errado.
    await ingest(alvo.userId, [pix("PADARIA DO BAIRRO LTDA", "2.500,00")], AGORA);

    const fila = await buildCapturesView(alvo.userId, AGORA);
    await acceptReconciliation(alvo.userId, fila.pending[0].id, AGORA);

    const contas = await buildAccountsView(alvo.userId, AGORA);
    const conta = contas.accounts.find((linha) => linha.id === alvo.contaId);
    assert.equal(conta?.balanceCents, 750_000, "500.000 iniciais + 250.000 que entraram");
  });

  it("não dá baixa duas vezes no reenvio da fila", async () => {
    const { ingest } = await import("./captures.ts");
    const { buildAccountsView } = await import("./accounts.ts");
    const alvo = await ambiente(500_000);
    await cenarioDeProjeto(alvo.userId, alvo.contaId);

    // O aparelho reenvia a fila inteira quando reconecta.
    await ingest(alvo.userId, [pix("PADARIA DO BAIRRO LTDA", "3.000,00")], AGORA);
    const segundo = await ingest(alvo.userId, [pix("PADARIA DO BAIRRO LTDA", "3.000,00")], AGORA);

    assert.equal(segundo.captured, 0, "o índice único absorve o reenvio");
    assert.equal(segundo.settled, 0);

    const contas = await buildAccountsView(alvo.userId, AGORA);
    assert.equal(
      contas.accounts.find((conta) => conta.id === alvo.contaId)?.balanceCents,
      800_000,
      "a receita entrou uma vez só",
    );
  });

  it("salário nunca é automático, mesmo com o nome certo", async () => {
    const { ingest } = await import("./captures.ts");
    const { createReceiptRule } = await import("./reconciliation.ts");
    const alvo = await ambiente(500_000);

    await createReceiptRule(
      alvo.userId,
      { payerName: "Acme Tecnologia", target: "salary", accountId: alvo.contaId },
      AGORA,
    );

    const resultado = await ingest(alvo.userId, [pix("ACME TECNOLOGIA LTDA", "6.200,00")], AGORA);

    assert.equal(resultado.settled, 0, "sem valor esperado, não há casamento perfeito");
    assert.equal(resultado.suggested, 1);
  });

  it("confirmar salário cria a receita na conta da regra", async () => {
    const { ingest, buildCapturesView } = await import("./captures.ts");
    const { acceptReconciliation, createReceiptRule } = await import("./reconciliation.ts");
    const { buildAccountsView } = await import("./accounts.ts");
    const alvo = await ambiente(500_000);

    await createReceiptRule(
      alvo.userId,
      { payerName: "Acme Tecnologia", target: "salary", accountId: alvo.contaId },
      AGORA,
    );

    await ingest(alvo.userId, [pix("ACME TECNOLOGIA LTDA", "6.200,00")], AGORA);
    const fila = await buildCapturesView(alvo.userId, AGORA);
    await acceptReconciliation(alvo.userId, fila.pending[0].id, AGORA);

    const contas = await buildAccountsView(alvo.userId, AGORA);
    assert.equal(
      contas.accounts.find((conta) => conta.id === alvo.contaId)?.balanceCents,
      1_120_000,
      "500,00 iniciais mais 6.200,00 de salário",
    );
  });

  it("a regra de um usuário não concilia o pix de outro", async () => {
    const { ingest } = await import("./captures.ts");
    const { signUp } = await import("./auth.ts");
    const alvo = await ambiente(500_000);
    await cenarioDeProjeto(alvo.userId, alvo.contaId);

    const { user: outro } = await signUp({
      email: "outro-pix@fluxo.app",
      password: "senha-do-outro-123",
      displayName: "Outro",
    });

    const resultado = await ingest(outro.id, [pix("PADARIA DO BAIRRO LTDA", "3.000,00")], AGORA);
    assert.equal(resultado.settled, 0);
    assert.equal(resultado.suggested, 0);
  });
});

describe("cobrança de assinatura", () => {
  beforeEach(() => zerar());

  /** Uma notificação de compra no cartão, como o Android a envia. */
  function compra(estabelecimento: string, valor: string, id: string) {
    return {
      sourceApp: "com.nu.production",
      title: "Compra aprovada",
      text: `Compra aprovada: R$ ${valor} em ${estabelecimento}`,
      postedAt: AGORA.getTime(),
      deviceEventId: id,
    };
  }

  it("não entra na fila de revisão", async () => {
    const { ingest, buildCapturesView } = await import("./captures.ts");
    const { createSubscription } = await import("./subscriptions.ts");
    const alvo = await ambiente();

    await createSubscription(
      alvo.userId,
      { description: "Netflix", amount: cents(5_590), scheduleDay: 12, cardId: alvo.cartaoId },
      AGORA,
    );

    const resultado = await ingest(alvo.userId, [compra("NETFLIX.COM", "55,90", "ev-netflix")], AGORA);

    assert.equal(resultado.captured, 1);
    assert.equal(resultado.subscriptions, 1);

    const fila = await buildCapturesView(alvo.userId, AGORA);
    assert.equal(fila.pending.length, 0, "assinatura conhecida vive na própria aba");
  });

  it("reconhece mesmo com o valor reajustado", async () => {
    const { ingest, buildCapturesView } = await import("./captures.ts");
    const { createSubscription } = await import("./subscriptions.ts");
    const alvo = await ambiente();

    await createSubscription(
      alvo.userId,
      { description: "Netflix", amount: cents(5_590), scheduleDay: 12, cardId: alvo.cartaoId },
      AGORA,
    );

    // Reajuste anual: o valor mudou, a assinatura é a mesma.
    await ingest(alvo.userId, [compra("NETFLIX", "62,90", "ev-reajuste")], AGORA);

    const fila = await buildCapturesView(alvo.userId, AGORA);
    assert.equal(fila.pending.length, 0);
  });

  it("compra comum continua indo para a fila", async () => {
    const { ingest, buildCapturesView } = await import("./captures.ts");
    const { createSubscription } = await import("./subscriptions.ts");
    const alvo = await ambiente();

    await createSubscription(
      alvo.userId,
      { description: "Netflix", amount: cents(5_590), scheduleDay: 12, cardId: alvo.cartaoId },
      AGORA,
    );

    await ingest(alvo.userId, [compra("PADARIA CENTRAL", "12,00", "ev-padaria")], AGORA);

    const fila = await buildCapturesView(alvo.userId, AGORA);
    assert.equal(fila.pending.length, 1, "o que não é assinatura precisa de revisão");
  });

  it("assinatura pausada não reconhece nada", async () => {
    const { ingest, buildCapturesView } = await import("./captures.ts");
    const { createSubscription } = await import("./subscriptions.ts");
    const { setRecurrenceActive } = await import("./recurrences.ts");
    const alvo = await ambiente();

    const id = await createSubscription(
      alvo.userId,
      { description: "Netflix", amount: cents(5_590), scheduleDay: 12, cardId: alvo.cartaoId },
      AGORA,
    );
    await setRecurrenceActive(alvo.userId, id, false, AGORA);

    await ingest(alvo.userId, [compra("NETFLIX.COM", "55,90", "ev-pausada")], AGORA);

    const fila = await buildCapturesView(alvo.userId, AGORA);
    assert.equal(fila.pending.length, 1, "assinatura cancelada volta a ser compra comum");
  });
});
