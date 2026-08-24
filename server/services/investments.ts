/**
 * Serviço de investimentos.
 *
 * Investimento é patrimônio, não dinheiro para gastar — por isso fica fora do
 * "livre para gastar" e entra no patrimônio líquido. O rendimento é a
 * diferença entre o valor de mercado informado e o que foi aportado.
 */

import { conflict, notFound } from "../../core/kernel/errors.ts";
import { newId } from "../../core/kernel/id.ts";
import type { Cents } from "../../core/kernel/money.ts";
import { type LocalDate, localDate, todayIn } from "../../core/time/local-date.ts";
import { and, eq } from "drizzle-orm";

import { getDatabase } from "../db/client.ts";
import { investmentMovements, investments } from "../db/schema/index.ts";
import { findAccount, listAccounts } from "../repositories/catalog.ts";

export type AssetClass = "fixed_income" | "variable_income" | "fund" | "crypto" | "real_estate" | "other";
export type Liquidity = "daily" | "scheduled" | "maturity";

export const ASSET_CLASS_LABEL: Record<AssetClass, string> = {
  fixed_income: "Renda fixa",
  variable_income: "Renda variável",
  fund: "Fundo",
  crypto: "Cripto",
  real_estate: "Imóvel",
  other: "Outro",
};

export const LIQUIDITY_LABEL: Record<Liquidity, string> = {
  daily: "Diária",
  scheduled: "Programada",
  maturity: "No vencimento",
};

export type InvestmentView = {
  readonly id: string;
  readonly name: string;
  readonly institution: string;
  readonly assetClass: AssetClass;
  readonly liquidity: Liquidity;
  readonly maturityDate: LocalDate | null;
  readonly principalCents: number;
  readonly currentValueCents: number;
  /** Valor atual menos o que foi aportado. Pode ser negativo. */
  readonly yieldCents: number;
  readonly yieldPercent: number;
  /** Fatia do total investido. */
  readonly sharePercent: number;
  readonly valuedOn: LocalDate | null;
  readonly accountName: string | null;
};

export type InvestmentsView = {
  readonly today: LocalDate;
  readonly investments: readonly InvestmentView[];
  readonly totals: {
    readonly principalCents: number;
    readonly currentValueCents: number;
    readonly yieldCents: number;
    readonly yieldPercent: number;
  };
  readonly byClass: readonly { assetClass: AssetClass; label: string; valueCents: number; percent: number }[];
  readonly accounts: readonly { id: string; name: string }[];
};

export async function buildInvestmentsView(userId: string, now: Date = new Date()): Promise<InvestmentsView> {
  const today = todayIn(now);
  const database = getDatabase();

  const [rows, accounts] = await Promise.all([
    database.select().from(investments).where(eq(investments.userId, userId)),
    listAccounts(userId),
  ]);

  const accountName = new Map(accounts.map((account) => [account.id, account.name]));
  const totalAtual = rows.reduce((soma, row) => soma + row.currentValueCents, 0);
  const totalAportado = rows.reduce((soma, row) => soma + row.principalCents, 0);

  const views: InvestmentView[] = rows
    .map((row) => {
      const rendimento = row.currentValueCents - row.principalCents;
      return {
        id: row.id,
        name: row.name,
        institution: row.institution,
        assetClass: row.assetClass,
        liquidity: row.liquidity,
        maturityDate: row.maturityDate ? localDate(row.maturityDate) : null,
        principalCents: row.principalCents,
        currentValueCents: row.currentValueCents,
        yieldCents: rendimento,
        yieldPercent: row.principalCents > 0 ? (rendimento / row.principalCents) * 100 : 0,
        sharePercent: totalAtual > 0 ? (row.currentValueCents / totalAtual) * 100 : 0,
        valuedOn: row.valuedOn ? localDate(row.valuedOn) : null,
        accountName: row.accountId ? (accountName.get(row.accountId) ?? null) : null,
      };
    })
    .sort((left, right) => right.currentValueCents - left.currentValueCents);

  const porClasse = new Map<AssetClass, number>();
  for (const view of views) {
    porClasse.set(view.assetClass, (porClasse.get(view.assetClass) ?? 0) + view.currentValueCents);
  }

  return {
    today,
    investments: views,
    totals: {
      principalCents: totalAportado,
      currentValueCents: totalAtual,
      yieldCents: totalAtual - totalAportado,
      yieldPercent: totalAportado > 0 ? ((totalAtual - totalAportado) / totalAportado) * 100 : 0,
    },
    byClass: [...porClasse.entries()]
      .sort(([, left], [, right]) => right - left)
      .map(([assetClass, valueCents]) => ({
        assetClass,
        label: ASSET_CLASS_LABEL[assetClass],
        valueCents,
        percent: totalAtual > 0 ? (valueCents / totalAtual) * 100 : 0,
      })),
    accounts: accounts.map((account) => ({ id: account.id, name: account.name })),
  };
}

export type InvestmentInput = {
  readonly name: string;
  readonly institution?: string | null;
  readonly assetClass?: AssetClass;
  readonly liquidity?: Liquidity;
  readonly maturityDate?: LocalDate | null;
  readonly principal: Cents;
  readonly currentValue?: Cents | null;
  readonly accountId?: string | null;
};

export async function createInvestment(
  userId: string,
  input: InvestmentInput,
  now: Date = new Date(),
): Promise<string> {
  if (input.accountId) {
    const account = await findAccount(userId, input.accountId);
    if (!account) throw notFound("Conta", input.accountId);
  }

  const id = newId(now.getTime());
  const hoje = todayIn(now);

  await getDatabase().insert(investments).values({
    id,
    userId,
    accountId: input.accountId ?? null,
    name: input.name,
    institution: input.institution ?? "",
    assetClass: input.assetClass ?? "fixed_income",
    liquidity: input.liquidity ?? "daily",
    maturityDate: (input.maturityDate ?? null) as string | null,
    principalCents: input.principal as number,
    // Sem valor de mercado informado, ele começa igual ao aporte: dizer que
    // rendeu antes de o usuário informar seria inventar retorno.
    currentValueCents: (input.currentValue ?? input.principal) as number,
    valuedOn: hoje as string,
  });

  // O aporte inicial entra como movimento, para o histórico começar completo.
  await getDatabase().insert(investmentMovements).values({
    id: newId(now.getTime() + 1),
    userId,
    investmentId: id,
    kind: "contribution",
    amountCents: input.principal as number,
    occurredOn: hoje as string,
    note: "Aporte inicial",
  });

  return id;
}

/** Registra aporte, resgate ou rendimento e recalcula o ativo. */
export async function recordMovement(
  userId: string,
  investmentId: string,
  input: { kind: "contribution" | "withdrawal" | "yield"; amount: Cents; occurredOn?: LocalDate | null; note?: string | null },
  now: Date = new Date(),
): Promise<void> {
  const database = getDatabase();
  const [ativo] = await database
    .select()
    .from(investments)
    .where(and(eq(investments.userId, userId), eq(investments.id, investmentId)))
    .limit(1);
  if (!ativo) throw notFound("Investimento", investmentId);

  const valor = input.amount as number;
  if (input.kind === "withdrawal" && valor > ativo.currentValueCents) {
    throw conflict("O resgate é maior que o valor atual do investimento", {
      currentValueCents: ativo.currentValueCents,
    });
  }

  // Aporte e resgate mexem no principal; rendimento não — ele muda só o valor
  // de mercado, senão o retorno calculado se anularia sozinho.
  const principal =
    input.kind === "contribution"
      ? ativo.principalCents + valor
      : input.kind === "withdrawal"
        ? ativo.principalCents - valor
        : ativo.principalCents;

  const atual =
    input.kind === "withdrawal" ? ativo.currentValueCents - valor : ativo.currentValueCents + valor;

  await database.batch([
    database.insert(investmentMovements).values({
      id: newId(now.getTime()),
      userId,
      investmentId,
      kind: input.kind,
      amountCents: valor,
      occurredOn: (input.occurredOn ?? todayIn(now)) as string,
      note: input.note ?? null,
    }),
    database
      .update(investments)
      .set({
        principalCents: Math.max(0, principal),
        currentValueCents: Math.max(0, atual),
        valuedOn: todayIn(now) as string,
        updatedAt: now.toISOString(),
      })
      .where(and(eq(investments.userId, userId), eq(investments.id, investmentId))),
  ] as never);
}

/** Atualiza o valor de mercado informado pelo usuário. */
export async function revalue(
  userId: string,
  investmentId: string,
  currentValue: Cents,
  now: Date = new Date(),
): Promise<void> {
  const database = getDatabase();
  const [ativo] = await database
    .select({ id: investments.id })
    .from(investments)
    .where(and(eq(investments.userId, userId), eq(investments.id, investmentId)))
    .limit(1);
  if (!ativo) throw notFound("Investimento", investmentId);

  await database
    .update(investments)
    .set({
      currentValueCents: currentValue as number,
      valuedOn: todayIn(now) as string,
      updatedAt: now.toISOString(),
    })
    .where(and(eq(investments.userId, userId), eq(investments.id, investmentId)));
}
