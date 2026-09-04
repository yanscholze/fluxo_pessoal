/**
 * Os números do aplicativo.
 *
 * Aqui **não existe conta de dinheiro**. O que este arquivo faz é traduzir a
 * linha do banco local para o modelo do domínio e chamar as mesmas funções que
 * o servidor chama: `postTransaction` para virar movimentação, e as consultas
 * de `core/domain/ledger/balance.ts` para virar saldo, fatura e fluxo.
 *
 * Foi assim que a versão anterior errava: o celular somava do seu jeito, o
 * site do dele, e os dois mostravam saldos diferentes para o mesmo dinheiro.
 * Uma regra, uma implementação, dois consumidores.
 *
 * O razão é derivado na leitura em vez de gravado. São centenas ou poucos
 * milhares de lançamentos num aparelho — a soma custa milissegundos, e em
 * troca é impossível o razão local ficar dessincronizado do fato local.
 */

import { activeCompetence, daysUntilClosing, dueDateFor } from "@fluxo/core/domain/card/invoice-cycle.ts";
import {
  CONSUMPTION,
  availableLimit,
  cardDebt,
  committedLimit,
  flow,
  invoiceTotals,
  totalAccountBalance,
} from "@fluxo/core/domain/ledger/balance.ts";
import { postTransaction } from "@fluxo/core/domain/ledger/posting.ts";
import {
  type FreeToSpend,
  type PositionCard,
  computeFreeToSpend,
} from "@fluxo/core/domain/position/financial-position.ts";
import type { Account, AccountKind, CurrencyCode } from "@fluxo/core/domain/account/types.ts";
import {
  accountParty,
  cardParty,
  type LedgerEntry,
  type Party,
  type Transaction,
} from "@fluxo/core/domain/ledger/types.ts";
import { type Cents, subtract } from "@fluxo/core/kernel/money.ts";
import { type Competence, series, shift } from "@fluxo/core/time/competence.ts";
import { type LocalDate, addDays } from "@fluxo/core/time/local-date.ts";
import type { LocalAccount, LocalCard, LocalCategory, LocalTransaction } from "../storage/model.ts";

/**
 * Converte a linha local no lançamento do domínio.
 *
 * Devolve `null` quando a linha não tem origem: acontece com o registro-lápide
 * que marca uma exclusão vinda do servidor. Não é erro — é linha que não
 * representa dinheiro nenhum.
 */
function toTransaction(row: LocalTransaction, userId: string): Transaction | null {
  const origin: Party | null = row.cardId
    ? cardParty(row.cardId)
    : row.accountId
      ? accountParty(row.accountId)
      : null;

  if (!origin) return null;

  const destination: Party | null = row.destinationCardId
    ? cardParty(row.destinationCardId)
    : row.destinationAccountId
      ? accountParty(row.destinationAccountId)
      : null;

  return {
    id: row.id,
    userId,
    kind: row.kind,
    state: row.state,
    source: "manual",
    description: row.description,
    categoryId: row.categoryId,
    amount: row.amount,
    currency: "BRL",
    occurredOn: row.occurredOn,
    origin,
    destination,
    competence: row.competence,
    tripId: row.tripId,
    installmentPlanId: null,
    installmentNumber: row.installmentNumber,
    recurrenceId: null,
    notes: row.notes,
  };
}

/**
 * Materializa o razão a partir dos lançamentos locais.
 *
 * Um lançamento que o domínio recusa (transferência sem destino, valor zero) é
 * **pulado**, não interrompe o cálculo: um único registro estranho vindo de
 * uma versão antiga não pode zerar a tela inteira do usuário. Quantos foram
 * pulados sai junto, para a tela poder avisar em vez de esconder.
 */
export function buildLedger(
  rows: readonly LocalTransaction[],
  userId: string,
): { entries: LedgerEntry[]; skipped: number } {
  const entries: LedgerEntry[] = [];
  let skipped = 0;

  for (const row of rows) {
    const transaction = toTransaction(row, userId);
    if (!transaction) continue;

    try {
      const draft = postTransaction(transaction);
      draft.forEach((entry, indice) => {
        // O identificador da movimentação é derivado, não sorteado: a mesma
        // entrada precisa ter a mesma identidade a cada recálculo.
        entries.push({ ...entry, id: `${transaction.id}:${indice}` });
      });
    } catch {
      skipped += 1;
    }
  }

  return { entries, skipped };
}

export type CardSummary = {
  readonly card: LocalCard;
  readonly competence: Competence;
  readonly dueDate: LocalDate;
  readonly daysToClosing: number;
  readonly charges: Cents;
  readonly payments: Cents;
  readonly outstanding: Cents;
  readonly debt: Cents;
  /** `null` quando o cartão não tem limite cadastrado. */
  readonly available: Cents | null;
};

export type Overview = {
  /** Soma dos saldos confirmados das contas. Dinheiro que existe hoje. */
  readonly balance: Cents;
  /** Dívida de cartão já assumida. Dinheiro que já tem dono. */
  readonly committed: Cents;
  /**
   * Quanto pode sair hoje sem furar compromisso já assumido.
   *
   * É o **menor saldo projetado** do horizonte, calculado por
   * `computeFreeToSpend` — a mesmíssima função que o site chama. Antes daqui
   * saía `saldo − comprometido`, uma aproximação que ignora a ordem dos
   * vencimentos e dava um número diferente do que o site mostrava para o mesmo
   * dinheiro.
   */
  readonly free: Cents;
  /** A decomposição, para a tela poder explicar o número. */
  readonly freeToSpend: FreeToSpend;
  readonly income: Cents;
  readonly expense: Cents;
  readonly cards: readonly CardSummary[];
  readonly skipped: number;
};

/**
 * Traduz a conta local para o modelo do domínio.
 *
 * O formato do fio é deliberadamente mais raso que o do domínio, e os campos
 * que faltam não são inventados: são preenchidos com o valor **neutro** — o que
 * não altera nenhuma das contas que `computeFreeToSpend` faz. `openedOn` no
 * início dos tempos não move saldo (o saldo é "inicial + movimentações", e a
 * data de abertura só documenta); `goalAmount` e o rendimento não entram no
 * cálculo da folga.
 *
 * O que **não** é neutro — `includeInTotals`, a moeda, o tipo — viaja pela
 * sincronização e chega de verdade.
 */
function toDomainAccount(conta: LocalAccount, userId: string): Account {
  return {
    id: conta.id,
    userId,
    name: conta.name,
    institution: "",
    kind: conta.kind as AccountKind,
    currency: conta.currency as CurrencyCode,
    openingBalance: conta.openingBalance,
    openedOn: "1970-01-01" as LocalDate,
    goalAmount: null,
    monthlyYieldBasisPoints: 0,
    includeInTotals: conta.includeInTotals,
    isProtected: false,
    color: conta.color ?? "#000000",
    sortOrder: 0,
    archivedAt: conta.archivedAt,
  };
}

function toPositionCard(cartao: LocalCard): PositionCard {
  return {
    id: cartao.id,
    kind: cartao.kind === "debit" ? "debit" : "credit",
    isPrimary: cartao.isPrimary,
    sortOrder: cartao.sortOrder,
    closingDay: cartao.closingDay,
    dueDay: cartao.dueDay,
    dueAdjustment: cartao.dueAdjustment,
  };
}

/**
 * O painel inicial.
 *
 * As quatro grandezas ficam separadas de propósito. Patrimônio, saldo atual,
 * comprometido e livre para gastar respondem perguntas diferentes, e misturar
 * duas delas num número só foi o defeito mais caro da versão anterior: o
 * usuário via "disponível" e gastava dinheiro que já era da fatura.
 */
export function overview(input: {
  rows: readonly LocalTransaction[];
  accounts: readonly LocalAccount[];
  cards: readonly LocalCard[];
  categories: readonly LocalCategory[];
  userId: string;
  today: LocalDate;
  competence: Competence;
}): Overview {
  const { entries, skipped } = buildLedger(input.rows, input.userId);

  const aberturas = new Map(input.accounts.map((conta) => [conta.id, conta.openingBalance]));
  const balance = totalAccountBalance(entries, aberturas, input.today);

  const cards = input.cards.map((card): CardSummary => {
    const competence = activeCompetence(card, input.today);
    const totais = invoiceTotals(entries, card.id, competence);
    // Zero é "não cadastrado": mostrar "R$ 0,00 disponível" para quem nunca
    // informou o teto seria uma informação falsa, não uma informação faltante.
    const limite = card.limit > 0 ? card.limit : null;

    return {
      card,
      competence,
      dueDate: dueDateFor(card, competence),
      daysToClosing: daysUntilClosing(card, input.today),
      charges: totais.charges,
      payments: totais.payments,
      outstanding: totais.outstanding,
      debt: cardDebt(entries, card.id),
      available: limite === null ? null : availableLimit(entries, card.id, limite),
    };
  });

  const committed = input.cards.reduce<number>(
    (total, card) => total + committedLimit(entries, card.id),
    0,
  ) as Cents;

  const consumo = flow(entries, {
    states: ["confirmed"],
    competence: input.competence,
    kinds: CONSUMPTION,
  });

  /**
   * A folga, pela regra do domínio.
   *
   * Recebe as mesmas entradas que o servidor monta: contas traduzidas, cartões
   * com a marcação de principal, o razão inteiro, o índice de categoria de cada
   * lançamento e a política de exclusão. Mesma função, mesmas entradas, mesmo
   * número — que é o ponto.
   */
  const freeToSpend = computeFreeToSpend({
    accounts: input.accounts.map((conta) => toDomainAccount(conta, input.userId)),
    cards: input.cards.map(toPositionCard),
    entries,
    categoryByTransaction: new Map(input.rows.map((row) => [row.id, row.categoryId])),
    today: input.today,
    policy: {
      excludedCategoryIds: new Set(
        input.categories.filter((categoria) => categoria.excludeFromFreeToSpend).map((c) => c.id),
      ),
    },
  });

  return {
    balance,
    committed,
    free: freeToSpend.amount,
    freeToSpend,
    income: consumo.inflow,
    expense: consumo.outflow,
    cards,
    skipped,
  };
}

// ---------------------------------------------------------------------------
// Séries para os gráficos
//
// Continuam sem fazer conta de dinheiro: cada ponto é uma chamada a `flow` ou
// a `totalAccountBalance`, as mesmas do site. O que este trecho faz é escolher
// o recorte — quais competências, quais dias — e nada mais.
// ---------------------------------------------------------------------------

export type PontoMensal = {
  readonly competence: Competence;
  readonly income: Cents;
  readonly expense: Cents;
};

/**
 * Entrou e saiu, mês a mês, terminando na competência informada.
 *
 * Só consumo: transferência entre contas próprias não é receita nem despesa, e
 * contá-la infla os dois lados do gráfico com dinheiro que só mudou de lugar.
 */
export function monthlyFlow(input: {
  rows: readonly LocalTransaction[];
  userId: string;
  competence: Competence;
  months: number;
}): PontoMensal[] {
  const { entries } = buildLedger(input.rows, input.userId);
  const competencias = series(shift(input.competence, -(input.months - 1)), input.months);

  return competencias.map((competence) => {
    const consumo = flow(entries, { states: ["confirmed"], competence, kinds: CONSUMPTION });
    return { competence, income: consumo.inflow, expense: consumo.outflow };
  });
}

export type GastoPorCategoria = {
  readonly categoryId: string | null;
  readonly name: string;
  readonly color: string | null;
  readonly amount: Cents;
};

/**
 * Quanto saiu em cada categoria na competência.
 *
 * Feito sobre os lançamentos, e não sobre o razão, porque categoria é
 * propriedade do fato — a movimentação fala de dinheiro, não de significado.
 * Só despesa confirmada entra: previsto ainda não aconteceu, e receita não tem
 * o que dividir por categoria de gasto.
 */
export function spendByCategory(input: {
  rows: readonly LocalTransaction[];
  categories: readonly LocalCategory[];
  competence: Competence;
}): GastoPorCategoria[] {
  const nomes = new Map(input.categories.map((categoria) => [categoria.id, categoria]));
  const totais = new Map<string | null, number>();

  for (const row of input.rows) {
    if (row.kind !== "expense" || row.state !== "confirmed") continue;
    if (row.competence !== input.competence) continue;
    totais.set(row.categoryId, (totais.get(row.categoryId) ?? 0) + row.amount);
  }

  return [...totais]
    .map(([categoryId, amount]) => {
      const categoria = categoryId ? nomes.get(categoryId) : undefined;
      return {
        categoryId,
        name: categoria?.name ?? "Sem categoria",
        color: categoria?.color ?? null,
        amount: amount as Cents,
      };
    })
    .sort((esquerda, direita) => direita.amount - esquerda.amount);
}

/**
 * Saldo ao fim de cada um dos últimos dias.
 *
 * Alimenta a série curta do topo do painel. Reconstruído a partir do razão a
 * cada leitura — guardar a série seria manter um número à mão, que é
 * exatamente o que este projeto não faz com dinheiro.
 */
export function balanceHistory(input: {
  rows: readonly LocalTransaction[];
  accounts: readonly LocalAccount[];
  userId: string;
  today: LocalDate;
  days: number;
}): Cents[] {
  const { entries } = buildLedger(input.rows, input.userId);
  const aberturas = new Map(input.accounts.map((conta) => [conta.id, conta.openingBalance]));

  return Array.from({ length: input.days }, (_, indice) => {
    const dia = addDays(input.today, -(input.days - 1 - indice));
    return totalAccountBalance(entries, aberturas, dia);
  });
}
