import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { cents } from "../../core/kernel/money.ts";
import { competence } from "../../core/time/competence.ts";
import { localDate } from "../../core/time/local-date.ts";
import { ambiente, zerar } from "../testing/cenario.ts";
import { findNotificationForUser, markNotificationsRead, readNotifications, reconcileNotifications, type NotificationDraft } from "../repositories/notifications.ts";
import { buildNotificationsView, syncEssentialNotifications, syncNotificationInsights } from "./notifications.ts";
import { createAccount, createCard } from "./catalog.ts";
import { recordTransaction } from "./transactions.ts";
import { createRecurrence, confirmOccurrence } from "./recurrences.ts";

const NOW = new Date("2026-09-14T12:00:00Z");
const at = (day: number) => new Date(`2026-09-${String(day).padStart(2, "0")}T12:00:00Z`);
function draft(extra: Partial<NotificationDraft> = {}): NotificationDraft {
  return { key: "invoice:card:2026-09", category: "reminder", priority: 2, title: "Fatura próxima", body: "R$ 100,00 em aberto.",
    screen: "faturas", href: "/cartoes", askPrompt: "Como essa fatura afeta meu ciclo?", facts: { amountCents: 10_000 }, ...extra };
}
async function purchase(userId: string, cardId: string, amount = 10_000) {
  return recordTransaction(userId, { kind: "expense", description: "Compra", amount: cents(amount), state: "confirmed", occurredOn: localDate("2026-09-08"), cardId }, NOW);
}

describe("central de notificações persistente", () => {
  beforeEach(zerar);

  it("consultar repetidamente não lê nem duplica a mesma notificação", async () => {
    const { userId } = await ambiente();
    await reconcileNotifications(userId, "rule", [draft()], NOW);
    const original = await readNotifications(userId);
    await reconcileNotifications(userId, "rule", [draft()], at(15));
    const repeated = await readNotifications(userId);
    assert.equal(repeated.rows.length, 1);
    assert.equal(repeated.rows[0].id, original.rows[0].id);
    assert.equal(repeated.rows[0].updatedAt, original.rows[0].updatedAt);
    assert.equal(repeated.rows[0].revision, 1);
    assert.equal(repeated.rows[0].readAt, null);
    assert.equal(repeated.unreadCount, 1);
  });

  it("a leitura explícita persiste mesmo se o texto ou valor mudarem", async () => {
    const { userId } = await ambiente();
    await reconcileNotifications(userId, "rule", [draft()], NOW);
    const initial = (await readNotifications(userId)).rows[0];
    await markNotificationsRead(userId, [initial.id], at(15));
    await reconcileNotifications(userId, "rule", [draft({ body: "R$ 120,00 em aberto.", facts: { amountCents: 12_000 } })], at(16));
    const result = await readNotifications(userId);
    assert.equal(result.rows[0].readAt, at(15).toISOString());
    assert.equal(result.rows[0].revision, 1);
    assert.equal(result.unreadCount, 0);
  });

  it("somente uma escalada de prioridade reabre a leitura e a revisão de entrega", async () => {
    const { userId } = await ambiente();
    await reconcileNotifications(userId, "rule", [draft()], NOW);
    const initial = (await readNotifications(userId)).rows[0];
    await markNotificationsRead(userId, [initial.id], at(15));
    await reconcileNotifications(userId, "rule", [draft({ category: "attention", priority: 3 })], at(17));
    let result = await readNotifications(userId);
    assert.equal(result.rows[0].id, initial.id);
    assert.equal(result.rows[0].readAt, null);
    assert.equal(result.rows[0].revision, 2);
    await markNotificationsRead(userId, [initial.id], at(17));
    await reconcileNotifications(userId, "rule", [draft({ category: "reminder", priority: 2 })], at(18));
    result = await readNotifications(userId);
    assert.ok(result.rows[0].readAt);
    assert.equal(result.rows[0].revision, 2);
  });

  it("análise antiga não sobrescreve nem reabre fatos reconciliados mais recentemente", async () => {
    const { userId } = await ambiente();
    await reconcileNotifications(userId, "rule", [draft({ category: "critical", priority: 5 })], at(14));
    const first = (await readNotifications(userId)).rows[0];
    await reconcileNotifications(userId, "rule", [draft({ title: "Saldo já regularizado" })], at(16));
    await markNotificationsRead(userId, [first.id], at(16));
    await reconcileNotifications(userId, "rule", [draft({ category: "critical", priority: 5 })], at(15));
    const current = await findNotificationForUser(userId, first.id);
    assert.equal(current?.title, "Saldo já regularizado");
    assert.equal(current?.priority, 2);
    assert.ok(current?.readAt);
  });

  it("resolver preserva o histórico e não entra na contagem de não lidas", async () => {
    const { userId } = await ambiente();
    await reconcileNotifications(userId, "rule", [draft()], NOW);
    const original = (await readNotifications(userId)).rows[0];
    await reconcileNotifications(userId, "rule", [], at(15));
    const result = await readNotifications(userId);
    assert.equal(result.rows[0].id, original.id);
    assert.equal(result.rows[0].resolvedAt, at(15).toISOString());
    assert.equal(result.rows[0].readAt, null, "resolver não simula uma leitura");
    assert.equal(result.unreadCount, 0);
    assert.equal((await findNotificationForUser(userId, original.id))?.title, original.title);
  });

  it("não permite consultar nem marcar a notificação de outra pessoa", async () => {
    const { userId } = await ambiente();
    const { signUp } = await import("./auth.ts");
    const { user } = await signUp({ email: "outra@fluxo.teste", password: "senha-segura-123", displayName: "Outra pessoa" });
    await reconcileNotifications(userId, "rule", [draft()], NOW);
    await reconcileNotifications(user.id, "rule", [draft()], NOW);
    const own = (await readNotifications(userId)).rows[0];
    assert.equal(await findNotificationForUser(user.id, own.id), null);
    await markNotificationsRead(user.id, [own.id], NOW);
    assert.equal((await findNotificationForUser(userId, own.id))?.readAt, null);
    assert.equal((await readNotifications(user.id)).rows.length, 1, "mesma chave pode existir para outro dono");
  });

  it("marcar todas lê somente as ativas do usuário", async () => {
    const { userId } = await ambiente();
    await reconcileNotifications(userId, "rule", [draft(), draft({ key: "outra" })], NOW);
    await reconcileNotifications(userId, "rule", [draft()], at(15));
    await markNotificationsRead(userId, "all", at(16));
    const result = await readNotifications(userId);
    assert.equal(result.unreadCount, 0);
    assert.ok(result.rows.find((row) => !row.resolvedAt)?.readAt);
    assert.equal(result.rows.find((row) => row.resolvedAt)?.readAt, null);
  });

  it("contador considera todas as ativas mesmo além das cem linhas exibidas", async () => {
    const { userId } = await ambiente();
    await reconcileNotifications(userId, "rule", Array.from({ length: 105 }, (_, index) => draft({ key: `invoice:${index}` })), NOW);
    const result = await readNotifications(userId);
    assert.equal(result.rows.length, 100);
    assert.equal(result.unreadCount, 105);
    await markNotificationsRead(userId, result.rows.slice(0, 80).map((row) => row.id), at(15));
    await markNotificationsRead(userId, result.rows.slice(80).map((row) => row.id), at(15));
    const nextPage = await readNotifications(userId);
    assert.equal(nextPage.unreadCount, 5);
    assert.equal(nextPage.rows.filter((row) => !row.readAt).length, 5, "avisos ainda não lidos não podem ficar escondidos atrás dos cem já lidos");
    await reconcileNotifications(userId, "rule", [], at(15));
    assert.equal((await readNotifications(userId)).unreadCount, 0);
  });

  it("duas faturas no mesmo vencimento mantêm identidades diferentes", async () => {
    const target = await ambiente();
    const second = await createCard(target.userId, { name: "Segundo cartão", kind: "credit", paymentAccountId: target.contaId,
      closingDay: 13, dueDay: 20, dueAdjustment: "next", limit: cents(200_000) });
    await purchase(target.userId, target.cartaoId);
    await purchase(target.userId, second, 15_000);
    await syncEssentialNotifications(target.userId, NOW);
    const rows = (await readNotifications(target.userId)).rows.filter((row) => row.eventKey.startsWith("invoice:"));
    assert.equal(rows.length, 2);
    assert.notEqual(rows[0].eventKey, rows[1].eventKey);
    assert.ok(rows.every((row) => row.category === "reminder"));
  });

  it("fatura fechada, ainda não vencida, não é tratada como atrasada", async () => {
    const target = await ambiente();
    await purchase(target.userId, target.cartaoId);
    await syncEssentialNotifications(target.userId, at(15));
    const row = (await readNotifications(target.userId)).rows.find((item) => item.eventKey.startsWith("invoice:"));
    assert.ok(row);
    assert.doesNotMatch(row.title, /atraso/u);
    assert.equal(row.category, "reminder");
  });

  it("a aproximação escala o mesmo documento sem spam diário", async () => {
    const target = await ambiente();
    await purchase(target.userId, target.cartaoId);
    await syncEssentialNotifications(target.userId, at(14));
    const first = (await readNotifications(target.userId)).rows.find((row) => row.eventKey.startsWith("invoice:"))!;
    await markNotificationsRead(target.userId, [first.id], at(14));
    await syncEssentialNotifications(target.userId, at(15));
    let current = (await readNotifications(target.userId)).rows.find((row) => row.id === first.id)!;
    assert.equal(current.revision, 1);
    assert.ok(current.readAt);
    // Vencimento nominal 20/09 cai no domingo e a regra existente ajusta para 21/09.
    await syncEssentialNotifications(target.userId, at(18));
    current = (await readNotifications(target.userId)).rows.find((row) => row.id === first.id)!;
    assert.equal(current.priority, 3);
    assert.equal(current.revision, 2);
    assert.equal(current.readAt, null);
    await syncEssentialNotifications(target.userId, at(20));
    current = (await readNotifications(target.userId)).rows.find((row) => row.id === first.id)!;
    assert.equal(current.priority, 4);
    assert.equal(current.revision, 3);
  });

  it("benefício não esconde saldo insuficiente para pagar fatura", async () => {
    const target = await ambiente(1_000);
    await createAccount(target.userId, { name: "V.A", kind: "benefit", openingBalance: cents(500_000), openedOn: localDate("2026-01-01") });
    await purchase(target.userId, target.cartaoId, 20_000);
    await syncEssentialNotifications(target.userId, at(20));
    const row = (await readNotifications(target.userId)).rows.find((item) => item.eventKey.startsWith("invoice:"))!;
    assert.equal(row.priority, 5);
    assert.match(row.body, /Saldo atual/u);
    assert.equal(JSON.parse(row.factsJson).paymentAccountBalanceCents, 1_000);
  });

  it("não perde compromissos além do limite visual da agenda", async () => {
    const target = await ambiente();
    for (let index = 0; index < 15; index++) await recordTransaction(target.userId, {
      kind: "expense", description: `Compromisso ${index}`, amount: cents(1_000), state: "planned",
      occurredOn: localDate("2026-09-15"), accountId: target.contaId,
    }, NOW);
    await syncEssentialNotifications(target.userId, NOW);
    const rows = (await readNotifications(target.userId)).rows.filter((row) => row.eventKey.startsWith("scheduled:"));
    assert.equal(rows.length, 15);
  });

  it("baixa de recorrência resolve o aviso, preservando o registro anterior", async () => {
    const target = await ambiente();
    const recurrence = await createRecurrence(target.userId, { kind: "expense", description: "Seguro", amount: cents(9_000),
      scheduleDay: 10, accountId: target.contaId, startsOn: localDate("2026-01-01") }, NOW);
    await syncEssentialNotifications(target.userId, NOW);
    const before = (await readNotifications(target.userId)).rows.find((row) => row.eventKey.includes(recurrence))!;
    assert.equal(before.priority, 5);
    await confirmOccurrence(target.userId, recurrence, competence("2026-09"), {}, NOW);
    await syncEssentialNotifications(target.userId, at(15));
    const after = await findNotificationForUser(target.userId, before.id);
    assert.ok(after?.resolvedAt);
  });

  it("análises são poucas e não repetem avisos objetivos de vencimento", async () => {
    const { userId } = await ambiente();
    await syncNotificationInsights(userId, [
      { key: "due-week", category: "attention", priority: 3, title: "Vence", body: "Aviso", href: "/cartoes", question: "Explique", facts: {} },
      ...Array.from({ length: 6 }, (_, index) => ({ key: `growth:${index}`, category: "insight" as const, priority: 1, title: "Gasto mudou", body: "R$ 100", href: "/relatorios", question: "Por quê?", facts: { amountCents: 10_000 } })),
    ], NOW);
    const rows = (await readNotifications(userId)).rows;
    assert.equal(rows.length, 3);
    assert.ok(rows.every((row) => row.source === "analysis" && row.category === "insight"));
  });

  it("risco do fluxo futuro permanece como análise distinta da fatura", async () => {
    const { userId } = await ambiente();
    await syncNotificationInsights(userId, [{ key: "future-shortfall-2026-10", category: "attention", priority: 4,
      title: "O fluxo projetado pede atenção", body: "A projeção de outubro fica negativa.", href: "/planejamento", question: "Por quê?", facts: { projectedBalanceCents: -50_000 } }], NOW);
    const rows = (await readNotifications(userId)).rows;
    assert.equal(rows[0].category, "attention");
    assert.equal(rows[0].source, "analysis");
  });

  it("leitura da central usa somente avisos persistidos sem recalcular ou alterar lançamentos", async () => {
    const target = await ambiente();
    await purchase(target.userId, target.cartaoId);
    assert.equal((await buildNotificationsView(target.userId, NOW)).alerts.length, 0, "abrir a central não gera novos documentos");
    await syncEssentialNotifications(target.userId, NOW);
    await syncNotificationInsights(target.userId, [{ key: "saved-insight", category: "insight", priority: 1,
      title: "Análise salva", body: "O último resultado permanece disponível.", href: "/relatorios", question: "Explique", facts: {} }], NOW);
    const saved = await readNotifications(target.userId);
    const { listTransactions, loadLedger } = await import("../repositories/ledger.ts");
    const transactions = await listTransactions(target.userId);
    const ledger = await loadLedger(target.userId);
    const previousFetch = globalThis.fetch;
    let requests = 0;
    globalThis.fetch = async () => { requests++; throw new Error("Provedor indisponível"); };
    try {
      const { withRequestMetrics, metricsSnapshot } = await import("../observability/request-metrics.ts");
      const { result, queries } = await withRequestMetrics(async () => {
        const result = await buildNotificationsView(target.userId, NOW);
        return { result, queries: metricsSnapshot()?.queries };
      });
      assert.equal(queries, 2, "apenas os documentos e a contagem de não lidas são consultados");
      const repeated = await buildNotificationsView(target.userId, at(25));
      assert.ok(result.alerts.some((item) => item.screen === "faturas"));
      assert.ok(result.alerts.some((item) => item.title === "Análise salva"));
      assert.equal(result.unreadCount, repeated.unreadCount);
      assert.deepEqual(result.alerts, repeated.alerts, "a passagem do tempo não reconcilia regras durante GET");
      assert.deepEqual(await readNotifications(target.userId), saved, "polling não reescreve nem resolve avisos");
      assert.ok(result.alerts.every((item) => item.readAt === null));
      assert.equal(requests, 0);
      assert.deepEqual(await listTransactions(target.userId), transactions);
      assert.deepEqual(await loadLedger(target.userId), ledger);
    } finally { globalThis.fetch = previousFetch; }
  });

  it("GET e PATCH preservam a central salva sem executar novamente o motor financeiro", async () => {
    const target = await ambiente();
    const { getDatabase } = await import("../db/client.ts");
    const { sql } = await import("drizzle-orm");
    const { migrationCount } = await import("../db/migrator.ts");
    // O cenário aplica SQL diretamente; a borda HTTP lê o diário de migrations.
    await getDatabase().run(sql`CREATE TABLE _migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
    for (let i = 0; i < migrationCount(); i++) await getDatabase().run(sql`INSERT INTO _migrations(id,name) VALUES (${i},'test')`);
    const { issueSession } = await import("../auth/session.ts");
    const { GET, PATCH } = await import("../../app/api/v1/alerts/route.ts");
    const session = await issueSession({ userId: target.userId, kind: "device" });
    await reconcileNotifications(target.userId, "rule", [draft()], NOW);
    const saved = (await readNotifications(target.userId)).rows[0];
    const headers = { authorization: `Bearer ${session.token}`, "content-type": "application/json" };
    const get = await GET(new Request("http://fluxo.test/api/v1/alerts", { headers }));
    assert.equal(get.status, 200);
    const initial = (await get.json()).data;
    assert.equal(initial.alerts[0].id, saved.id);
    assert.equal(initial.alerts[0].resolvedAt, null, "o motor resolveria este documento sintético se fosse executado na leitura");
    const response = await PATCH(new Request("http://fluxo.test/api/v1/alerts", { method: "PATCH", headers, body: JSON.stringify({ ids: [saved.id] }) }));
    assert.equal(response.status, 200);
    const updated = (await response.json()).data;
    assert.equal(updated.unreadCount, 0);
    assert.equal(updated.alerts[0].id, saved.id);
    assert.ok(updated.alerts[0].readAt);
    assert.equal(updated.alerts[0].resolvedAt, null);
    assert.equal((await readNotifications(target.userId)).rows[0].updatedAt, saved.updatedAt, "marcar leitura não regenera o documento");
  });
});
