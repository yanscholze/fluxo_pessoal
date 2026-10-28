import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { cents } from "../../../core/kernel/money.ts";
import { localDate } from "../../../core/time/local-date.ts";
import { ambiente, zerar } from "../../testing/cenario.ts";
import { definirSegredo } from "../../testing/worker-env.ts";
import { cachedAnalysis, cachedAnalysisView, claimLease, releaseLease, financialRevision } from "../../repositories/ai.ts";
import { readNotifications, reconcileNotifications } from "../../repositories/notifications.ts";
import { saveIntegrationToken } from "../integration-credentials.ts";
import { recordTransaction } from "../transactions.ts";
import { buildFinancialIntelligence, type FinancialInsight } from "./financial-context.ts";
import { runFinancialAnalysis, runScheduledFinancialAnalyses, validateAnalysis, readFinancialAnalysis, automaticAnalysisInput, analysisFingerprint } from "./analysis.ts";
import { quotaStatus } from "./quota.ts";
import { buildAssistantState } from "./assistant-state.ts";
import { askCoach } from "./coach.ts";

const NOW = new Date("2026-10-24T12:00:00Z");
const originalFetch = globalThis.fetch;
beforeEach(() => { zerar(); definirSegredo("INTEGRATION_ENCRYPTION_KEY", btoa("0123456789abcdef0123456789abcdef")); definirSegredo("GEMINI_API_KEY", undefined); definirSegredo("GEMINI_USER_ID", undefined); });
afterEach(() => { globalThis.fetch = originalFetch; });
async function scenario() {
  const user = await ambiente();
  await recordTransaction(user.userId, { kind: "expense", state: "confirmed", description: "Despesa privada", amount: cents(10_000), accountId: user.contaId, categoryId: user.categoriaId, occurredOn: localDate("2026-10-20") }, NOW);
  return user;
}

test("análise sem chave gera insights e notificações úteis sem rede", async () => {
  const user = await scenario(); let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("rede proibida"); };
  const state = await runFinancialAnalysis(user.userId, NOW, { allowProvider: true });
  assert.equal(state.state, "fallback"); assert.ok(state.insights.length);
  assert.equal((await readNotifications(user.userId)).unreadCount, 1); assert.equal(calls, 0);
  assert.equal((await quotaStatus(user.userId, "analysis", NOW)).used, 0);
});

test("cache por conta/fingerprint e backoff evitam chamadas em refresh e alterações consecutivas", async () => {
  const user = await scenario(); await saveIntegrationToken(user.userId, "gemini", "test-secret"); let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    const text = JSON.parse(String(init?.body)).contents[0].parts[0].text;
    assert.ok(!text.includes("Despesa privada")); assert.ok(!text.includes("test-secret"));
    const data = JSON.parse(text);
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ insights: [{ key: data.evidence[0].key, explanation: "Compare essa categoria com o seu planejamento antes de assumir novos compromissos." }] }) }] } }] });
  };
  const first = await runFinancialAnalysis(user.userId, NOW, { allowProvider: true });
  assert.equal(first.state, "ready"); assert.match(first.insights[0].body, /Compare/);
  const second = await runFinancialAnalysis(user.userId, new Date(NOW.getTime() + 1000), { allowProvider: true });
  assert.equal(second.state, "ready"); assert.equal(calls, 1);
  const dto = await buildAssistantState(user.userId, {}, NOW);
  assert.match(dto.insights[0].body, /Compare/); assert.equal(calls, 1);
  await recordTransaction(user.userId, { kind: "expense", state: "confirmed", description: "Nova compra", amount: cents(5_000), accountId: user.contaId, categoryId: user.categoriaId, occurredOn: localDate("2026-10-24") }, NOW);
  const changed = await runFinancialAnalysis(user.userId, new Date(NOW.getTime() + 2000), { allowProvider: true });
  assert.equal(changed.state, "ready"); assert.equal(calls, 2); assert.match(changed.insights[0].body, /Compare/);
  await runFinancialAnalysis(user.userId, new Date(NOW.getTime() + 7 * 3600_000), { allowProvider: true });
  assert.equal(calls, 2); assert.equal((await quotaStatus(user.userId, "advice", NOW)).used, 0);
});

test("falha de provedor/JSON/evidência cai para fatos sem remover avisos essenciais", async () => {
  const user = await scenario(); await saveIntegrationToken(user.userId, "gemini", "test-secret");
  globalThis.fetch = async () => { throw new Error("test timeout"); };
  const first = await runFinancialAnalysis(user.userId, NOW, { allowProvider: true });
  assert.equal(first.state, "fallback"); assert.equal((await cachedAnalysis(user.userId))?.state, "fallback");
  const raw = await buildFinancialIntelligence(user.userId, NOW);
  assert.deepEqual(first.insights, raw.insights);
  const facts: FinancialInsight[] = raw.insights;
  for (const invalid of [null, { insights: [{ key: facts[0].key, explanation: "Poupe R$ 99999" }] }, { insights: [{ key: "evento-inventado", explanation: "Faça isso" }] }, { insights: [{ key: facts[0].key, explanation: "Veja https://evil.test" }] }]) assert.throws(() => validateAnalysis(invalid, facts));
});

test("lease compartilhado impede análises simultâneas e é liberado ao concluir", async () => {
  const user = await scenario(); const lease = await claimLease(user.userId, "analysis", NOW);
  assert.ok(lease); assert.equal(await claimLease(user.userId, "analysis", NOW), null);
  const result = await runFinancialAnalysis(user.userId, NOW, { allowProvider: true }); assert.equal(result.state, "rules");
  await releaseLease(lease!); assert.ok(await claimLease(user.userId, "analysis", NOW));
});

test("notificação preenche contexto do chat, não marca leitura só por abrir e não expõe IDs no modelo", async () => {
  const user = await scenario();
  await reconcileNotifications(user.userId, "rule", [{ key: "event-test", category: "attention", priority: 3, title: "Fatura próxima", body: "Uma fatura pede atenção.", screen: "faturas", href: "/cartoes", askPrompt: "Como minha fatura afeta o mês?", facts: { amountCents: 10_000 } }], NOW);
  const notification = (await readNotifications(user.userId)).rows[0];
  const state = await buildAssistantState(user.userId, { notificationId: notification.id }, NOW);
  assert.equal(state.notificationPrompt, "Como minha fatura afeta o mês?");
  assert.equal((await readNotifications(user.userId)).rows.find((r) => r.id === notification.id)?.readAt, null);
  await saveIntegrationToken(user.userId, "gemini", "test-secret");
  globalThis.fetch = async (_url, init) => {
    const data = JSON.parse(String(init?.body)); const text = data.contents.at(-1).parts[0].text;
    assert.match(text, /Fatura próxima/); assert.ok(!text.includes(notification.id));
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ answer: "Confira a fatura.", summary: "Vencimento", actions: [], warnings: [] }) }] } }] });
  };
  await askCoach(user.userId, { question: state.notificationPrompt!, notificationId: notification.id }, NOW);
});

test("execução agendada funciona com regras mesmo sem Gemini e sem criar lançamentos", async () => {
  const user = await scenario(); globalThis.fetch = async () => { throw new Error("Não chamar sem chave"); };
  const result = await runScheduledFinancialAnalyses(NOW);
  assert.equal(result.processed, 1); assert.equal(result.failed, 0);
  assert.equal((await cachedAnalysis(user.userId))?.state, "fallback");
});


function explainFirst(init?: RequestInit): Response {
  const payload = JSON.parse(JSON.parse(String(init?.body)).contents.at(-1).parts[0].text);
  return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ insights: [{ key: payload.evidence[0].key, explanation: "Compare essa categoria com seu planejamento antes de assumir compromissos." }] }) }] } }] });
}

test("GET de análise e assistente lê somente persistência: nenhuma construção financeira, escrita ou chamada externa", async () => {
  const user = await scenario(); let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("rede indisponível"); };
  const revision = await financialRevision(user.userId);
  for (let attempt = 0; attempt < 4; attempt++) {
    const view = await readFinancialAnalysis(user.userId, NOW);
    assert.equal(view.status, "empty"); assert.deepEqual(view.insights, []);
    const assistant = await buildAssistantState(user.userId, {}, NOW);
    assert.deepEqual(assistant.insights, []);
  }
  assert.equal(calls, 0); assert.equal(await cachedAnalysis(user.userId), null);
  assert.equal(await financialRevision(user.userId), revision);
});

test("insight persistido aparece em múltiplos GET com três queries leves e sem Gemini", async () => {
  const { withRequestMetrics, metricsSnapshot } = await import("../../observability/request-metrics.ts");
  const user = await scenario(); await saveIntegrationToken(user.userId, "gemini", "test-secret"); let calls = 0;
  globalThis.fetch = async (_url, init) => { calls++; return explainFirst(init); };
  const first = await runFinancialAnalysis(user.userId, NOW, { allowProvider: true });
  assert.equal(first.state, "ready"); assert.equal(first.provider, "gemini"); assert.match(first.model!, /gemini/);
  assert.ok((await cachedAnalysis(user.userId))?.contextJson);
  assert.equal(Object.hasOwn((await cachedAnalysisView(user.userId))!, "contextJson"), false);
  await withRequestMetrics(async () => {
    for (let count = 0; count < 5; count++) assert.deepEqual((await readFinancialAnalysis(user.userId, NOW)).insights, first.insights);
    assert.equal(metricsSnapshot()!.queries, 15); assert.equal(metricsSnapshot()!.stages.financial_context, undefined);
  });
  assert.equal(calls, 1);
});

test("hash semântico ignora passagem do dia e ready não expira por TTL", async () => {
  const user = await scenario(); await saveIntegrationToken(user.userId, "gemini", "test-secret"); let calls = 0;
  globalThis.fetch = async (_url, init) => { calls++; return explainFirst(init); };
  const first = await runFinancialAnalysis(user.userId, NOW, { allowProvider: true });
  const later = new Date(NOW.getTime() + 24 * 3600_000);
  assert.equal((await readFinancialAnalysis(user.userId, later)).stale, true);
  const next = await runFinancialAnalysis(user.userId, later, { allowProvider: true });
  assert.equal(next.stale, false); assert.equal(next.generatedAt, first.generatedAt); assert.equal(calls, 1);
  const intelligence = await buildFinancialIntelligence(user.userId, NOW);
  const payload = automaticAnalysisInput(intelligence);
  const withoutClock = automaticAnalysisInput({ ...intelligence, context: { ...intelligence.context, asOf: "2099-01-01" } });
  assert.equal(await analysisFingerprint(payload), await analysisFingerprint(withoutClock));
  assert.ok(!JSON.stringify(payload).includes("scope")); assert.ok(!JSON.stringify(payload).includes("Despesa privada"));
});

test("mudança marca stale sem apagar último insight; falha mantém output e backoff impede spam", async () => {
  const user = await scenario(); await saveIntegrationToken(user.userId, "gemini", "test-secret"); let calls = 0;
  globalThis.fetch = async (_url, init) => { calls++; return explainFirst(init); };
  const first = await runFinancialAnalysis(user.userId, NOW, { allowProvider: true });
  await recordTransaction(user.userId, { kind: "expense", state: "confirmed", description: "Compra nova", amount: cents(2500), accountId: user.contaId, categoryId: user.categoriaId, occurredOn: localDate("2026-10-24") }, NOW);
  const stale = await readFinancialAnalysis(user.userId, NOW);
  assert.equal(stale.status, "stale"); assert.deepEqual(stale.insights, first.insights); assert.equal(calls, 1);
  const log: unknown[] = []; const originalInfo = console.info;
  console.info = (...args) => { log.push(args); };
  globalThis.fetch = async () => { calls++; throw new Error("test-secret provider private payload"); };
  try {
    const failed = await runFinancialAnalysis(user.userId, NOW, { allowProvider: true });
    assert.equal(failed.status, "error"); assert.equal(failed.stale, true); assert.deepEqual(failed.insights, first.insights);
    assert.equal(failed.generatedAt, first.generatedAt); assert.equal(failed.lastError, "provider_unavailable");
    await runFinancialAnalysis(user.userId, new Date(NOW.getTime() + 1000), { allowProvider: true });
    assert.equal(calls, 2); assert.ok(!JSON.stringify(failed).includes("test-secret")); assert.ok(!JSON.stringify(log).includes("test-secret"));
  } finally { console.info = originalInfo; }
});

test("duas requisições concorrentes compartilham lease antes de construir contexto", async () => {
  const user = await scenario(); await saveIntegrationToken(user.userId, "gemini", "test-secret");
  let resolve!: (response: Response) => void, entered!: () => void; let calls = 0; let captured: RequestInit | undefined;
  const started = new Promise<void>((done) => { entered = done; });
  globalThis.fetch = async (_url, init) => { calls++; captured = init; entered(); return new Promise<Response>((done) => { resolve = done; }); };
  const first = runFinancialAnalysis(user.userId, NOW, { allowProvider: true });
  await started;
  const second = await runFinancialAnalysis(user.userId, NOW, { allowProvider: true });
  assert.equal(second.updating, true); assert.equal(calls, 1);
  resolve(explainFirst(captured));
  assert.equal((await first).state, "ready"); assert.equal((await readFinancialAnalysis(user.userId, NOW)).updating, false);
  assert.equal(calls, 1);
});

test("escrita financeira durante Gemini deixa snapshot stale e impede publicação de fatos já desatualizados", async () => {
  const user = await scenario(); await saveIntegrationToken(user.userId, "gemini", "test-secret");
  globalThis.fetch = async (_url, init) => {
    await recordTransaction(user.userId, { kind: "expense", state: "confirmed", description: "Compra concorrente", amount: cents(500), accountId: user.contaId, categoryId: user.categoriaId, occurredOn: localDate("2026-10-24") }, NOW);
    return explainFirst(init);
  };
  const view = await runFinancialAnalysis(user.userId, NOW, { allowProvider: true });
  assert.equal(view.stale, true); assert.equal(view.state, "ready");
  assert.equal((await readNotifications(user.userId)).rows.filter((row) => row.source === "analysis").length, 0);
});

test("cadastro de chave após fallback sem provedor libera análise manual imediatamente", async () => {
  const user = await scenario();
  const first = await runFinancialAnalysis(user.userId, NOW, { allowProvider: true });
  assert.equal(first.lastError, "provider_not_configured");
  await saveIntegrationToken(user.userId, "gemini", "test-secret"); let calls = 0;
  globalThis.fetch = async (_url, init) => { calls++; return explainFirst(init); };
  const ready = await runFinancialAnalysis(user.userId, NOW, { allowProvider: true });
  assert.equal(ready.state, "ready"); assert.equal(ready.lastError, null); assert.equal(calls, 1);
});

test("gatilhos de revisão cobrem exclusões sem bloquear cascata da conta de usuário", async () => {
  const { getDatabase } = await import("../../db/client.ts"); const { users, transactions } = await import("../../db/schema/index.ts"); const { eq } = await import("drizzle-orm");
  const user = await scenario(); const before = await financialRevision(user.userId);
  await getDatabase().delete(transactions).where(eq(transactions.userId, user.userId));
  assert.ok(await financialRevision(user.userId) > before);
  await getDatabase().delete(users).where(eq(users.id, user.userId));
  assert.equal(await financialRevision(user.userId), 0);
});


test("alteração cosmética invalida revisão mas hash idêntico não consome nova chamada", async () => {
  const { updateAccount } = await import("../catalog.ts");
  const user = await scenario(); await saveIntegrationToken(user.userId, "gemini", "test-secret"); let calls = 0;
  globalThis.fetch = async (_url, init) => { calls++; return explainFirst(init); };
  const first = await runFinancialAnalysis(user.userId, NOW, { allowProvider: true });
  await updateAccount(user.userId, user.contaId, { color: "#ff00ff", name: "Conta renomeada" }, NOW);
  assert.equal((await readFinancialAnalysis(user.userId, NOW)).stale, true);
  const checked = await runFinancialAnalysis(user.userId, NOW, { allowProvider: true });
  assert.equal(checked.stale, false); assert.equal(checked.generatedAt, first.generatedAt); assert.equal(calls, 1);
});

test("cron alterna contas pelo último check e mantém isolamento de insights", async () => {
  const { signUp } = await import("../auth.ts");
  const first = await scenario();
  const { user: second } = await signUp({ email: "segunda-conta@fluxo.test", password: "senha-de-teste-123", displayName: "Outra pessoa" });
  globalThis.fetch = async () => { throw new Error("Nenhuma conta tem provedor"); };
  await runScheduledFinancialAnalyses(NOW);
  await runScheduledFinancialAnalyses(new Date(NOW.getTime() + 1000));
  assert.ok(await cachedAnalysis(first.userId)); assert.ok(await cachedAnalysis(second.id));
  assert.deepEqual((await readFinancialAnalysis(second.id, NOW)).insights, []);
});
