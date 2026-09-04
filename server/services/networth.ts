/**
 * Patrimônio.
 *
 * O número já existia — `netWorth` sai de `computeFinancialPosition` e aparece
 * como um item na faixa do painel. O que faltava era o lugar onde ele é a
 * **pergunta**, e não um indicador de canto: quanto eu tenho, onde está, quanto
 * devo, e para que lado isso vem andando.
 *
 * Nada aqui é regra nova. Este serviço recorta e ordena o que o domínio já
 * calcula: se um número daqui discordasse do painel, um dos dois estaria
 * errado e o usuário não teria como saber qual.
 */

import { accountBalance, cardDebt, cardDebtAsOf } from "../../core/domain/ledger/balance.ts";
import { computeFinancialPosition } from "../../core/domain/position/financial-position.ts";
import { type Competence, competenceOf, series, shift } from "../../core/time/competence.ts";
import { type LocalDate, lastDayOfMonth, todayIn } from "../../core/time/local-date.ts";
import { listAccounts, listCards } from "../repositories/catalog.ts";
import { loadLedger } from "../repositories/ledger.ts";

export type HoldingView = {
  readonly id: string;
  readonly name: string;
  readonly institution: string;
  readonly kind: string;
  readonly currency: string;
  readonly color: string;
  readonly balanceCents: number;
  /** Fatia do total de ativos, em pontos percentuais. */
  readonly sharePercent: number;
};

export type LiabilityView = {
  readonly id: string;
  readonly name: string;
  readonly kind: "card";
  readonly amountCents: number;
};

export type NetWorthPoint = {
  readonly competence: Competence;
  readonly assetsCents: number;
  readonly liabilitiesCents: number;
  readonly netCents: number;
};

export type NetWorthView = {
  readonly today: LocalDate;
  readonly netWorthCents: number;
  readonly assetsCents: number;
  readonly liabilitiesCents: number;
  /** Dinheiro de uso corrente, separado do que está guardado. */
  readonly liquidCents: number;
  readonly investedCents: number;
  readonly holdings: readonly HoldingView[];
  readonly liabilities: readonly LiabilityView[];
  readonly history: readonly NetWorthPoint[];
  /** Variação no período coberto pelo histórico. */
  readonly changeCents: number;
  readonly changePercent: number | null;
  /** Saldos em moeda estrangeira, que ficam fora do total. */
  readonly foreign: readonly { currency: string; balanceCents: number }[];
};

const HISTORY_MONTHS = 12;

export async function buildNetWorthView(userId: string, now: Date = new Date()): Promise<NetWorthView> {
  const today = todayIn(now);
  const [accounts, cards, entries] = await Promise.all([
    listAccounts(userId),
    listCards(userId),
    loadLedger(userId),
  ]);

  const position = computeFinancialPosition({ accounts, cards, entries, today });

  const ativas = accounts.filter((account) => account.archivedAt === null && account.includeInTotals);
  const emReais = ativas.filter((account) => account.currency === "BRL");
  const saldoDe = (account: (typeof accounts)[number], data: LocalDate = today) =>
    accountBalance(entries, account.id, data, account.openingBalance);

  const assets = position.totalAssets;

  const holdings: HoldingView[] = emReais
    .map((account) => {
      const balanceCents = saldoDe(account);
      return {
        id: account.id,
        name: account.name,
        institution: account.institution,
        kind: account.kind,
        currency: account.currency,
        color: account.color,
        balanceCents,
        // A fatia é sobre o total de ativos, não sobre o patrimônio: dividir
        // pelo líquido faria as fatias passarem de 100% sempre que houvesse
        // dívida, o que não quer dizer nada.
        sharePercent: assets > 0 ? (balanceCents / assets) * 100 : 0,
      };
    })
    .sort((esquerda, direita) => direita.balanceCents - esquerda.balanceCents);

  const liabilities: LiabilityView[] = cards
    .filter((card) => card.kind === "credit")
    .map((card) => ({
      id: card.id,
      name: card.name,
      kind: "card" as const,
      amountCents: cardDebt(entries, card.id),
    }))
    .filter((passivo) => passivo.amountCents > 0)
    .sort((esquerda, direita) => direita.amountCents - esquerda.amountCents);

  const history = historico(accounts, cards, entries, today);
  const primeiro = history[0]?.netCents ?? 0;
  const ultimo = history[history.length - 1]?.netCents ?? position.netWorth;

  return {
    today,
    netWorthCents: position.netWorth,
    assetsCents: assets,
    liabilitiesCents: position.cardDebt,
    liquidCents: position.currentBalance,
    investedCents: position.investments,
    holdings,
    liabilities,
    history,
    changeCents: ultimo - primeiro,
    // Sem base não existe percentual. Zero de partida com qualquer chegada dá
    // divisão por zero, e "infinito por cento" não informa nada.
    changePercent: primeiro !== 0 ? ((ultimo - primeiro) / Math.abs(primeiro)) * 100 : null,
    foreign: moedaEstrangeira(ativas, saldoDe),
  };
}

/**
 * Patrimônio ao fim de cada mês.
 *
 * Reconstruído a partir do razão, mês a mês — não guardado. Um histórico
 * gravado seria mais rápido de ler e ficaria errado no primeiro lançamento
 * corrigido com data retroativa.
 */
function historico(
  accounts: Awaited<ReturnType<typeof listAccounts>>,
  cards: Awaited<ReturnType<typeof listCards>>,
  entries: Awaited<ReturnType<typeof loadLedger>>,
  today: LocalDate,
): NetWorthPoint[] {
  const competencias = series(shift(competenceOf(today), -(HISTORY_MONTHS - 1)), HISTORY_MONTHS);
  const ativas = accounts.filter((account) => account.includeInTotals && account.currency === "BRL");
  const credito = cards.filter((card) => card.kind === "credit");

  return competencias.map((competence) => {
    // Para o mês corrente o corte é hoje: projetar o fim do mês misturaria
    // patrimônio realizado com previsão dentro da mesma série.
    const corte = competence === competenceOf(today) ? today : lastDayOfMonth(firstOf(competence));

    let assetsCents = 0;
    for (const account of ativas) {
      assetsCents += accountBalance(entries, account.id, corte, account.openingBalance);
    }

    let liabilitiesCents = 0;
    for (const card of credito) {
      liabilitiesCents += cardDebtAsOf(entries, card.id, corte);
    }

    return { competence, assetsCents, liabilitiesCents, netCents: assetsCents - liabilitiesCents };
  });
}

function firstOf(competence: Competence): LocalDate {
  return `${competence}-01` as LocalDate;
}

function moedaEstrangeira(
  ativas: Awaited<ReturnType<typeof listAccounts>>,
  saldoDe: (account: Awaited<ReturnType<typeof listAccounts>>[number]) => number,
): { currency: string; balanceCents: number }[] {
  const porMoeda = new Map<string, number>();
  for (const account of ativas) {
    if (account.currency === "BRL") continue;
    porMoeda.set(account.currency, (porMoeda.get(account.currency) ?? 0) + saldoDe(account));
  }
  return [...porMoeda].map(([currency, balanceCents]) => ({ currency, balanceCents }));
}
