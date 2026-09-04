/**
 * Isolamento entre usuários.
 *
 * A regra é "todo repositório recebe o `userId` e filtra por ele; não existe
 * consulta sem dono". É uma regra que se verifica lendo o código — e que se
 * quebra sem barulho: um `where` esquecido não derruba nada, não aparece em
 * nenhuma tela do dono, e só se manifesta como o dinheiro de outra pessoa
 * dentro do seu extrato.
 *
 * Estes testes montam dois usuários no mesmo banco e conferem que nenhum
 * alcança o outro — nem para ler, nem para escrever, nem para descobrir que
 * existe.
 */

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { cents } from "../../core/kernel/money.ts";
import { competence } from "../../core/time/competence.ts";
import { localDate } from "../../core/time/local-date.ts";
import { ambiente, zerar } from "../testing/cenario.ts";

const AGORA = new Date("2026-08-20T12:00:00Z");

/** Um segundo usuário completo, com conta, cartão e categoria próprios. */
async function outroUsuario() {
  const { signUp } = await import("./auth.ts");
  const { createAccount, createCard, createCategory } = await import("./catalog.ts");

  const { user } = await signUp({
    email: "outro@fluxo.app",
    password: "senha-do-outro-123",
    displayName: "Outra Pessoa",
  });

  const contaId = await createAccount(user.id, {
    name: "Conta do outro",
    kind: "checking",
    openingBalance: cents(999_999),
    openedOn: localDate("2026-01-01"),
  });

  const categoriaId = await createCategory(user.id, { name: "Outros", kind: "expense" });

  const cartaoId = await createCard(user.id, {
    name: "Cartão do outro",
    kind: "credit",
    paymentAccountId: contaId,
    closingDay: 13,
    dueDay: 20,
    limit: cents(500_000),
  });

  return { userId: user.id, contaId, cartaoId, categoriaId };
}

describe("isolamento entre usuários", () => {
  beforeEach(() => zerar());

  it("o extrato de um não mostra lançamento do outro", async () => {
    const { recordTransaction } = await import("./transactions.ts");
    const { listTransactions } = await import("../repositories/ledger.ts");
    const eu = await ambiente();
    const outro = await outroUsuario();

    await recordTransaction(
      outro.userId,
      {
        kind: "expense",
        description: "Compra do outro",
        amount: cents(50_000),
        occurredOn: localDate("2026-08-05"),
        accountId: outro.contaId,
        categoryId: outro.categoriaId,
        state: "confirmed",
      },
      AGORA,
    );

    const meus = await listTransactions(eu.userId, { limit: 100 });
    assert.equal(meus.length, 0, "o lançamento do outro não pode aparecer no meu extrato");
  });

  it("o saldo de um não soma a conta do outro", async () => {
    const { buildAccountsView } = await import("./accounts.ts");
    const eu = await ambiente(500_000);
    await outroUsuario();

    const view = await buildAccountsView(eu.userId, AGORA);

    assert.equal(view.accounts.length, 1, "só as minhas contas");
    assert.equal(view.accounts[0]?.balanceCents, 500_000);
  });

  it("não dá para pagar a fatura do cartão de outra pessoa", async () => {
    const { recordTransaction, payInvoice } = await import("./transactions.ts");
    const eu = await ambiente();
    const outro = await outroUsuario();

    await recordTransaction(
      outro.userId,
      {
        kind: "expense",
        description: "Compra do outro",
        amount: cents(20_000),
        occurredOn: localDate("2026-08-05"),
        cardId: outro.cartaoId,
        categoryId: outro.categoriaId,
        state: "confirmed",
      },
      AGORA,
    );

    await assert.rejects(
      () =>
        payInvoice(
          eu.userId,
          {
            cardId: outro.cartaoId,
            competence: competence("2026-08"),
            accountId: eu.contaId,
            paidOn: localDate("2026-08-20"),
          },
          AGORA,
        ),
      /Cartão/,
      "o cartão do outro precisa ser inalcançável, não apenas invisível",
    );
  });

  it("não dá para lançar despesa na conta de outra pessoa", async () => {
    const { recordTransaction } = await import("./transactions.ts");
    const eu = await ambiente();
    const outro = await outroUsuario();

    await assert.rejects(
      () =>
        recordTransaction(
          eu.userId,
          {
            kind: "expense",
            description: "Tentativa",
            amount: cents(10_000),
            occurredOn: localDate("2026-08-05"),
            accountId: outro.contaId,
            categoryId: eu.categoriaId,
            state: "confirmed",
          },
          AGORA,
        ),
      /Conta/,
    );
  });

  it("o painel de um não conta a fatura do outro", async () => {
    const { recordTransaction } = await import("./transactions.ts");
    const { buildDashboard } = await import("./dashboard.ts");
    const eu = await ambiente(500_000);
    const outro = await outroUsuario();

    await recordTransaction(
      outro.userId,
      {
        kind: "expense",
        description: "Compra grande do outro",
        amount: cents(300_000),
        occurredOn: localDate("2026-08-05"),
        cardId: outro.cartaoId,
        categoryId: outro.categoriaId,
        state: "confirmed",
      },
      AGORA,
    );

    const painel = await buildDashboard(eu.userId, AGORA);

    assert.equal(painel.freeToSpend.openInvoicesCents, 0, "a fatura do outro não é compromisso meu");
    assert.equal(painel.position.cardDebtCents, 0);
    assert.equal(painel.freeToSpend.amountCents, 500_000);
  });

  it("o lote de importação de um não é visível nem confirmável pelo outro", async () => {
    const { startImport, findBatch, commitBatch } = await import("./imports.ts");
    const eu = await ambiente();
    const outro = await outroUsuario();

    const lote = await startImport(
      outro.userId,
      {
        filename: "extrato.csv",
        content: "data,descricao,valor\n2026-08-03,Mercado,-120.50",
        accountId: outro.contaId,
      },
      AGORA,
    );

    assert.equal(await findBatch(eu.userId, lote.id), null, "o lote do outro não pode ser lido");
    await assert.rejects(() => commitBatch(eu.userId, lote.id, AGORA), /Lote de importação/);
  });
});
