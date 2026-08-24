/**
 * Saúde financeira.
 *
 * Um diagnóstico a partir dos dados reais, não um placar genérico. Cada sinal
 * aponta um número que está em outra tela do Fluxo — se discordasse, um dos
 * dois estaria errado e o usuário não teria como saber qual.
 */

import { isInvestment, liquidAccounts } from "../../core/domain/account/types.ts";
import { activeCompetence, dueDateFor } from "../../core/domain/card/invoice-cycle.ts";
import { CONSUMPTION, accountBalance, flow, invoiceTotals, overdueCompetences } from "../../core/domain/ledger/balance.ts";
import { computeFinancialPosition } from "../../core/domain/position/financial-position.ts";
import { projectRecurrences } from "../../core/domain/recurrence/projection.ts";
import type { Cents } from "../../core/kernel/money.ts";
import { type Competence, competenceOf, range, shift } from "../../core/time/competence.ts";
import { type LocalDate, addDays, todayIn } from "../../core/time/local-date.ts";
import { freeToSpendExclusions, listAccounts, listCards, listCategories } from "../repositories/catalog.ts";
import { loadLedger, transactionIndex } from "../repositories/ledger.ts";
import { confirmedOccurrenceKeys, listRecurrences } from "../repositories/recurrences.ts";

/** Quantos meses de gasto essencial uma reserva de emergência deve cobrir. */
const RESERVE_MONTHS = 6;
/** Janela usada para estimar o gasto essencial médio. */
const ESSENTIAL_WINDOW = 6;
const AGENDA_DAYS = 30;

export type HealthSignal = {
  readonly key: string;
  readonly title: string;
  readonly status: "bom" | "atencao" | "critico";
  readonly detail: string;
};

export type AgendaEvent = {
  readonly date: LocalDate;
  readonly description: string;
  readonly amountCents: number;
  readonly direction: "in" | "out";
  readonly kind: "recorrencia" | "fatura" | "parcela" | "previsto";
};

export type HealthView = {
  readonly today: LocalDate;
  readonly competence: Competence;
  readonly freeToSpendCents: number;
  readonly reserve: {
    readonly currentCents: number;
    readonly targetCents: number;
    readonly percent: number;
    readonly monthsCovered: number;
    readonly monthlyEssentialCents: number;
  };
  readonly savingsRatePercent: number;
  readonly commitment: {
    readonly monthlyIncomeCents: number;
    readonly committedCents: number;
    readonly percent: number;
  };
  readonly debts: {
    readonly cardDebtCents: number;
    readonly overdueInvoices: number;
    readonly openInstallmentsCents: number;
  };
  readonly netWorthCents: number;
  readonly signals: readonly HealthSignal[];
  readonly agenda: readonly AgendaEvent[];
};

export async function buildHealthView(userId: string, now: Date = new Date()): Promise<HealthView> {
  const today = todayIn(now);
  const competence = competenceOf(today);

  const [accounts, cards, categories, entries, index, excluded, rules, confirmedKeys] = await Promise.all([
    listAccounts(userId),
    listCards(userId),
    listCategories(userId),
    loadLedger(userId),
    transactionIndex(userId),
    freeToSpendExclusions(userId),
    listRecurrences(userId, true),
    confirmedOccurrenceKeys(userId),
  ]);

  const cycleByCard = new Map(cards.map((card) => [card.id, card]));
  const projecao = projectRecurrences({
    rules,
    from: competence,
    to: shift(competence, 2),
    confirmedKeys,
    cycleOf: (cardId) => cycleByCard.get(cardId) ?? null,
  });

  const todas = [...entries, ...projecao.entries];
  const position = computeFinancialPosition({
    accounts,
    cards,
    entries: todas,
    categoryByTransaction: new Map([
      ...[...index].map(([id, meta]) => [id, meta.categoryId] as const),
      ...projecao.categoryByTransaction,
    ]),
    today,
    policy: { excludedCategoryIds: excluded },
  });

  const reserve = computeReserve(accounts, entries, index, categories, competence, today);
  const savings = computeSavings(entries, accounts, competence);
  const debts = computeDebts(entries, cards, today);

  const commitmentPercent =
    savings.incomeCents > 0 ? (position.committed / savings.incomeCents) * 100 : 0;

  return {
    today,
    competence,
    freeToSpendCents: position.freeToSpend.amount,
    reserve,
    savingsRatePercent: savings.ratePercent,
    commitment: {
      monthlyIncomeCents: savings.incomeCents,
      committedCents: position.committed,
      percent: commitmentPercent,
    },
    debts,
    netWorthCents: position.netWorth,
    signals: buildSignals(position.freeToSpend.amount, reserve, savings.ratePercent, commitmentPercent, debts),
    agenda: buildAgenda(todas, index, cards, today),
  };
}

function computeReserve(
  accounts: Awaited<ReturnType<typeof listAccounts>>,
  entries: Awaited<ReturnType<typeof loadLedger>>,
  index: Awaited<ReturnType<typeof transactionIndex>>,
  categories: Awaited<ReturnType<typeof listCategories>>,
  competence: Competence,
  today: LocalDate,
): HealthView["reserve"] {
  // A reserva é o que está em conta de investimento ou poupança: o dinheiro da
  // conta corrente é o do mês, não a reserva.
  const reservado = accounts
    .filter((account) => isInvestment(account) && account.includeInTotals && account.currency === "BRL")
    .reduce((soma, account) => soma + accountBalance(entries, account.id, today, account.openingBalance), 0);

  const essenciais = new Set(
    categories.filter((category) => category.isEssential).map((category) => category.id),
  );

  // Média dos últimos meses. Sem categorias marcadas como essenciais não há
  // como estimar — melhor devolver zero e a tela pedir a marcação do que
  // inventar uma meta a partir do gasto total.
  const janela = range(shift(competence, -(ESSENTIAL_WINDOW - 1)), competence);
  let totalEssencial = 0;
  for (const entry of entries) {
    if (entry.state !== "confirmed" || entry.amount >= 0) continue;
    if (!janela.includes(entry.competence)) continue;
    const categoryId = index.get(entry.transactionId)?.categoryId;
    if (!categoryId || !essenciais.has(categoryId)) continue;
    totalEssencial -= entry.amount;
  }

  const mensal = janela.length ? Math.round(totalEssencial / janela.length) : 0;
  const alvo = mensal * RESERVE_MONTHS;

  return {
    currentCents: reservado,
    targetCents: alvo,
    percent: alvo > 0 ? Math.min(100, (reservado / alvo) * 100) : 0,
    monthsCovered: mensal > 0 ? reservado / mensal : 0,
    monthlyEssentialCents: mensal,
  };
}

function computeSavings(
  entries: Awaited<ReturnType<typeof loadLedger>>,
  accounts: Awaited<ReturnType<typeof listAccounts>>,
  competence: Competence,
): { incomeCents: number; expenseCents: number; ratePercent: number } {
  const accountIds = new Set(liquidAccounts(accounts).map((account) => account.id));
  const totais = flow(entries, { accountIds, competence, states: ["confirmed"], kinds: CONSUMPTION });

  return {
    incomeCents: totais.inflow,
    expenseCents: totais.outflow,
    ratePercent: totais.inflow > 0 ? ((totais.inflow - totais.outflow) / totais.inflow) * 100 : 0,
  };
}

function computeDebts(
  entries: Awaited<ReturnType<typeof loadLedger>>,
  cards: Awaited<ReturnType<typeof listCards>>,
  today: LocalDate,
): HealthView["debts"] {
  const credito = cards.filter((card) => card.kind === "credit");

  let divida = 0;
  let atrasadas = 0;
  let futuras = 0;

  for (const card of credito) {
    const ativa = activeCompetence(card, today);
    atrasadas += overdueCompetences(entries, card.id, ativa).length;

    for (const entry of entries) {
      if (entry.party.kind !== "card" || entry.party.cardId !== card.id) continue;
      divida -= entry.amount;
      // Comprometimento além da fatura ativa: parcelas que ainda vão chegar.
      if (entry.competence > ativa && entry.amount < 0) futuras -= entry.amount;
    }
  }

  return {
    cardDebtCents: Math.max(0, divida),
    overdueInvoices: atrasadas,
    openInstallmentsCents: futuras,
  };
}

/**
 * Sinais do diagnóstico.
 *
 * Cada um cita um número concreto. Um selo genérico de "saúde boa" não muda
 * decisão nenhuma; "sua reserva cobre 2,1 meses" muda.
 */
function buildSignals(
  freeToSpend: number,
  reserve: HealthView["reserve"],
  savingsRate: number,
  commitmentPercent: number,
  debts: HealthView["debts"],
): HealthSignal[] {
  const brl = (valor: number) =>
    (valor / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const sinais: HealthSignal[] = [];

  sinais.push({
    key: "livre",
    title: "Livre para gastar",
    status: freeToSpend < 0 ? "critico" : freeToSpend === 0 ? "atencao" : "bom",
    detail:
      freeToSpend < 0
        ? `Faltam ${brl(-freeToSpend)} para cobrir o que já está assumido neste ciclo.`
        : `Sobram ${brl(freeToSpend)} depois de honrar tudo que já está assumido.`,
  });

  if (reserve.monthlyEssentialCents > 0) {
    const meses = reserve.monthsCovered;
    // `toFixed` devolve ponto decimal; em texto português precisa ser vírgula.
    const formatado = meses.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
    sinais.push({
      key: "reserva",
      title: "Reserva de emergência",
      status: meses >= RESERVE_MONTHS ? "bom" : meses >= 3 ? "atencao" : "critico",
      detail: `Sua reserva cobre ${formatado} ${meses === 1 ? "mês" : "meses"} de gasto essencial. O alvo é ${RESERVE_MONTHS}.`,
    });
  } else {
    sinais.push({
      key: "reserva",
      title: "Reserva de emergência",
      status: "atencao",
      detail: "Marque categorias como essenciais para o Fluxo calcular quanto você precisa guardar.",
    });
  }

  sinais.push({
    key: "poupanca",
    title: "Taxa de poupança",
    status: savingsRate >= 20 ? "bom" : savingsRate >= 0 ? "atencao" : "critico",
    detail:
      savingsRate >= 0
        ? `Você guardou ${Math.round(savingsRate)}% do que entrou neste mês.`
        : `Você gastou ${Math.round(-savingsRate)}% a mais do que entrou neste mês.`,
  });

  if (commitmentPercent > 0) {
    sinais.push({
      key: "comprometimento",
      title: "Comprometimento da renda",
      status: commitmentPercent <= 50 ? "bom" : commitmentPercent <= 75 ? "atencao" : "critico",
      detail: `${Math.round(commitmentPercent)}% da renda do mês já tem destino.`,
    });
  }

  if (debts.overdueInvoices > 0) {
    sinais.push({
      key: "atraso",
      title: "Faturas em atraso",
      status: "critico",
      detail: `${debts.overdueInvoices} fatura${debts.overdueInvoices > 1 ? "s" : ""} venceu sem pagamento. Juros de cartão são os mais caros que existem.`,
    });
  }

  if (debts.openInstallmentsCents > 0) {
    sinais.push({
      key: "parcelas",
      title: "Parcelas a vencer",
      status: "atencao",
      detail: `${brl(debts.openInstallmentsCents)} em parcelas já comprometidas nos próximos meses.`,
    });
  }

  return sinais;
}

/** Os próximos trinta dias, em ordem. */
function buildAgenda(
  entries: Awaited<ReturnType<typeof loadLedger>>,
  index: Awaited<ReturnType<typeof transactionIndex>>,
  cards: Awaited<ReturnType<typeof listCards>>,
  today: LocalDate,
): AgendaEvent[] {
  const horizonte = addDays(today, AGENDA_DAYS);
  const eventos: AgendaEvent[] = [];

  for (const entry of entries) {
    if (entry.state !== "planned") continue;
    if (entry.party.kind !== "account") continue;
    if (entry.effectiveOn < today || entry.effectiveOn > horizonte) continue;

    eventos.push({
      date: entry.effectiveOn,
      description: index.get(entry.transactionId)?.description ?? "Lançamento previsto",
      amountCents: Math.abs(entry.amount),
      direction: entry.amount > 0 ? "in" : "out",
      kind: entry.transactionId.startsWith("virtual:") ? "recorrencia" : "previsto",
    });
  }

  // Vencimento de fatura é o compromisso mais pesado do mês e não aparece como
  // lançamento previsto — ele nasce do ciclo do cartão.
  for (const card of cards.filter((item) => item.kind === "credit")) {
    const ativa = activeCompetence(card, today);
    for (const competence of [...overdueCompetences(entries, card.id, ativa), ativa]) {
      const totals = invoiceTotals(entries, card.id, competence);
      if (totals.outstanding <= 0) continue;
      const vencimento = dueDateFor(card, competence);
      if (vencimento < today || vencimento > horizonte) continue;

      eventos.push({
        date: vencimento,
        description: `Fatura ${card.name}`,
        amountCents: totals.outstanding,
        direction: "out",
        kind: "fatura",
      });
    }
  }

  return eventos.sort((left, right) => left.date.localeCompare(right.date)).slice(0, 12);
}

export type { Cents };
