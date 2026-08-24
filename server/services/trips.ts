/**
 * Modo viagem.
 *
 * A viagem é uma **etiqueta** sobre lançamentos: não muda conta, fatura nem
 * categoria. A conversão para a moeda do destino é informativa — os saldos
 * continuam em reais, e fingir o contrário criaria patrimônio que não existe.
 */

import { CONSUMPTION } from "../../core/domain/ledger/balance.ts";
import { conflict, notFound, validationError } from "../../core/kernel/errors.ts";
import { newId } from "../../core/kernel/id.ts";
import { type LocalDate, localDate, todayIn } from "../../core/time/local-date.ts";
import { and, eq } from "drizzle-orm";

import { getDatabase } from "../db/client.ts";
import { transactions, trips } from "../db/schema/index.ts";
import { listCategories } from "../repositories/catalog.ts";
import { loadLedger, transactionIndex } from "../repositories/ledger.ts";

export type TripStatus = "planejada" | "em_andamento" | "concluida";

export type TripView = {
  readonly id: string;
  readonly name: string;
  readonly startDate: LocalDate;
  readonly endDate: LocalDate;
  readonly currency: string;
  /** Quantos reais vale uma unidade da moeda do destino. */
  readonly exchangeRate: number;
  readonly status: TripStatus;
  readonly totalCents: number;
  /** Total convertido para a moeda do destino. */
  readonly totalInCurrency: number;
  readonly transactionCount: number;
  readonly averageCents: number;
  readonly byCategory: readonly { name: string; color: string; amountCents: number; percent: number }[];
  readonly entries: readonly {
    transactionId: string;
    description: string;
    occurredOn: LocalDate;
    amountCents: number;
    categoryName: string | null;
  }[];
};

export type TripsView = {
  readonly today: LocalDate;
  readonly trips: readonly TripView[];
};

function statusOf(start: LocalDate, end: LocalDate, today: LocalDate): TripStatus {
  if (today < start) return "planejada";
  if (today > end) return "concluida";
  return "em_andamento";
}

export async function buildTripsView(userId: string, now: Date = new Date()): Promise<TripsView> {
  const today = todayIn(now);
  const database = getDatabase();

  const [rows, entries, index, categories] = await Promise.all([
    database.select().from(trips).where(eq(trips.userId, userId)),
    loadLedger(userId),
    transactionIndex(userId),
    listCategories(userId),
  ]);

  // Que lançamento pertence a que viagem: o razão não carrega a etiqueta, ela
  // vive no lançamento.
  const tripByTransaction = new Map(
    (
      await database
        .select({ id: transactions.id, tripId: transactions.tripId, occurredOn: transactions.occurredOn })
        .from(transactions)
        .where(eq(transactions.userId, userId))
    )
      .filter((row) => row.tripId)
      .map((row) => [row.id, { tripId: row.tripId as string, occurredOn: localDate(row.occurredOn) }]),
  );

  const categoryByName = new Map(categories.map((category) => [category.id, category]));

  return {
    today,
    trips: rows
      .map((row) => {
        const doDestino = [...tripByTransaction.entries()].filter(([, item]) => item.tripId === row.id);
        const idsDaViagem = new Set(doDestino.map(([id]) => id));

        const gastos = entries.filter(
          (entry) =>
            idsDaViagem.has(entry.transactionId) &&
            entry.state === "confirmed" &&
            entry.amount < 0 &&
            CONSUMPTION.includes(entry.kind),
        );

        const total = gastos.reduce((soma, entry) => soma - entry.amount, 0);
        const porCategoria = new Map<string | null, number>();
        for (const entry of gastos) {
          const categoryId = index.get(entry.transactionId)?.categoryId ?? null;
          porCategoria.set(categoryId, (porCategoria.get(categoryId) ?? 0) - entry.amount);
        }

        const cotacao = row.exchangeRateMicros / 1_000_000;

        return {
          id: row.id,
          name: row.name,
          startDate: localDate(row.startDate),
          endDate: localDate(row.endDate),
          currency: row.currency,
          exchangeRate: cotacao,
          status: statusOf(localDate(row.startDate), localDate(row.endDate), today),
          totalCents: total,
          totalInCurrency: cotacao > 0 ? total / 100 / cotacao : 0,
          transactionCount: gastos.length,
          averageCents: gastos.length ? Math.round(total / gastos.length) : 0,
          byCategory: [...porCategoria.entries()]
            .sort(([, left], [, right]) => right - left)
            .map(([categoryId, amountCents]) => {
              const category = categoryId ? categoryByName.get(categoryId) : undefined;
              return {
                name: category?.name ?? "Sem categoria",
                color: category?.color ?? "#6b7280",
                amountCents,
                percent: total > 0 ? (amountCents / total) * 100 : 0,
              };
            }),
          entries: gastos
            .map((entry) => ({
              transactionId: entry.transactionId,
              description: index.get(entry.transactionId)?.description ?? "Lançamento",
              occurredOn: entry.effectiveOn,
              amountCents: -entry.amount,
              categoryName:
                categoryByName.get(index.get(entry.transactionId)?.categoryId ?? "")?.name ?? null,
            }))
            .sort((left, right) => right.occurredOn.localeCompare(left.occurredOn))
            .slice(0, 20),
        };
      })
      .sort((left, right) => right.startDate.localeCompare(left.startDate)),
  };
}

export type TripInput = {
  readonly name: string;
  readonly startDate: LocalDate;
  readonly endDate: LocalDate;
  readonly currency: string;
  /** Quantos reais vale uma unidade da moeda. */
  readonly exchangeRate: number;
};

export async function createTrip(userId: string, input: TripInput, now: Date = new Date()): Promise<string> {
  if (input.endDate < input.startDate) {
    throw validationError("A data de volta não pode ser anterior à de ida", [
      { path: "endDate", message: "Informe uma data igual ou posterior à ida" },
    ]);
  }
  if (!/^[A-Za-z]{3}$/.test(input.currency)) {
    throw validationError("Informe a moeda em três letras", [
      { path: "currency", message: "Ex.: USD, EUR, JPY" },
    ]);
  }
  if (!Number.isFinite(input.exchangeRate) || input.exchangeRate <= 0) {
    throw validationError("A cotação precisa ser maior que zero", [
      { path: "exchangeRate", message: "Quantos reais vale uma unidade da moeda" },
    ]);
  }

  const id = newId(now.getTime());
  await getDatabase().insert(trips).values({
    id,
    userId,
    name: input.name,
    startDate: input.startDate as string,
    endDate: input.endDate as string,
    currency: input.currency.toUpperCase(),
    exchangeRateMicros: Math.round(input.exchangeRate * 1_000_000),
  });

  return id;
}

export async function removeTrip(userId: string, tripId: string): Promise<void> {
  const database = getDatabase();
  const [existing] = await database
    .select({ id: trips.id })
    .from(trips)
    .where(and(eq(trips.userId, userId), eq(trips.id, tripId)))
    .limit(1);
  if (!existing) throw notFound("Viagem", tripId);

  const [comLancamento] = await database
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.tripId, tripId)))
    .limit(1);
  if (comLancamento) {
    throw conflict("Há lançamentos etiquetados nesta viagem. Remova a etiqueta antes de excluí-la.");
  }

  await database.delete(trips).where(and(eq(trips.userId, userId), eq(trips.id, tripId)));
}
