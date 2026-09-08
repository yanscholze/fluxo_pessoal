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

import {
  type Alert,
  type AlertInput,
  type OpenInvoice,
  buildAlerts,
  classifyInvoices,
} from "../../core/domain/advice/alerts.ts";
import type { LocalDate } from "../../core/time/local-date.ts";
import { listTransactions } from "../repositories/ledger.ts";
import { buildDashboard } from "./dashboard.ts";
import { buildCapturesView } from "./captures.ts";

export type AlertsView = {
  readonly today: LocalDate;
  readonly alerts: readonly Alert[];
};

export async function buildAlertsView(userId: string, now: Date = new Date()): Promise<AlertsView> {
  const painel = await buildDashboard(userId, now);
  /*
   * As receitas de hoje vêm de uma consulta própria, e não de
   * `painel.recentTransactions`.
   *
   * Aquela lista tem teto de dez linhas e mistura tudo o que aconteceu. Num dia
   * de salário com meia dúzia de compras no cartão, a própria receita cai fora
   * das dez e o aviso que este produto existe para dar — "entrou o dinheiro, e
   * tanto dele já está comprometido" — simplesmente não nasceria. E falharia
   * exatamente nos dias movimentados, que são os que importam.
   */
  const [capturas, doDia] = await Promise.all([
    buildCapturesView(userId, now),
    listTransactions(userId, {
      from: painel.today,
      to: painel.today,
      states: ["confirmed"],
      limit: 100,
    }),
  ]);

  /*
   * Todas as faturas em aberto de todos os cartões, sem a classificação do
   * painel.
   *
   * A `currentInvoice` entra junto das que o painel chama de vencidas porque a
   * distinção que interessa aqui é outra — quem decide o que está atrasado é a
   * data de vencimento, e `classifyInvoices` faz esse corte. Juntar as duas
   * listas também é o que permite avisar da fatura de um cartão qualquer, e não
   * só do principal: quem tem cinco cartões quer saber que **alguma** vence
   * amanhã.
   */
  const emAberto: OpenInvoice[] = painel.cards.flatMap((cartao) => {
    const abertas = [
      ...cartao.overdueInvoices,
      ...(cartao.currentInvoice && !cartao.currentInvoice.isSettled ? [cartao.currentInvoice] : []),
    ];
    return abertas
      .filter((fatura) => fatura.outstandingCents > 0)
      .map((fatura) => ({
        cardName: cartao.name,
        dueDate: fatura.dueDate,
        amountCents: fatura.outstandingCents,
      }));
  });

  const faturas = classifyInvoices(emAberto, painel.today);

  /*
   * "Entrou hoje" é a soma das receitas do dia, não a maior delas. Quem recebe
   * salário e adiantamento no mesmo dia recebeu os dois — e é o total que
   * decide o que dá para gastar.
   */
  const recebidoHoje = doDia.filter((linha) => linha.kind === "income");
  const totalRecebidoHoje = recebidoHoje.reduce((soma, linha) => soma + linha.amount, 0);

  const entrada: AlertInput = {
    today: painel.today,
    pendingCaptures: capturas.pending.length,
    freeToSpendCents: painel.freeToSpend.amountCents,
    incomeThisMonthCents: painel.monthFlow.incomeCents,
    committedCents: painel.position.committedCents,
    overdueInvoices: faturas.overdue.length,
    overdueInvoiceCents: faturas.overdueCents,
    oldestOverdueDueDate:
      [...faturas.overdue].sort((esquerda, direita) =>
        esquerda.dueDate.localeCompare(direita.dueDate),
      )[0]?.dueDate ?? null,
    nextInvoice: faturas.next,
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
