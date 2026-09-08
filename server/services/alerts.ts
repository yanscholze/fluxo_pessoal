/**
 * Serviço de alertas.
 *
 * Junta o que o painel já apurou e entrega ao motor do domínio. A regra de o
 * que dizer, quando, e com que urgência mora em `core/domain/advice/alerts.ts`
 * — aqui só se colhe o estado.
 *
 * A separação não é cerimônia: as frases dos alertas precisam ser testáveis
 * sem banco, e a decisão de "isto merece interromper o usuário" é regra de
 * produto, não de infraestrutura.
 */

import { type Alert, type AlertInput, buildAlerts } from "../../core/domain/advice/alerts.ts";
import type { LocalDate } from "../../core/time/local-date.ts";
import { buildDashboard } from "./dashboard.ts";
import { buildCapturesView } from "./captures.ts";

export type AlertsView = {
  readonly today: LocalDate;
  readonly alerts: readonly Alert[];
};

export async function buildAlertsView(userId: string, now: Date = new Date()): Promise<AlertsView> {
  const [painel, capturas] = await Promise.all([
    buildDashboard(userId, now),
    buildCapturesView(userId, now),
  ]);

  /*
   * A próxima fatura é a mais próxima entre todos os cartões, e não a do
   * cartão principal. Quem tem cinco cartões não quer saber qual vence
   * primeiro — quer saber que **alguma** vence amanhã.
   */
  const aVencer = painel.cards
    .flatMap((cartao) =>
      cartao.currentInvoice && !cartao.currentInvoice.isSettled
        ? [{ cardName: cartao.name, invoice: cartao.currentInvoice }]
        : [],
    )
    .sort((esquerda, direita) => esquerda.invoice.dueDate.localeCompare(direita.invoice.dueDate))[0];

  const vencidas = painel.cards.flatMap((cartao) => cartao.overdueInvoices);

  /*
   * "Entrou hoje" é a soma das receitas do dia, não a maior delas. Quem recebe
   * salário e adiantamento no mesmo dia recebeu os dois — e é o total que
   * decide o que dá para gastar.
   */
  const recebidoHoje = painel.recentTransactions.filter(
    (linha) => linha.kind === "income" && linha.occurredOn === painel.today,
  );
  const totalRecebidoHoje = recebidoHoje.reduce((soma, linha) => soma + linha.amountCents, 0);

  const entrada: AlertInput = {
    today: painel.today,
    pendingCaptures: capturas.pending.length,
    freeToSpendCents: painel.freeToSpend.amountCents,
    incomeThisMonthCents: painel.monthFlow.incomeCents,
    committedCents: painel.position.committedCents,
    overdueInvoices: vencidas.length,
    overdueInvoiceCents: vencidas.reduce((soma, fatura) => soma + fatura.outstandingCents, 0),
    nextInvoice: aVencer
      ? {
          cardName: aVencer.cardName,
          dueDate: aVencer.invoice.dueDate,
          amountCents: aVencer.invoice.outstandingCents,
        }
      : null,
    incomeToday:
      recebidoHoje.length > 0
        ? {
            description:
              recebidoHoje.length === 1 ? recebidoHoje[0].description : `${recebidoHoje.length} entradas`,
            amountCents: totalRecebidoHoje,
          }
        : null,
  };

  return { today: painel.today, alerts: buildAlerts(entrada) };
}
