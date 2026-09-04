/**
 * Posição financeira — os cinco números que o Fluxo existe para responder.
 *
 * Patrimônio, saldo atual, comprometido, livre para gastar e fluxo futuro são
 * conceitos distintos e nunca podem se misturar. Esta é a única implementação
 * de cada um; dashboard, relatório e saúde financeira consomem daqui.
 */

import { type Cents, ZERO, clampToZero, sum } from "../../kernel/money.ts";
import { type Competence, competenceOf } from "../../time/competence.ts";
import { type LocalDate, firstDayOfMonth, lastDayOfMonth } from "../../time/local-date.ts";
import { type Account, liquidAccounts } from "../account/types.ts";
import {
  type CycleConfig,
  type CycleWindow,
  activeCompetence,
  activeCycleWindow,
  dueDateFor,
} from "../card/invoice-cycle.ts";
import { accountBalance, cardDebt, invoiceTotals, overdueCompetences } from "../ledger/balance.ts";
import type { LedgerEntry } from "../ledger/types.ts";

/** O que um cartão precisa expor para participar da posição financeira. */
export type PositionCard = CycleConfig & {
  readonly id: string;
  readonly kind: "credit" | "debit";
  /** O cartão que define o ciclo de referência do "livre para gastar". */
  readonly isPrimary: boolean;
  readonly sortOrder: number;
};

/** Categorias marcadas para não pesar no livre para gastar. */
export type FreeToSpendPolicy = {
  readonly excludedCategoryIds: ReadonlySet<string>;
};

const NO_EXCLUSIONS: FreeToSpendPolicy = { excludedCategoryIds: new Set() };

export type PositionInput = {
  readonly accounts: readonly Account[];
  readonly cards: readonly PositionCard[];
  readonly entries: readonly LedgerEntry[];
  /** Categoria de cada lançamento, para aplicar a política de exclusão. */
  readonly categoryByTransaction?: ReadonlyMap<string, string | null>;
  readonly today: LocalDate;
  readonly policy?: FreeToSpendPolicy;
};

/**
 * O cartão que define a janela do "livre para gastar".
 *
 * É o marcado como principal; sem marcação, o cartão de crédito de menor
 * ordem. A escolha é explícita e persistida — nunca "se só existe um, assume
 * esse".
 */
export function primaryCard(cards: readonly PositionCard[]): PositionCard | null {
  const credit = cards.filter((card) => card.kind === "credit");
  if (!credit.length) return null;
  return credit.find((card) => card.isPrimary) ?? [...credit].sort((a, b) => a.sortOrder - b.sortOrder)[0];
}

/**
 * Janela de referência do livre para gastar.
 *
 * É o ciclo do cartão principal — de um fechamento ao seguinte, não o mês
 * civil. A renda que entra depois do fechamento já pertence economicamente à
 * fatura seguinte. Sem cartão de crédito cadastrado, cai no mês civil.
 */
export function referenceWindow(cards: readonly PositionCard[], today: LocalDate): CycleWindow | null {
  const card = primaryCard(cards);
  return card ? activeCycleWindow(card, today) : null;
}

function windowBounds(cards: readonly PositionCard[], today: LocalDate): { start: LocalDate; end: LocalDate } {
  const window = referenceWindow(cards, today);
  return window
    ? { start: window.start, end: window.end }
    : { start: firstDayOfMonth(today), end: lastDayOfMonth(today) };
}

/**
 * Total em aberto de todas as faturas de um cartão: a ativa e as atrasadas.
 *
 * Só entra o que existe no razão. Uma assinatura ainda por lançar é gasto
 * futuro, não dívida de hoje — e somá-la aqui criaria um saldo devedor sem
 * lançamento correspondente, que nenhum pagamento consegue quitar.
 */
export function openInvoiceTotal(
  entries: readonly LedgerEntry[],
  card: PositionCard,
  today: LocalDate,
): Cents {
  const active = activeCompetence(card, today);
  const competences: Competence[] = [...overdueCompetences(entries, card.id, active), active];
  return sum(competences.map((competence) => invoiceTotals(entries, card.id, competence).outstanding));
}

export type FreeToSpend = {
  /** Saldo atual das contas de uso corrente em reais. */
  readonly liquidBalance: Cents;
  /** Receitas previstas dentro do horizonte e ainda não recebidas. */
  readonly pendingIncome: Cents;
  /** Faturas em aberto — a ativa e as atrasadas. */
  readonly openInvoices: Cents;
  /** Demais compromissos previstos do horizonte, fora do crédito. */
  readonly otherCommitments: Cents;
  /**
   * Quanto pode sair hoje sem que o saldo fique negativo em nenhum momento do
   * horizonte. Negativo significa que os compromissos já assumidos não cabem
   * no que existe mais o que está por entrar.
   */
  readonly amount: Cents;
  /** A data do ponto mais apertado — onde `amount` foi medido. */
  readonly lowestOn: LocalDate;
  readonly windowStart: LocalDate;
  readonly windowEnd: LocalDate;
  /** Até onde a projeção olhou para achar o ponto mais apertado. */
  readonly horizonEnd: LocalDate;
};

/**
 * Quanto pode ser gasto agora sem furar compromisso já assumido.
 *
 * A resposta **não** é `saldo + entradas − saídas` do período. Essa conta
 * ignora a ordem dos fatos, e a ordem é o problema inteiro: com R$ 3.000 na
 * conta, R$ 6.000 de salário no dia 8 e R$ 1.950 de aluguel no dia 10, a soma
 * responde R$ 7.050 — mas gastar R$ 7.050 hoje deixa a conta negativa até o
 * dia 8. O dinheiro do dia 8 não está disponível no dia 5.
 *
 * A resposta certa é o **menor saldo projetado** do horizonte: percorre-se a
 * linha do tempo somando o que entra e subtraindo o que sai, e a folga é o
 * ponto mais apertado dessa curva. Gastar exatamente esse valor hoje encosta
 * em zero no pior momento e não passa disso.
 *
 * O horizonte vai do fim do ciclo do cartão de referência **ou** do último
 * vencimento em aberto, o que for mais longe. É o que garante que o salário
 * que cai antes do vencimento da fatura seja contado junto com ela, em vez de
 * um dos dois ficar de fora por acaso do calendário.
 */
export function computeFreeToSpend(input: PositionInput): FreeToSpend {
  const policy = input.policy ?? NO_EXCLUSIONS;
  const { start, end } = windowBounds(input.cards, input.today);

  const liquid = liquidAccounts(input.accounts);
  const liquidBalance = sum(
    liquid.map((account) => accountBalance(input.entries, account.id, input.today, account.openingBalance)),
  );

  const liquidIds = new Set(liquid.map((account) => account.id));
  const isExcluded = (entry: LedgerEntry) => {
    const categoryId = input.categoryByTransaction?.get(entry.transactionId) ?? null;
    return categoryId !== null && policy.excludedCategoryIds.has(categoryId);
  };

  const creditCards = input.cards.filter((card) => card.kind === "credit");

  /**
   * Pagamentos de fatura esperados, cada um na data em que precisa sair.
   *
   * Fatura já vencida e não paga sai **hoje**: o dinheiro é devido agora, e
   * empurrá-la para a data de vencimento passada a faria cair fora do
   * horizonte e sumir da conta.
   */
  const invoiceDues: { on: LocalDate; amount: Cents }[] = [];
  for (const card of creditCards) {
    const active = activeCompetence(card, input.today);
    for (const competence of [...overdueCompetences(input.entries, card.id, active), active]) {
      const { outstanding } = invoiceTotals(input.entries, card.id, competence);
      if (outstanding <= 0) continue;
      const due = dueDateFor(card, competence);
      invoiceDues.push({ on: due < input.today ? input.today : due, amount: outstanding });
    }
  }

  const horizonEnd = invoiceDues.reduce<LocalDate>(
    (limite, pagamento) => (pagamento.on > limite ? pagamento.on : limite),
    end,
  );

  let pendingIncome = 0;
  let otherCommitments = 0;
  const movimentos: { on: LocalDate; amount: number }[] = [];

  for (const entry of input.entries) {
    if (entry.state !== "planned") continue;
    if (entry.party.kind !== "account" || !liquidIds.has(entry.party.accountId)) continue;
    if (entry.effectiveOn < start || entry.effectiveOn > horizonEnd) continue;
    if (isExcluded(entry)) continue;

    if (entry.amount > 0) pendingIncome += entry.amount;
    else otherCommitments -= entry.amount;

    // Previsto com data já passada continua devendo acontecer: entra hoje,
    // não na data vencida, senão nunca pesaria na curva.
    movimentos.push({
      on: entry.effectiveOn < input.today ? input.today : entry.effectiveOn,
      amount: entry.amount,
    });
  }

  for (const pagamento of invoiceDues) {
    movimentos.push({ on: pagamento.on, amount: -pagamento.amount });
  }

  movimentos.sort((esquerda, direita) => (esquerda.on < direita.on ? -1 : esquerda.on > direita.on ? 1 : 0));

  // O ponto de partida entra na comparação: quando tudo que vem pela frente só
  // acrescenta, a folga é o próprio saldo de hoje — e não a soma com o que
  // ainda não chegou.
  let corrente = liquidBalance as number;
  let menor = corrente;
  let menorEm = input.today;
  for (const movimento of movimentos) {
    corrente += movimento.amount;
    if (corrente < menor) {
      menor = corrente;
      menorEm = movimento.on;
    }
  }

  const openInvoices = sum(
    creditCards.map((card) => openInvoiceTotal(input.entries, card, input.today)),
  );

  return {
    liquidBalance,
    pendingIncome: pendingIncome as Cents,
    openInvoices,
    otherCommitments: otherCommitments as Cents,
    amount: menor as Cents,
    lowestOn: menorEm,
    windowStart: start,
    windowEnd: end,
    horizonEnd,
  };
}

export type FinancialPosition = {
  readonly asOf: LocalDate;
  /** Dinheiro disponível agora nas contas de uso corrente. */
  readonly currentBalance: Cents;
  /** Reservas e investimentos. */
  readonly investments: Cents;
  /** Contas + investimentos. */
  readonly totalAssets: Cents;
  /** Dívida somada de todos os cartões. */
  readonly cardDebt: Cents;
  /** Ativos menos passivos. */
  readonly netWorth: Cents;
  /** Obrigações já assumidas: faturas em aberto e previstos da janela. */
  readonly committed: Cents;
  readonly freeToSpend: FreeToSpend;
};

export function computeFinancialPosition(input: PositionInput): FinancialPosition {
  const freeToSpend = computeFreeToSpend(input);

  /**
   * Só contas em reais entram no patrimônio.
   *
   * Somar o saldo de uma conta em dólar como se fossem centavos de real
   * inventa ou destrói patrimônio conforme o câmbio. Enquanto não houver
   * conversão, o saldo em moeda estrangeira aparece na própria conta e fica
   * fora do total — melhor faltar do que estar errado.
   */
  const active = input.accounts.filter(
    (account) => account.archivedAt === null && account.includeInTotals && account.currency === "BRL",
  );
  const liquidIds = new Set(liquidAccounts(input.accounts).map((account) => account.id));

  const balanceOf = (account: Account) =>
    accountBalance(input.entries, account.id, input.today, account.openingBalance);

  const investments = sum(active.filter((account) => !liquidIds.has(account.id)).map(balanceOf));
  const currentBalance = freeToSpend.liquidBalance;
  const totalDebt = sum(input.cards.filter((card) => card.kind === "credit").map((card) => cardDebt(input.entries, card.id)));

  return {
    asOf: input.today,
    currentBalance,
    investments,
    totalAssets: (currentBalance + investments) as Cents,
    cardDebt: totalDebt,
    netWorth: (currentBalance + investments - totalDebt) as Cents,
    committed: clampToZero((freeToSpend.openInvoices + freeToSpend.otherCommitments) as Cents),
    freeToSpend,
  };
}

/**
 * Fluxo futuro: saldo projetado ao fim de cada competência à frente.
 *
 * Mostra como receitas e despesas futuras alteram a situação — separado do
 * saldo atual, nunca somado a ele.
 */
export type CashflowPoint = {
  readonly competence: Competence;
  readonly inflow: Cents;
  readonly outflow: Cents;
  readonly net: Cents;
  /** Saldo acumulado ao fim da competência. */
  readonly projectedBalance: Cents;
};

export function projectCashflow(
  input: PositionInput & { readonly competences: readonly Competence[] },
): CashflowPoint[] {
  const liquidIds = new Set(liquidAccounts(input.accounts).map((account) => account.id));
  let running = sum(
    liquidAccounts(input.accounts).map((account) =>
      accountBalance(input.entries, account.id, input.today, account.openingBalance),
    ),
  );

  const invoiceOutflows = foldBeforeWindow(projectedInvoicePayments(input), input.competences);
  const first = input.competences[0];

  return input.competences.map((competence) => {
    let inflow = 0;
    let outflow = 0;
    for (const entry of input.entries) {
      if (entry.party.kind !== "account" || !liquidIds.has(entry.party.accountId)) continue;
      if (entry.effectiveOn <= input.today && entry.state === "confirmed") continue; // já está no saldo

      // Previsto de competência anterior à janela não desaparece: ainda não
      // aconteceu e continua devendo acontecer, então é trazido para o
      // primeiro mês exibido — o mesmo tratamento das faturas atrasadas.
      const alvo = first && entry.competence < first ? first : entry.competence;
      if (alvo !== competence) continue;

      if (entry.amount > 0) inflow += entry.amount;
      else outflow -= entry.amount;
    }

    // A fatura só vira saída de caixa quando é paga, e até lá não existe
    // movimentação em conta nenhuma. Sem projetá-la, o fluxo futuro mostraria
    // um saldo folgado que ignora a maior despesa recorrente de quem usa
    // cartão — inclusive as parcelas já comprometidas.
    outflow += invoiceOutflows.get(competence) ?? 0;

    running = (running + inflow - outflow) as Cents;
    return {
      competence,
      inflow: inflow as Cents,
      outflow: outflow as Cents,
      net: (inflow - outflow) as Cents,
      projectedBalance: running,
    };
  });
}

/**
 * Traz para o primeiro mês exibido tudo que venceria antes dele.
 *
 * Uma fatura atrasada cai numa competência anterior à janela da projeção e
 * simplesmente sumiria do gráfico — justo a dívida mais urgente. Ela continua
 * sendo devida, então aparece no primeiro mês que a tela mostra.
 */
function foldBeforeWindow(
  outflows: Map<Competence, number>,
  competences: readonly Competence[],
): Map<Competence, number> {
  const first = competences[0];
  if (!first) return outflows;

  const folded = new Map<Competence, number>();
  for (const [competence, amount] of outflows) {
    const target = competence < first ? first : competence;
    folded.set(target, (folded.get(target) ?? 0) + amount);
  }
  return folded;
}

/**
 * Pagamentos de fatura esperados, na competência em que cada uma vence.
 *
 * Só entram faturas com saldo devedor: o que já foi pago saiu do saldo, e
 * projetá-lo de novo cobraria a mesma fatura duas vezes.
 *
 * Exportado porque o planejamento precisa da mesma resposta: uma assinatura
 * cobrada no cartão é compromisso do mês em que a fatura vence, e calculá-la
 * de novo lá daria dois números para a mesma pergunta.
 */
export function projectedInvoicePayments(input: PositionInput): Map<Competence, number> {
  const outflows = new Map<Competence, number>();

  for (const card of input.cards) {
    if (card.kind !== "credit") continue;

    const competences = new Set<Competence>();
    for (const entry of input.entries) {
      if (entry.party.kind === "card" && entry.party.cardId === card.id) competences.add(entry.competence);
    }

    for (const competence of competences) {
      // Aqui a projeção **entra**: a pergunta é quanto a fatura vai custar
      // quando vencer, e a assinatura recorrente vai estar nela.
      const { outstanding } = invoiceTotals(input.entries, card.id, competence, undefined, {
        includeProjected: true,
      });
      if (outstanding <= 0) continue;

      const dueDate = dueDateFor(card, competence);
      // Fatura vencida e não paga é dívida de hoje, não projeção: some no mês
      // corrente para não desaparecer da previsão.
      const target = dueDate < input.today ? competenceOf(input.today) : competenceOf(dueDate);
      outflows.set(target, (outflows.get(target) ?? 0) + outstanding);
    }
  }

  return outflows;
}

export const EMPTY_FREE_TO_SPEND: FreeToSpend = {
  liquidBalance: ZERO,
  pendingIncome: ZERO,
  openInvoices: ZERO,
  otherCommitments: ZERO,
  amount: ZERO,
  lowestOn: "1970-01-01" as LocalDate,
  windowStart: "1970-01-01" as LocalDate,
  windowEnd: "1970-01-01" as LocalDate,
  horizonEnd: "1970-01-01" as LocalDate,
};
