/**
 * Serviço de recompensas.
 *
 * Apura o que cada compra rendeu, calcula o saldo resgatável e registra os
 * resgates. Cashback resgatado vira lançamento de verdade — é dinheiro
 * entrando numa conta; pontos não passam pelo razão, porque não são dinheiro.
 */

import { activeCompetence } from "../../core/domain/card/invoice-cycle.ts";
import {
  type EarningRecord,
  type RewardBalance,
  type RewardConfig,
  assertRedeemable,
  earningFor,
  rewardBalance,
} from "../../core/domain/card/rewards.ts";
import { accountParty, type Transaction } from "../../core/domain/ledger/types.ts";
import { conflict, notFound } from "../../core/kernel/errors.ts";
import { newId } from "../../core/kernel/id.ts";
import { type Cents, cents } from "../../core/kernel/money.ts";
import { type Competence, competenceOf } from "../../core/time/competence.ts";
import { type LocalDate, localDate, todayIn } from "../../core/time/local-date.ts";
import { and, eq, inArray, isNull } from "drizzle-orm";

import { getDatabase } from "../db/client.ts";
import { rewardRedemptions, transactions } from "../db/schema/index.ts";
import { type CardRecord, findAccount, findCard, listCards } from "../repositories/catalog.ts";
import { saveTransactionBatch } from "../repositories/ledger.ts";
import { usdQuote } from "./exchange-rate.ts";

export function configOf(card: CardRecord): RewardConfig {
  return {
    mode: card.rewardMode,
    pointsPerDollarMilli: card.pointsPerDollarMilli,
    cashbackBasisPoints: card.cashbackBasisPoints,
    pointsGoal: card.pointsGoal,
    manualUsdRateMicros: card.manualUsdRateMicros,
  };
}

export type RewardEntryView = {
  readonly transactionId: string;
  readonly description: string;
  readonly occurredOn: LocalDate;
  readonly competence: Competence;
  readonly amountCents: number;
  readonly pointsMilli: number;
  readonly cashbackCents: number;
  readonly usdRateMicros: number;
  readonly settled: boolean;
};

export type RedemptionView = {
  readonly id: string;
  readonly kind: "points" | "cashback";
  readonly amount: number;
  readonly redeemedOn: LocalDate;
  readonly note: string | null;
};

export type CardRewardsView = {
  readonly cardId: string;
  readonly cardName: string;
  readonly config: RewardConfig;
  readonly balance: RewardBalance;
  readonly currentRateMicros: number | null;
  readonly rateSource: string | null;
  readonly rateStale: boolean;
  readonly entries: readonly RewardEntryView[];
  readonly redemptions: readonly RedemptionView[];
};

export type RewardsView = {
  readonly today: LocalDate;
  readonly cards: readonly CardRewardsView[];
  readonly accounts: readonly { id: string; name: string }[];
};

export async function buildRewardsView(userId: string, now: Date = new Date()): Promise<RewardsView> {
  const today = todayIn(now);
  const database = getDatabase();

  const [cards, cotacao] = await Promise.all([listCards(userId), usdQuote(today, now)]);
  const comRecompensa = cards.filter((card) => card.kind === "credit" && card.rewardMode !== "none");

  if (!comRecompensa.length) {
    const { listAccounts } = await import("../repositories/catalog.ts");
    const accounts = await listAccounts(userId);
    return { today, cards: [], accounts: accounts.map((a) => ({ id: a.id, name: a.name })) };
  }

  const [compras, resgates, contas] = await Promise.all([
    database
      .select({
        id: transactions.id,
        description: transactions.description,
        occurredOn: transactions.occurredOn,
        competence: transactions.competence,
        amountCents: transactions.amountCents,
        cardId: transactions.originCardId,
        pointsMilli: transactions.rewardPointsMilli,
        cashbackCents: transactions.rewardCashbackCents,
        rateMicros: transactions.rewardUsdRateMicros,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          isNull(transactions.deletedAt),
          eq(transactions.kind, "expense"),
          // Parcela futura entra: a compra já foi feita e os pontos vão vir.
          // Só `review` fica de fora — ali o lançamento ainda pode ser
          // descartado, e contar pontos de algo que talvez não exista daria um
          // saldo que some depois.
          inArray(transactions.state, ["confirmed", "planned"]),
        ),
      ),
    database.select().from(rewardRedemptions).where(eq(rewardRedemptions.userId, userId)),
    (await import("../repositories/catalog.ts")).listAccounts(userId),
  ]);

  return {
    today,
    accounts: contas.map((account) => ({ id: account.id, name: account.name })),
    cards: comRecompensa.map((card) => {
      const config = configOf(card);
      const ativa = activeCompetence(card, today);

      const doCartao = compras.filter((compra) => compra.cardId === card.id);
      const entries: RewardEntryView[] = doCartao
        .map((compra) => {
          // Compra antiga sem apuração gravada: apura agora com a cotação
          // guardada nela, ou com a atual. É melhor mostrar uma estimativa do
          // que um zero que o usuário sabe estar errado.
          const apurado =
            compra.pointsMilli !== null || compra.cashbackCents !== null
              ? {
                  pointsMilli: compra.pointsMilli ?? 0,
                  cashbackCents: cents(compra.cashbackCents ?? 0),
                  usdRateMicros: compra.rateMicros ?? 0,
                }
              : earningFor(cents(compra.amountCents), config, cotacao?.rateMicros ?? null);

          return {
            transactionId: compra.id,
            description: compra.description,
            occurredOn: localDate(compra.occurredOn),
            competence: compra.competence as Competence,
            amountCents: compra.amountCents,
            pointsMilli: apurado.pointsMilli,
            cashbackCents: apurado.cashbackCents,
            usdRateMicros: apurado.usdRateMicros,
            settled: (compra.competence as Competence) < ativa,
          };
        })
        .sort((left, right) => right.occurredOn.localeCompare(left.occurredOn));

      const ganhos: EarningRecord[] = entries.map((entry) => ({
        transactionId: entry.transactionId,
        competence: entry.competence,
        pointsMilli: entry.pointsMilli,
        cashbackCents: entry.cashbackCents,
      }));

      const doCartaoResgates = resgates.filter((resgate) => resgate.cardId === card.id);

      return {
        cardId: card.id,
        cardName: card.name,
        config,
        balance: rewardBalance(
          ganhos,
          doCartaoResgates.map((resgate) => ({ id: resgate.id, kind: resgate.kind, amount: resgate.amount })),
          ativa,
          config,
        ),
        currentRateMicros: cotacao?.rateMicros ?? (card.manualUsdRateMicros || null),
        rateSource: cotacao ? cotacao.source : card.manualUsdRateMicros ? "cotação manual do cartão" : null,
        rateStale: cotacao?.stale ?? true,
        entries: entries.slice(0, 30),
        redemptions: doCartaoResgates
          .map((resgate) => ({
            id: resgate.id,
            kind: resgate.kind,
            amount: resgate.amount,
            redeemedOn: localDate(resgate.redeemedOn),
            note: resgate.note,
          }))
          .sort((left, right) => right.redeemedOn.localeCompare(left.redeemedOn)),
      };
    }),
  };
}

/**
 * Apura a recompensa de uma compra no cartão.
 *
 * Chamado no momento em que o lançamento é criado, para a cotação usada ficar
 * congelada junto com ele.
 */
export async function earningForPurchase(
  card: CardRecord,
  amount: Cents,
  now: Date = new Date(),
): Promise<{ pointsMilli: number; cashbackCents: number; usdRateMicros: number } | null> {
  const config = configOf(card);
  if (config.mode === "none") return null;

  const cotacao = await usdQuote(todayIn(now), now);
  const apurado = earningFor(amount, config, cotacao?.rateMicros ?? null);

  return {
    pointsMilli: apurado.pointsMilli,
    cashbackCents: apurado.cashbackCents,
    usdRateMicros: apurado.usdRateMicros,
  };
}

export type RedeemInput = {
  readonly cardId: string;
  readonly kind: "points" | "cashback";
  /** Pontos em milésimos, ou centavos, conforme `kind`. */
  readonly amount: number;
  /** Conta creditada. Obrigatória no cashback. */
  readonly accountId?: string | null;
  readonly redeemedOn?: LocalDate | null;
  readonly note?: string | null;
};

/**
 * Registra um resgate.
 *
 * Cashback vira lançamento de receita: é dinheiro entrando de verdade. Pontos
 * não — eles saem do saldo de recompensa e não tocam o razão.
 */
export async function redeem(
  userId: string,
  input: RedeemInput,
  now: Date = new Date(),
): Promise<{ redemptionId: string; transactionId: string | null }> {
  const card = await findCard(userId, input.cardId);
  if (!card) throw notFound("Cartão", input.cardId);

  const view = await buildRewardsView(userId, now);
  const doCartao = view.cards.find((item) => item.cardId === input.cardId);
  if (!doCartao) throw conflict("Este cartão não acumula recompensas");

  assertRedeemable(doCartao.balance, input.kind, input.amount);

  const redeemedOn = input.redeemedOn ?? todayIn(now);
  const redemptionId = newId(now.getTime());
  let transactionId: string | null = null;

  if (input.kind === "cashback") {
    if (!input.accountId) {
      throw conflict("Escolha a conta que vai receber o cashback");
    }
    const account = await findAccount(userId, input.accountId);
    if (!account) throw notFound("Conta", input.accountId);

    const transaction: Transaction = {
      id: newId(now.getTime() + 1),
      userId,
      kind: "income",
      state: "confirmed",
      source: "manual",
      description: `Cashback ${card.name}`,
      categoryId: null,
      amount: cents(input.amount),
      currency: "BRL",
      occurredOn: redeemedOn,
      origin: accountParty(account.id),
      destination: null,
      competence: competenceOf(redeemedOn),
      tripId: null,
      installmentPlanId: null,
      installmentNumber: null,
      recurrenceId: null,
      notes: input.note ?? null,
    };

    await saveTransactionBatch([{ transaction }]);
    transactionId = transaction.id;
  }

  await getDatabase().insert(rewardRedemptions).values({
    id: redemptionId,
    userId,
    cardId: input.cardId,
    kind: input.kind,
    amount: input.amount,
    accountId: input.accountId ?? null,
    transactionId,
    redeemedOn: redeemedOn as string,
    note: input.note ?? null,
  });

  return { redemptionId, transactionId };
}
