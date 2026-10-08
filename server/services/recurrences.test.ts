/**
 * Recorrência: projetar, confirmar, não duplicar.
 *
 * A recorrência é a única regra do Fluxo que produz lançamento sem ninguém
 * pedir. Enquanto é projeção, ela vive só em memória — o painel a calcula a
 * cada leitura e nada é gravado. Quando o usuário confirma que aconteceu, ela
 * vira linha no banco e a projeção precisa **sumir**, ou o salário aparece
 * duas vezes: uma como fato e outra como previsão.
 *
 * A versão anterior gravava treze meses de previsão no banco como efeito
 * colateral de uma leitura, e editar a regra deixava as previsões velhas para
 * trás. Estes testes fixam o desenho novo.
 */

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { cents } from "../../core/kernel/money.ts";
import { competence } from "../../core/time/competence.ts";
import { localDate } from "../../core/time/local-date.ts";
import { ambiente, zerar } from "../testing/cenario.ts";

const AGORA = new Date("2026-08-20T12:00:00Z");

async function salarioMensal(userId: string, contaId: string, categoriaId: string) {
  const { createRecurrence } = await import("./recurrences.ts");
  return createRecurrence(
    userId,
    {
      kind: "income",
      role: "salary",
      description: "Salário",
      amount: cents(620_000),
      scheduleDay: 5,
      accountId: contaId,
      categoryId: categoriaId,
      startsOn: localDate("2026-01-01"),
    },
    AGORA,
  );
}

describe("recorrência", () => {
  beforeEach(() => zerar());

  it("projeta sem gravar nada no razão", async () => {
    const { listTransactions } = await import("../repositories/ledger.ts");
    const { buildDashboard } = await import("./dashboard.ts");
    const alvo = await ambiente();
    await salarioMensal(alvo.userId, alvo.contaId, alvo.categoriaId);

    const painel = await buildDashboard(alvo.userId, AGORA);
    const salarioProjetado = painel.upcoming.find((item) => item.description === "Salário");
    assert.ok(salarioProjetado, "a projeção precisa aparecer nos próximos compromissos");
    assert.equal(salarioProjetado.source, "recurrence", "a agenda precisa levar de volta à recorrência");

    const lancamentos = await listTransactions(alvo.userId, { limit: 100 });
    assert.equal(lancamentos.length, 0, "ler o painel não pode gravar previsão no banco");
  });

  it("confirmar cria o lançamento e move o saldo", async () => {
    const { confirmOccurrence } = await import("./recurrences.ts");
    const { buildAccountsView } = await import("./accounts.ts");
    const alvo = await ambiente(100_000);
    const regra = await salarioMensal(alvo.userId, alvo.contaId, alvo.categoriaId);

    const confirmada = await confirmOccurrence(alvo.userId, regra, competence("2026-08"), {}, AGORA);
    assert.equal(confirmada.amountCents, 620_000);
    assert.equal(confirmada.alreadyConfirmed, false);

    const view = await buildAccountsView(alvo.userId, AGORA);
    const conta = view.accounts.find((item) => item.id === alvo.contaId);
    assert.equal(conta?.balanceCents, 720_000, "o salário confirmado entra no saldo");
  });

  it("confirmar duas vezes não duplica o lançamento", async () => {
    const { confirmOccurrence } = await import("./recurrences.ts");
    const { listTransactions } = await import("../repositories/ledger.ts");
    const alvo = await ambiente(100_000);
    const regra = await salarioMensal(alvo.userId, alvo.contaId, alvo.categoriaId);

    const primeira = await confirmOccurrence(alvo.userId, regra, competence("2026-08"), {}, AGORA);
    const segunda = await confirmOccurrence(alvo.userId, regra, competence("2026-08"), {}, AGORA);

    assert.equal(segunda.alreadyConfirmed, true, "a segunda confirmação é reconhecida como repetida");
    assert.equal(segunda.transactionId, primeira.transactionId, "devolve o lançamento real, não um id inventado");

    const lancamentos = await listTransactions(alvo.userId, { limit: 100 });
    assert.equal(lancamentos.length, 1, "a competência confirmada tem um lançamento, não dois");
  });

  it("a ocorrência confirmada some da projeção", async () => {
    const { confirmOccurrence } = await import("./recurrences.ts");
    const { buildDashboard } = await import("./dashboard.ts");
    const alvo = await ambiente(100_000);
    const regra = await salarioMensal(alvo.userId, alvo.contaId, alvo.categoriaId);

    await confirmOccurrence(alvo.userId, regra, competence("2026-08"), {}, AGORA);
    const painel = await buildDashboard(alvo.userId, AGORA);

    const virtuaisDeAgosto = painel.upcoming.filter(
      (item) => item.description === "Salário" && item.transactionId.startsWith("virtual:"),
    );
    const dobrado = virtuaisDeAgosto.some((item) => item.transactionId.includes("2026-08"));

    assert.equal(dobrado, false, "salário confirmado não pode continuar projetado na mesma competência");
  });

  it("confirmar aceita um valor diferente do previsto", async () => {
    const { confirmOccurrence } = await import("./recurrences.ts");
    const alvo = await ambiente(100_000);
    const regra = await salarioMensal(alvo.userId, alvo.contaId, alvo.categoriaId);

    const confirmada = await confirmOccurrence(
      alvo.userId,
      regra,
      competence("2026-08"),
      { amount: cents(590_000) },
      AGORA,
    );

    assert.equal(confirmada.amountCents, 590_000, "o valor real manda sobre o previsto");
  });

  it("desativar a regra tira a projeção do painel", async () => {
    const { setRecurrenceActive } = await import("./recurrences.ts");
    const { buildDashboard } = await import("./dashboard.ts");
    const alvo = await ambiente();
    const regra = await salarioMensal(alvo.userId, alvo.contaId, alvo.categoriaId);

    await setRecurrenceActive(alvo.userId, regra, false, AGORA);
    const painel = await buildDashboard(alvo.userId, AGORA);

    assert.equal(
      painel.upcoming.some((item) => item.description === "Salário"),
      false,
      "regra desativada não projeta",
    );
  });

  it("mostra, edita e exclui uma recorrência de entrada", async () => {
    const { createCategory } = await import("./catalog.ts");
    const { buildPlanningView } = await import("./planning.ts");
    const { createRecurrence, removeRecurrence } = await import("./recurrences.ts");
    const { updateSubscription } = await import("./subscriptions.ts");
    const alvo = await ambiente();
    const categoriaDeEntrada = await createCategory(alvo.userId, {
      name: "Recebimentos recorrentes",
      kind: "income",
    });

    const regra = await createRecurrence(
      alvo.userId,
      {
        kind: "income",
        description: "Reembolso mensal",
        amount: cents(25_000),
        scheduleDay: 12,
        accountId: alvo.contaId,
        categoryId: categoriaDeEntrada,
        startsOn: localDate("2026-01-01"),
      },
      AGORA,
    );

    const criada = (await buildPlanningView(alvo.userId, AGORA)).recurrences.find(
      (item) => item.id === regra,
    );
    assert.equal(criada?.kind, "income");
    assert.equal(criada?.description, "Reembolso mensal");

    await updateSubscription(
      alvo.userId,
      regra,
      { description: "Reembolso ajustado", amount: cents(27_500) },
      AGORA,
    );
    const editada = (await buildPlanningView(alvo.userId, AGORA)).recurrences.find(
      (item) => item.id === regra,
    );
    assert.equal(editada?.description, "Reembolso ajustado");
    assert.equal(editada?.amountCents, 27_500);

    assert.equal(await removeRecurrence(alvo.userId, regra), true);
    assert.equal(
      (await buildPlanningView(alvo.userId, AGORA)).recurrences.some((item) => item.id === regra),
      false,
    );
  });

  it("recusa confirmar competência anterior à vigência", async () => {
    const { createRecurrence, confirmOccurrence } = await import("./recurrences.ts");
    const alvo = await ambiente();

    const regra = await createRecurrence(
      alvo.userId,
      {
        kind: "expense",
        description: "Aluguel",
        amount: cents(195_000),
        scheduleDay: 10,
        accountId: alvo.contaId,
        categoryId: alvo.categoriaId,
        startsOn: localDate("2026-06-01"),
      },
      AGORA,
    );

    await assert.rejects(
      () => confirmOccurrence(alvo.userId, regra, competence("2026-01"), {}, AGORA),
      /competência/i,
    );
  });

  it("vincula receita existente com valor real sem duplicar saldo, alterar o razão ou perder a deduplicação da importação", async () => {
    const { createAccount } = await import("./catalog.ts");
    const { recordTransaction } = await import("./transactions.ts");
    const { linkOccurrence, confirmOccurrence, occurrenceTransactions } = await import("./recurrences.ts");
    const { loadLedger, findTransaction, transactionSaveStatements, listTransactions } = await import("../repositories/ledger.ts");
    const { getDatabase } = await import("../db/client.ts");
    const { transactions } = await import("../db/schema/index.ts");
    const { eq } = await import("drizzle-orm");
    const { buildPlanningView } = await import("./planning.ts");
    const alvo = await ambiente();
    const regra = await salarioMensal(alvo.userId, alvo.contaId, alvo.categoriaId);
    const contaReal = await createAccount(alvo.userId, { name: "Conta do recebimento", kind: "savings", openingBalance: cents(0), openedOn: localDate("2026-01-01") });
    const { ids } = await recordTransaction(alvo.userId, { kind: "income", state: "confirmed", source: "import", description: "Depósito real",
      amount: cents(599_999), occurredOn: localDate("2026-08-06"), accountId: contaReal, notes: "Extrato original" }, AGORA);
    assert.equal((await occurrenceTransactions(alvo.userId, regra, competence("2026-08"), AGORA))[0]?.originName, "Conta do recebimento");
    const tx = (await findTransaction(alvo.userId, ids[0]))!;
    await getDatabase().batch(transactionSaveStatements(tx, { fingerprint: "ofx:deposito-original" }) as never);
    const ledgerAntes = await loadLedger(alvo.userId);
    const vinculada = await linkOccurrence(alvo.userId, regra, competence("2026-08"), ids[0], AGORA);
    assert.equal(vinculada.amountCents, 599_999);
    assert.deepEqual(await loadLedger(alvo.userId), ledgerAntes);
    assert.equal((await buildPlanningView(alvo.userId, AGORA)).recurrences.find((r) => r.id === regra)?.pending, null);
    const [linha] = await getDatabase().select().from(transactions).where(eq(transactions.id, ids[0]));
    assert.equal(linha.fingerprint, "ofx:deposito-original");
    assert.equal(linha.source, "import");
    assert.equal(linha.description, "Depósito real");
    assert.equal(linha.notes, "Extrato original");
    assert.equal(linha.originAccountId, contaReal);
    assert.equal(linha.version, 2);
    assert.equal((await linkOccurrence(alvo.userId, regra, competence("2026-08"), ids[0], AGORA)).alreadyConfirmed, true);
    assert.equal((await confirmOccurrence(alvo.userId, regra, competence("2026-08"), {}, AGORA)).transactionId, ids[0]);
    assert.equal((await listTransactions(alvo.userId)).length, 1);
  });

  it("vincula despesas no cartão e transferências sem novos efeitos financeiros", async () => {
    const { createAccount } = await import("./catalog.ts");
    const { createRecurrence, linkOccurrence } = await import("./recurrences.ts");
    const { recordTransaction } = await import("./transactions.ts");
    const { loadLedger } = await import("../repositories/ledger.ts");
    const { buildPlanningView } = await import("./planning.ts");
    const alvo = await ambiente();
    const destino = await createAccount(alvo.userId, { name: "Reserva", kind: "savings", openingBalance: cents(0), openedOn: localDate("2026-01-01") });
    for (const kind of ["expense", "transfer"] as const) {
      const origin = kind === "expense" ? { cardId: alvo.cartaoId } : { accountId: alvo.contaId, destinationAccountId: destino };
      const regra = await createRecurrence(alvo.userId, { kind, description: kind, amount: cents(10000), scheduleDay: 10, startsOn: localDate("2026-01-01"), ...origin }, AGORA);
      const { ids } = await recordTransaction(alvo.userId, { kind, state: "confirmed", description: "Já registrado", amount: cents(9500), occurredOn: localDate("2026-08-10"), ...origin }, AGORA);
      const antes = await loadLedger(alvo.userId);
      await linkOccurrence(alvo.userId, regra, competence("2026-08"), ids[0], AGORA);
      assert.deepEqual(await loadLedger(alvo.userId), antes);
      assert.equal((await buildPlanningView(alvo.userId, AGORA)).recurrences.find((r) => r.id === regra)?.pending, null);
    }
  });

  it("não oferece nem vincula previstos, excluídos, outra natureza ou outro usuário", async () => {
    const { createAccount } = await import("./catalog.ts");
    const { signUp } = await import("./auth.ts");
    const { occurrenceTransactions, linkOccurrence } = await import("./recurrences.ts");
    const { recordTransaction, removeTransaction } = await import("./transactions.ts");
    const alvo = await ambiente();
    const regra = await salarioMensal(alvo.userId, alvo.contaId, alvo.categoriaId);
    const { user } = await signUp({ email: "outro@teste.app", password: "senha-de-teste-123", displayName: "Outro" });
    const contaAlheia = await createAccount(user.id, { name: "Alheia", kind: "checking", openingBalance: cents(0), openedOn: localDate("2026-01-01") });
    for (const scenario of [
      { state: "planned" as const }, { kind: "expense" as const }, { userId: user.id, accountId: contaAlheia }, { deleted: true },
    ]) {
      const { ids } = await recordTransaction(scenario.userId ?? alvo.userId, { kind: "income", state: "confirmed", description: "Não disponível", amount: cents(620000),
        occurredOn: localDate("2026-08-05"), accountId: alvo.contaId, ...scenario }, AGORA);
      if (scenario.deleted) await removeTransaction(alvo.userId, ids[0]);
      await assert.rejects(() => linkOccurrence(alvo.userId, regra, competence("2026-08"), ids[0], AGORA), /disponível/);
    }
    assert.deepEqual(await occurrenceTransactions(alvo.userId, regra, competence("2026-08"), AGORA), []);
    await assert.rejects(() => occurrenceTransactions(user.id, regra, competence("2026-08"), AGORA), /Recorrência/);
  });

  it("um movimento não pode quitar duas ocorrências e uma ocorrência não pode receber dois movimentos", async () => {
    const { recordTransaction } = await import("./transactions.ts");
    const { linkOccurrence, occurrenceTransactions } = await import("./recurrences.ts");
    const alvo = await ambiente();
    const regra = await salarioMensal(alvo.userId, alvo.contaId, alvo.categoriaId);
    const criar = () => recordTransaction(alvo.userId, { kind: "income", state: "confirmed", description: "Recebido", amount: cents(620000), occurredOn: localDate("2026-08-05"), accountId: alvo.contaId }, AGORA);
    const a = await criar(), b = await criar();
    await linkOccurrence(alvo.userId, regra, competence("2026-08"), a.ids[0], AGORA);
    await assert.rejects(() => linkOccurrence(alvo.userId, regra, competence("2026-08"), b.ids[0], AGORA), /já está vinculada/);
    await assert.rejects(() => linkOccurrence(alvo.userId, regra, competence("2026-07"), a.ids[0], AGORA), /disponível/);
    assert.deepEqual((await occurrenceTransactions(alvo.userId, regra, competence("2026-07"), AGORA)).map((t) => t.id), b.ids);
  });

  it("editar mantém a baixa; excluir o fato devolve a previsão e permite vincular novamente", async () => {
    const { recordTransaction, removeTransaction } = await import("./transactions.ts");
    const { linkOccurrence } = await import("./recurrences.ts");
    const { buildPlanningView } = await import("./planning.ts");
    const alvo = await ambiente();
    const regra = await salarioMensal(alvo.userId, alvo.contaId, alvo.categoriaId);
    const criar = (id?: string) => recordTransaction(alvo.userId, { id, kind: "income", state: "confirmed", description: "Recebido", amount: cents(620000), occurredOn: localDate("2026-08-05"), accountId: alvo.contaId }, AGORA);
    const a = await criar();
    await linkOccurrence(alvo.userId, regra, competence("2026-08"), a.ids[0], AGORA);
    await criar(a.ids[0]);
    assert.equal((await buildPlanningView(alvo.userId, AGORA)).recurrences.find((r) => r.id === regra)?.pending, null);
    await removeTransaction(alvo.userId, a.ids[0]);
    assert.ok((await buildPlanningView(alvo.userId, AGORA)).recurrences.find((r) => r.id === regra)?.pending);
    const b = await criar();
    await linkOccurrence(alvo.userId, regra, competence("2026-08"), b.ids[0], AGORA);
    assert.equal((await buildPlanningView(alvo.userId, AGORA)).recurrences.find((r) => r.id === regra)?.pending, null);
  });
});
