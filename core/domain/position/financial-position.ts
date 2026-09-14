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
import { type Account, benefitAccounts, liquidAccounts, moneyAccounts } from "../account/types.ts";
import {
  type CycleConfig,
  type CycleWindow,
  activeCompetence,
  activeCycleWindow,
  dueDateFor,
} from "../card/invoice-cycle.ts";
import { accountBalance, cardDebtAsOf, invoiceTotals, overdueCompetences } from "../ledger/balance.ts";
import { isProjected, type LedgerEntry } from "../ledger/types.ts";

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
  /** Quanto sobra no ciclo depois das receitas e compromissos conhecidos. */
  readonly amount: Cents;
  readonly windowStart: LocalDate;
  readonly windowEnd: LocalDate;
};

/**
 * Qual bolso está sendo mostrado.
 *
 * A visão padrão soma o dinheiro e o vale porque o usuário pediu a folga do
 * ciclo completa. A visão do vale permanece separada para indicar quanto do
 * total só pode ser usado em alimentação.
 */
export type Purse = "all" | "money" | "benefit";

/**
 * Parcela da fatura que a política mandou ignorar.
 *
 * Existe porque a exclusão por categoria só alcançava previsto em conta, e o
 * cartão entrava sempre pelo total. Quem marca "Empréstimo do Cartão" como fora
 * do livre para gastar quer exatamente que aquelas parcelas não apertem a folga
 * do mês — e era justamente onde a marcação não chegava.
 */
function excludedInvoiceCharges(
  entries: readonly LedgerEntry[],
  cardId: string,
  competence: Competence,
  isExcluded: (entry: LedgerEntry) => boolean,
): number {
  let total = 0;
  for (const entry of entries) {
    if (entry.party.kind !== "card" || entry.party.cardId !== cardId) continue;
    if (entry.competence !== competence) continue;
    if (entry.amount >= 0) continue;
    if (!isExcluded(entry)) continue;
    total -= entry.amount;
  }
  return total;
}

/**
 * Folga do ciclo conforme a regra do produto:
 *
 * saldo disponível + todas as entradas previstas − faturas ajustadas −
 * recorrências, assinaturas e saídas programadas. A janela é o ciclo do cartão
 * principal; uma fatura pode vencer depois do fechamento, mas sua compra já é
 * compromisso do ciclo e continua entrando pela fatura em aberto.
 */
export function computeFreeToSpend(input: PositionInput, purse: Purse = "all"): FreeToSpend {
  const policy = input.policy ?? NO_EXCLUSIONS;
  const { start, end } = windowBounds(input.cards, input.today);

  const liquid =
    purse === "benefit"
      ? benefitAccounts(input.accounts)
      : purse === "money"
        ? moneyAccounts(input.accounts)
        : liquidAccounts(input.accounts);
  const liquidBalance = sum(
    liquid.map((account) => accountBalance(input.entries, account.id, input.today, account.openingBalance)),
  );

  const liquidIds = new Set(liquid.map((account) => account.id));
  const isExcluded = (entry: LedgerEntry) => {
    const categoryId = input.categoryByTransaction?.get(entry.transactionId) ?? null;
    return categoryId !== null && policy.excludedCategoryIds.has(categoryId);
  };

  // O vale não recebe fatura própria. Na visão consolidada, porém, ele entra no
  // saldo disponível solicitado pelo usuário.
  const creditCards = purse === "money" ? input.cards.filter((card) => card.kind === "credit") : [];
  if (purse === "all") creditCards.push(...input.cards.filter((card) => card.kind === "credit"));

  let openInvoices = 0;
  for (const card of creditCards) {
    const active = activeCompetence(card, input.today);
    for (const competence of [...overdueCompetences(input.entries, card.id, active), active]) {
      const { outstanding } = invoiceTotals(input.entries, card.id, competence);
      const ignorado = excludedInvoiceCharges(input.entries, card.id, competence, isExcluded);
      const devido = Math.max(0, outstanding - ignorado);
      if (devido <= 0) continue;
      openInvoices += devido;
    }
  }

  let pendingIncome = 0;
  let otherCommitments = 0;

  for (const entry of input.entries) {
    if (entry.state !== "planned") continue;
    if (entry.effectiveOn < start || entry.effectiveOn > end) continue;
    if (isExcluded(entry)) continue;

    if (entry.party.kind === "account" && liquidIds.has(entry.party.accountId)) {
      if (entry.amount > 0) pendingIncome += entry.amount;
      else otherCommitments -= entry.amount;
      continue;
    }

    // Recorrência no cartão ainda não é parte quitável da fatura, pois é uma
    // projeção virtual. Mesmo assim já compromete o ciclo e precisa sair da
    // folga uma vez — sem somar também à fatura.
    if (entry.party.kind === "card" && isProjected(entry) && entry.amount < 0 && purse !== "benefit") {
      otherCommitments -= entry.amount;
    }
  }

  return {
    liquidBalance,
    pendingIncome: pendingIncome as Cents,
    openInvoices: openInvoices as Cents,
    otherCommitments: otherCommitments as Cents,
    amount: (liquidBalance + pendingIncome - openInvoices - otherCommitments) as Cents,
    windowStart: start,
    windowEnd: end,
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
  /** Folga consolidada do ciclo, incluindo dinheiro e benefício. */
  readonly freeToSpend: FreeToSpend;
  /**
   * Folga do vale-alimentação, medida à parte.
   *
   * É apenas um detalhamento do vale dentro da folga consolidada.
   */
  readonly benefitFreeToSpend: FreeToSpend;
};

export function computeFinancialPosition(input: PositionInput): FinancialPosition {
  const freeToSpend = computeFreeToSpend(input);
  const benefitFreeToSpend = computeFreeToSpend(input, "benefit");

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
  /*
   * O passivo do patrimônio é o que já foi cobrado, não o que ainda vai ser.
   *
   * `cardDebt` soma também o previsto, e num extrato com parcelamento longo
   * isso é a diferença entre um patrimônio e uma ficção: as 67 parcelas
   * futuras de um usuário real somavam R$ 13.319,68 e derrubavam o patrimônio
   * para -R$ 14.531,00, num mês em que ele não devia nada além da fatura
   * aberta de R$ 4.956,51.
   *
   * Parcela que ainda não virou cobrança é **compromisso** — e ela já aparece
   * como tal em `committed` e em "parcelas a vencer". Contá-la aqui também
   * seria contá-la duas vezes, uma delas no lugar errado.
   *
   * É o mesmo critério que a série histórica usa, o que faz o último ponto do
   * gráfico finalmente falar a mesma língua dos anteriores.
   */
  /*
   * O empréstimo de cartão sai do passivo, pela mesma razão que sai da folga.
   *
   * Ele é dívida com o emissor e valor a receber de quem pediu, na mesma
   * quantia. Somar só a metade devida faria o patrimônio cair a cada favor —
   * e o dono via o próprio patrimônio piorar por comprar para os outros.
   */
  const politica = input.policy ?? NO_EXCLUSIONS;
  const excluida = (entry: LedgerEntry) => {
    const categoryId = input.categoryByTransaction?.get(entry.transactionId) ?? null;
    return categoryId !== null && politica.excludedCategoryIds.has(categoryId);
  };

  const totalDebt = sum(
    input.cards
      .filter((card) => card.kind === "credit")
      .map((card) => cardDebtAsOf(input.entries, card.id, input.today, excluida)),
  );

  return {
    asOf: input.today,
    currentBalance,
    investments,
    totalAssets: (currentBalance + investments) as Cents,
    cardDebt: totalDebt,
    netWorth: (currentBalance + investments - totalDebt) as Cents,
    committed: clampToZero((freeToSpend.openInvoices + freeToSpend.otherCommitments) as Cents),
    freeToSpend,
    benefitFreeToSpend,
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
  windowStart: "1970-01-01" as LocalDate,
  windowEnd: "1970-01-01" as LocalDate,
};
