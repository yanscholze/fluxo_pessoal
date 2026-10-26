import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { cents } from "../../../core/kernel/money.ts";
import { localDate } from "../../../core/time/local-date.ts";
import { ambiente, zerar } from "../../testing/cenario.ts";
import { definirSegredo } from "../../testing/worker-env.ts";
import { cachedAnalysis, claimLease, releaseLease } from "../../repositories/ai.ts";
import { readNotifications, reconcileNotifications } from "../../repositories/notifications.ts";
import { saveIntegrationToken } from "../integration-credentials.ts";
import { recordTransaction } from "../transactions.ts";
import { buildFinancialIntelligence, type FinancialInsight } from "./financial-context.ts";
import { runFinancialAnalysis, runScheduledFinancialAnalyses, validateAnalysis } from "./analysis.ts";
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
  assert.equal(changed.state, "rules"); assert.equal(calls, 1); assert.ok(!changed.insights[0].body.includes("Compare"));
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
