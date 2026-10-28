/** Central persistente. As regras essenciais funcionam sem qualquer provedor de IA. */
import { accountBalance, invoiceTotals } from "../../core/domain/ledger/balance.ts";
import { scheduleFor } from "../../core/domain/card/invoice-cycle.ts";
import { occurrenceKey, occurrencesBetween } from "../../core/domain/recurrence/schedule.ts";
import { competenceOf } from "../../core/time/competence.ts";
import { addDays, daysBetween, localDate, todayIn } from "../../core/time/local-date.ts";
import { listAccounts, listCards } from "../repositories/catalog.ts";
import { loadLedger } from "../repositories/ledger.ts";
import { confirmedOccurrenceKeys, listRecurrences } from "../repositories/recurrences.ts";
import {
  findNotificationForUser, markNotificationsRead, notificationRuleDetails, readNotifications, reconcileNotifications,
  type NotificationCategory, type NotificationDraft, type NotificationRecord,
} from "../repositories/notifications.ts";
import { buildDashboard } from "./dashboard.ts";
import { withFinancialReadScope } from "./financial-read-scope.ts";
import { measureStage } from "../observability/request-metrics.ts";

export { findNotificationForUser, markNotificationsRead };

export type NotificationView = {
  readonly id: string; readonly key: string; readonly revision: number;
  readonly severity: "urgente" | "atencao" | "informativo";
  readonly category: NotificationCategory; readonly priority: number;
  readonly title: string; readonly body: string; readonly screen: string; readonly href: string; readonly askPrompt: string;
  readonly source: "rule" | "analysis"; readonly createdAt: string; readonly updatedAt: string;
  readonly readAt: string | null; readonly resolvedAt: string | null;
};

export type NotificationInsight = {
  readonly key: string; readonly category: NotificationCategory; readonly priority: number;
  readonly title: string; readonly body: string; readonly href: string; readonly question: string;
  readonly facts: Readonly<Record<string, unknown>>;
};

function view(row: NotificationRecord): NotificationView {
  return {
    id: row.id, key: `${row.eventKey}:v${row.revision}`, revision: row.revision,
    severity: row.priority >= 4 ? "urgente" : row.priority >= 2 ? "atencao" : "informativo",
    category: row.category, priority: row.priority, title: row.title, body: row.body, screen: row.screen,
    href: row.href, askPrompt: row.askPrompt, source: row.source,
    createdAt: row.createdAt, updatedAt: row.updatedAt, readAt: row.readAt, resolvedAt: row.resolvedAt,
  };
}

function screenFor(href: string): string {
  if (href.startsWith("/cartoes")) return "cartoes";
  if (href.includes("parcelamentos")) return "parcelamentos";
  if (href.startsWith("/planejamento")) return "recorrencias";
  if (href.startsWith("/automaticos")) return "capturas";
  if (href.startsWith("/patrimonio")) return "saude";
  return "painel";
}

export async function syncNotificationInsights(userId: string, insights: readonly NotificationInsight[], now = new Date()): Promise<void> {
  // O motor de contexto também explica vencimentos. A central já possui o documento
  // acionável: só publica análises adicionais, evitando avisar duas vezes a mesma dívida.
  const useful = insights.filter((item) => !/^(?:free-negative-|overdue-|due-week)/u.test(item.key)).slice(0, 3);
  await reconcileNotifications(userId, "analysis", useful.map((item) => ({
    ...item, key: `analysis:${item.key}`, screen: screenFor(item.href), askPrompt: item.question,
  })), now);
}

function brl(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function dueLabel(days: number): string {
  return days < 0 ? `está ${Math.abs(days)} dia(s) em atraso` : days === 0 ? "vence hoje" : days === 1 ? "vence amanhã" : `vence em ${days} dias`;
}
function duePriority(days: number, insufficient = false): { category: NotificationCategory; priority: number } {
  if (days < 0 || days <= 1 && insufficient) return { category: "critical", priority: 5 };
  if (days <= 1) return { category: "critical", priority: 4 };
  if (days <= 3) return { category: "attention", priority: 3 };
  return { category: "reminder", priority: 2 };
}

export async function syncEssentialNotifications(userId: string, now = new Date()): Promise<void> {
  return measureStage("notifications", () => withFinancialReadScope(async () => {
    const today = todayIn(now);
    const horizon = addDays(today, 7);
    const [accounts, cards, entries, rules, confirmed, details, dashboard] = await Promise.all([
      listAccounts(userId), listCards(userId), loadLedger(userId), listRecurrences(userId, true),
      confirmedOccurrenceKeys(userId), notificationRuleDetails(userId, horizon), buildDashboard(userId, now, { financialOnly: true }),
    ]);
    const drafts: NotificationDraft[] = [];
    const accountsById = new Map(accounts.map((account) => [account.id, account]));
    const dueByInvoice = new Map(details.invoiceDates.map((item) => [`${item.cardId}:${item.competence}`, item.dueDate]));
    for (const card of cards.filter((item) => item.kind === "credit")) {
      const cardEntries = entries.filter((item) => item.party.kind === "card" && item.party.cardId === card.id);
      const competences = new Set(cardEntries.map((item) => item.competence));
      const account = accountsById.get(card.paymentAccountId);
      const available = account && account.currency === "BRL" && account.kind !== "benefit"
        ? accountBalance(entries, account.id, today, account.openingBalance) : null;
      for (const competence of competences) {
        const amountCents = invoiceTotals(cardEntries, card.id, competence).outstanding;
        if (amountCents <= 0) continue;
        const dueDate = localDate(dueByInvoice.get(`${card.id}:${competence}`) ?? scheduleFor(card, competence).dueDate);
        const days = daysBetween(today, dueDate);
        if (days > 7) continue;
        const insufficient = available !== null && available < amountCents;
        const href = `/cartoes?cartao=${encodeURIComponent(card.id)}&fatura=${competence}`;
        drafts.push({
          key: `invoice:${card.id}:${competence}`, ...duePriority(days, insufficient),
          title: `Fatura ${card.name} ${dueLabel(days)}`,
          body: `${brl(amountCents)} em aberto.${insufficient ? ` Saldo atual da conta de pagamento: ${brl(available!)}; entradas futuras não estão incluídas nesse saldo.` : ""}`,
          screen: "faturas", href, askPrompt: "Explique como esta fatura afeta meu ciclo e quais compromissos preciso priorizar.",
          facts: { cardId: card.id, competence, dueDate, amountCents, paymentAccountBalanceCents: available },
        });
      }
    }
    // Previsões em conta são avisadas individualmente. Parcelas no cartão já estão
    // dentro da fatura, e não viram um segundo alerta sobre o mesmo pagamento.
    const coveredRecurrences = new Set<string>();
    for (const item of details.planned.filter((item) => item.accountId)) {
      const days = daysBetween(today, localDate(item.date));
      if (item.recurrenceId) coveredRecurrences.add(occurrenceKey(item.recurrenceId, competenceOf(localDate(item.date))));
      drafts.push({
        key: item.recurrenceId ? `scheduled:${occurrenceKey(item.recurrenceId, competenceOf(localDate(item.date)))}` : `scheduled:${item.id}`,
        ...duePriority(days), title: `${item.description} ${dueLabel(days)}`,
        body: `${brl(item.amountCents)} previsto(s). Confira se já aconteceu e vincule o lançamento existente ao dar baixa.`,
        screen: "recorrencias", href: "/planejamento?aba=recorrencias", askPrompt: "Como este compromisso afeta minha margem e os próximos vencimentos?",
        facts: { transactionId: item.id, dueDate: item.date, amountCents: item.amountCents },
      });
    }
    for (const rule of rules.filter((item) => item.kind === "expense" && item.accountId)) {
      // A própria tela de Compromissos considera pendente a competência corrente.
      // O próximo mês entra quando a janela de sete dias o alcança.
      for (const occurrence of occurrencesBetween(rule, competenceOf(today), competenceOf(horizon))) {
        const key = occurrenceKey(rule.id, occurrence.competence);
        if (confirmed.has(key) || coveredRecurrences.has(key) || occurrence.date > horizon) continue;
        const days = daysBetween(today, occurrence.date);
        drafts.push({
          key: `scheduled:${key}`, ...duePriority(days), title: `${rule.description} ${dueLabel(days)}`,
          body: `${brl(occurrence.amount)} previsto(s). A baixa pode ser vinculada a um lançamento que já existe.`,
          screen: "recorrencias", href: "/planejamento?aba=recorrencias", askPrompt: "Explique este compromisso e como organizar o dinheiro para pagá-lo sem duplicar lançamentos.",
          facts: { recurrenceId: rule.id, competence: occurrence.competence, dueDate: occurrence.date, amountCents: occurrence.amount },
        });
      }
    }
    if (details.pendingCaptures && details.oldestCaptureId) drafts.push({
      key: `captures:${details.oldestCaptureId}`, category: "reminder", priority: 2,
      title: `${details.pendingCaptures} captura(s) aguardando revisão`,
      body: "Confira as sugestões antes de transformá-las em lançamentos. Nenhum valor pendente foi lançado automaticamente.",
      screen: "capturas", href: "/automaticos", askPrompt: "Como revisar capturas e evitar duplicar compromissos já registrados?",
      facts: { pendingCaptures: details.pendingCaptures },
    });
    if (dashboard.freeToSpend.amountCents < 0) drafts.push({
      key: `cash-shortfall:${dashboard.freeToSpend.windowStart}:${dashboard.freeToSpend.windowEnd}`,
      category: "critical", priority: 5, title: "Os compromissos superam o dinheiro previsto no ciclo",
      body: `Faltam ${brl(-dashboard.freeToSpend.amountCents)} segundo o Livre para gastar. Confira faturas, entradas e saídas previstas antes de assumir outro gasto.`,
      screen: "painel", href: "/painel", askPrompt: "Explique quais compromissos fazem meu Livre para gastar ficar negativo e quais vencimentos exigem atenção primeiro.",
      facts: { freeToSpendCents: dashboard.freeToSpend.amountCents, windowStart: dashboard.freeToSpend.windowStart, windowEnd: dashboard.freeToSpend.windowEnd },
    });
    await reconcileNotifications(userId, "rule", drafts, now);
  }));
}

export async function buildNotificationsView(userId: string, now = new Date()) {
  return measureStage("notifications", async () => {
    // GET/PATCH só apresentam documentos persistidos. Reconciliar vencimentos ou
    // reconstruir o contexto aqui cobraria esse custo em cada polling e navegação.
    // Alterações financeiras marcam a revisão; o agendador atualiza separadamente.
    const { rows, unreadCount } = await readNotifications(userId);
    return { today: todayIn(now), alerts: rows.filter((row) => !row.resolvedAt).map(view),
      history: rows.filter((row) => row.resolvedAt).map(view), unreadCount, analysisUnavailable: false };
  });
}
