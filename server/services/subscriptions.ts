/**
 * Assinaturas.
 *
 * Assinatura não é entidade separada: é uma recorrência com papel
 * `subscription`. Criar tabela própria significaria manter duas verdades sobre
 * o mesmo débito mensal, e a mais delicada delas — o agendamento — já é
 * resolvida uma vez em `core/domain/recurrence`.
 *
 * O que este módulo acrescenta é o recorte que só faz sentido para assinatura:
 * a **classificação** (streaming, IA, anuidade do cartão) e o custo por
 * classificação, mensal e anual.
 *
 * O custo anual anda sempre ao lado do mensal, com o mesmo peso. "R$ 89,90 por
 * mês" soa desprezível; "R$ 1.078,80 por ano" é a mesma informação e muda a
 * decisão. Mostrar só o mensal é o que faz assinatura ser o gasto mais fácil de
 * perder de vista.
 */

import { and, desc, eq, isNull } from "drizzle-orm";

import { assertValidSchedule } from "../../core/domain/recurrence/schedule.ts";
import { conflict, notFound, validationError } from "../../core/kernel/errors.ts";
import { newId } from "../../core/kernel/id.ts";
import type { Cents } from "../../core/kernel/money.ts";
import { type Competence, competenceOf } from "../../core/time/competence.ts";
import { type LocalDate, todayIn } from "../../core/time/local-date.ts";
import { getDatabase } from "../db/client.ts";
import { captureEvents, cards, recurrences, subscriptionLabels } from "../db/schema/index.ts";
import { findAccount, findCard } from "../repositories/catalog.ts";

/**
 * Classificações sugeridas na primeira vez.
 *
 * Uma lista vazia obriga a inventar a taxonomia antes de registrar a primeira
 * assinatura — e aí ninguém classifica nada. São sugestões: podem ser
 * renomeadas, apagadas e ampliadas.
 */
const SUGERIDAS: readonly { name: string; color: string }[] = [
  { name: "Streaming", color: "#e11d48" },
  { name: "Inteligência artificial", color: "#8b5cf6" },
  { name: "Anuidade de cartão", color: "#f59e0b" },
  { name: "Software", color: "#2563eb" },
  { name: "Academia e saúde", color: "#16a34a" },
  { name: "Outros", color: "#64748b" },
];

export type LabelView = {
  readonly id: string;
  readonly name: string;
  readonly color: string;
};

export async function listLabels(userId: string): Promise<LabelView[]> {
  const database = getDatabase();
  const linhas = await database
    .select({ id: subscriptionLabels.id, name: subscriptionLabels.name, color: subscriptionLabels.color })
    .from(subscriptionLabels)
    .where(and(eq(subscriptionLabels.userId, userId), isNull(subscriptionLabels.archivedAt)))
    .orderBy(subscriptionLabels.sortOrder, subscriptionLabels.name);

  return linhas;
}

/**
 * Garante que o usuário tenha classificações para escolher.
 *
 * Roda na primeira leitura da tela, não no cadastro do usuário: quem nunca
 * abriu assinaturas não precisa das linhas, e criá-las no cadastro encheria a
 * conta de gente que não usa o módulo.
 */
export async function ensureLabels(userId: string, now: Date = new Date()): Promise<LabelView[]> {
  const existentes = await listLabels(userId);
  if (existentes.length) return existentes;

  const database = getDatabase();
  await database.insert(subscriptionLabels).values(
    SUGERIDAS.map((sugestao, indice) => ({
      id: newId(now.getTime() + indice),
      userId,
      name: sugestao.name,
      color: sugestao.color,
      sortOrder: indice,
    })),
  );

  return listLabels(userId);
}

export async function createLabel(
  userId: string,
  input: { name: string; color?: string | null },
  now: Date = new Date(),
): Promise<string> {
  const nome = input.name.trim();
  if (!nome) {
    throw validationError("Informe o nome da classificação", [
      { path: "name", message: "O nome é obrigatório" },
    ]);
  }

  const existentes = await listLabels(userId);
  if (existentes.some((item) => item.name.toLowerCase() === nome.toLowerCase())) {
    throw conflict("Já existe uma classificação com este nome");
  }

  const id = newId(now.getTime());
  await getDatabase()
    .insert(subscriptionLabels)
    .values({
      id,
      userId,
      name: nome,
      ...(input.color ? { color: input.color } : {}),
      sortOrder: existentes.length,
    });

  return id;
}

export async function archiveLabel(userId: string, labelId: string, now: Date = new Date()): Promise<void> {
  const database = getDatabase();
  const [existente] = await database
    .select({ id: subscriptionLabels.id })
    .from(subscriptionLabels)
    .where(and(eq(subscriptionLabels.userId, userId), eq(subscriptionLabels.id, labelId)))
    .limit(1);
  if (!existente) throw notFound("Classificação", labelId);

  // Arquiva em vez de apagar: as assinaturas que apontam para ela continuariam
  // apontando para nada, e o relatório do mês passado deixaria de fechar.
  await database
    .update(subscriptionLabels)
    .set({ archivedAt: now.toISOString(), updatedAt: now.toISOString() })
    .where(and(eq(subscriptionLabels.userId, userId), eq(subscriptionLabels.id, labelId)));
}

// ---------------------------------------------------------------------------
// A assinatura em si
// ---------------------------------------------------------------------------

export type SubscriptionInput = {
  readonly description: string;
  readonly amount: Cents;
  /** Dia do mês em que é cobrada. */
  readonly scheduleDay: number;
  /** Cartão que será debitado. Exclusivo com `accountId`. */
  readonly cardId?: string | null;
  readonly accountId?: string | null;
  readonly categoryId?: string | null;
  readonly labelId?: string | null;
  readonly interval?: "monthly" | "yearly";
  readonly startsOn?: LocalDate | null;
};

/**
 * Cadastra uma assinatura.
 *
 * Passa pelo serviço de recorrências, que é quem valida agendamento e origem —
 * a assinatura não tem regra própria de quando cobra. O que se acrescenta aqui
 * é a classificação, e a exigência de uma origem: assinatura sem cartão nem
 * conta é um valor que não sai de lugar nenhum.
 */
export async function createSubscription(
  userId: string,
  input: SubscriptionInput,
  now: Date = new Date(),
): Promise<string> {
  if (!input.cardId && !input.accountId) {
    throw validationError("Informe onde a assinatura é cobrada", [
      { path: "cardId", message: "Escolha o cartão ou a conta do débito" },
    ]);
  }

  if (input.labelId) {
    const rotulos = await listLabels(userId);
    if (!rotulos.some((rotulo) => rotulo.id === input.labelId)) {
      throw notFound("Classificação", input.labelId);
    }
  }

  const { createRecurrence } = await import("./recurrences.ts");

  const id = await createRecurrence(
    userId,
    {
      role: "subscription",
      kind: "expense",
      description: input.description,
      amount: input.amount,
      scheduleDay: input.scheduleDay,
      cardId: input.cardId ?? null,
      accountId: input.accountId ?? null,
      categoryId: input.categoryId ?? null,
      interval: input.interval ?? "monthly",
      startsOn: input.startsOn ?? todayIn(now),
    },
    now,
  );

  if (input.labelId) {
    await getDatabase()
      .update(recurrences)
      .set({ subscriptionLabelId: input.labelId, updatedAt: now.toISOString() })
      .where(and(eq(recurrences.userId, userId), eq(recurrences.id, id)));
  }

  return id;
}

export type SubscriptionPatch = {
  readonly description?: string | null;
  readonly amount?: Cents | null;
  readonly scheduleDay?: number | null;
  readonly interval?: "monthly" | "yearly" | null;
  readonly cardId?: string | null;
  readonly accountId?: string | null;
  readonly categoryId?: string | null;
  readonly labelId?: string | null;
  /** Enviado quando o usuário escolheu "sem classificação" de propósito. */
  readonly clearLabel?: boolean;
  readonly clearCategory?: boolean;
};

/**
 * Ajusta uma assinatura já cadastrada.
 *
 * Reajuste de preço é a mudança mais comum e não pode exigir apagar e recriar:
 * recriar perderia a classificação, o cartão e a data — e a assinatura nova
 * apareceria no relatório como se fosse outro serviço.
 *
 * Trocar o cartão limpa a conta, e vice-versa: uma assinatura sai de um lugar
 * só, e deixar os dois preenchidos faria a cobrança contar duas vezes na
 * projeção.
 */
export async function updateSubscription(
  userId: string,
  recurrenceId: string,
  patch: SubscriptionPatch,
  now: Date = new Date(),
): Promise<void> {
  const database = getDatabase();

  const [existente] = await database
    .select({ id: recurrences.id, role: recurrences.role })
    .from(recurrences)
    .where(and(eq(recurrences.userId, userId), eq(recurrences.id, recurrenceId)))
    .limit(1);
  if (!existente) throw notFound("Assinatura", recurrenceId);

  if (patch.labelId) {
    const rotulos = await listLabels(userId);
    if (!rotulos.some((rotulo) => rotulo.id === patch.labelId)) {
      throw notFound("Classificação", patch.labelId);
    }
  }

  if (patch.cardId) {
    const cartao = await findCard(userId, patch.cardId);
    if (!cartao) throw notFound("Cartão", patch.cardId);
    if (cartao.kind !== "credit") {
      throw conflict("Assinatura no crédito exige um cartão de crédito");
    }
  }

  if (patch.accountId) {
    const conta = await findAccount(userId, patch.accountId);
    if (!conta) throw notFound("Conta", patch.accountId);
  }

  if (patch.scheduleDay !== null && patch.scheduleDay !== undefined) {
    assertValidSchedule({ scheduleMode: "day_of_month", scheduleDay: patch.scheduleDay });
  }

  const campos: Record<string, unknown> = { updatedAt: now.toISOString() };
  if (patch.description) campos.description = patch.description.trim();
  if (patch.amount !== null && patch.amount !== undefined) campos.amountCents = patch.amount;
  if (patch.scheduleDay !== null && patch.scheduleDay !== undefined) campos.scheduleDay = patch.scheduleDay;
  if (patch.interval) campos.interval = patch.interval;
  if (patch.cardId) {
    campos.cardId = patch.cardId;
    campos.accountId = null;
  }
  if (patch.accountId) {
    campos.accountId = patch.accountId;
    campos.cardId = null;
  }
  if (patch.categoryId) campos.categoryId = patch.categoryId;
  else if (patch.clearCategory) campos.categoryId = null;
  if (patch.labelId) campos.subscriptionLabelId = patch.labelId;
  else if (patch.clearLabel) campos.subscriptionLabelId = null;

  await database
    .update(recurrences)
    .set(campos)
    .where(and(eq(recurrences.userId, userId), eq(recurrences.id, recurrenceId)));
}

export async function setSubscriptionLabel(
  userId: string,
  recurrenceId: string,
  labelId: string | null,
  now: Date = new Date(),
): Promise<void> {
  const database = getDatabase();
  const [existente] = await database
    .select({ id: recurrences.id })
    .from(recurrences)
    .where(and(eq(recurrences.userId, userId), eq(recurrences.id, recurrenceId)))
    .limit(1);
  if (!existente) throw notFound("Assinatura", recurrenceId);

  await database
    .update(recurrences)
    .set({ subscriptionLabelId: labelId, updatedAt: now.toISOString() })
    .where(and(eq(recurrences.userId, userId), eq(recurrences.id, recurrenceId)));
}

// ---------------------------------------------------------------------------
// O relatório
// ---------------------------------------------------------------------------

export type SubscriptionRow = {
  readonly id: string;
  readonly description: string;
  readonly amountCents: number;
  /** Custo mensal equivalente: a anual dividida por doze. */
  readonly monthlyCents: number;
  readonly yearlyCents: number;
  readonly interval: "monthly" | "yearly";
  readonly scheduleDay: number;
  readonly isActive: boolean;
  readonly cardId: string | null;
  readonly cardName: string | null;
  /** Preenchida quando a cobrança é débito em conta, e não no cartão. */
  readonly accountId: string | null;
  readonly categoryId: string | null;
  readonly label: LabelView | null;
};

export type LabelTotal = {
  readonly label: LabelView | null;
  readonly monthlyCents: number;
  readonly yearlyCents: number;
  readonly count: number;
  readonly sharePercent: number;
};

/**
 * Uma cobrança que a captura reconheceu como sendo de assinatura conhecida.
 *
 * Não vai para a fila de revisão — a assinatura já está cadastrada, e pedir
 * confirmação de uma cobrança esperada seria transformar rotina em tarefa. Mas
 * ela também não pode sumir: é a prova de que a cobrança aconteceu, e é onde se
 * enxerga um reajuste (o valor que chegou não bate com o cadastrado).
 */
export type RecognizedCharge = {
  readonly id: string;
  readonly description: string;
  readonly amountCents: number;
  readonly occurredOn: LocalDate;
  readonly subscriptionId: string | null;
  readonly subscriptionName: string | null;
  /** Valor cadastrado, quando difere do cobrado — indício de reajuste. */
  readonly expectedCents: number | null;
};

export type SubscriptionsReport = {
  readonly competence: Competence;
  readonly subscriptions: readonly SubscriptionRow[];
  readonly byLabel: readonly LabelTotal[];
  readonly byCard: readonly { cardId: string | null; cardName: string; monthlyCents: number }[];
  readonly totals: {
    readonly monthlyCents: number;
    readonly yearlyCents: number;
    readonly activeCount: number;
    readonly pausedCount: number;
  };
  readonly labels: readonly LabelView[];
  /** Cobranças reconhecidas pela captura, da mais recente para a mais antiga. */
  readonly recognized: readonly RecognizedCharge[];
};

/** Quantas cobranças reconhecidas a tela mostra. Além disso vira histórico. */
const RECONHECIDAS = 12;

/**
 * Custo mensal equivalente.
 *
 * A anual entra como um doze avos. Somar o valor cheio de uma anual ao mensal
 * das outras produziria um "gasto do mês" que só é verdade no mês da cobrança —
 * e falso nos outros onze.
 */
function mensalizar(amountCents: number, interval: "monthly" | "yearly"): number {
  return interval === "yearly" ? Math.round(amountCents / 12) : amountCents;
}

export async function buildSubscriptionsReport(
  userId: string,
  now: Date = new Date(),
): Promise<SubscriptionsReport> {
  const database = getDatabase();
  const hoje = todayIn(now);

  const [rotulos, linhas, cartoes, cobrancas] = await Promise.all([
    ensureLabels(userId, now),
    database
      .select({
        id: recurrences.id,
        description: recurrences.description,
        amountCents: recurrences.amountCents,
        interval: recurrences.interval,
        scheduleDay: recurrences.scheduleDay,
        isActive: recurrences.isActive,
        cardId: recurrences.cardId,
        accountId: recurrences.accountId,
        categoryId: recurrences.categoryId,
        labelId: recurrences.subscriptionLabelId,
      })
      .from(recurrences)
      .where(and(eq(recurrences.userId, userId), eq(recurrences.role, "subscription"))),
    database.select({ id: cards.id, name: cards.name }).from(cards).where(eq(cards.userId, userId)),
    database
      .select({
        id: captureEvents.id,
        description: captureEvents.description,
        amountCents: captureEvents.amountCents,
        occurredOn: captureEvents.occurredOn,
        subscriptionId: captureEvents.subscriptionId,
      })
      .from(captureEvents)
      .where(and(eq(captureEvents.userId, userId), eq(captureEvents.status, "assinatura")))
      .orderBy(desc(captureEvents.occurredOn))
      .limit(RECONHECIDAS),
  ]);

  const nomeDoCartao = new Map(cartoes.map((cartao) => [cartao.id, cartao.name]));
  const porId = new Map(rotulos.map((rotulo) => [rotulo.id, rotulo]));

  const subscriptions: SubscriptionRow[] = linhas
    .map((linha) => {
      const mensal = mensalizar(linha.amountCents, linha.interval);
      return {
        id: linha.id,
        description: linha.description,
        amountCents: linha.amountCents,
        monthlyCents: mensal,
        yearlyCents: mensal * 12,
        interval: linha.interval,
        scheduleDay: linha.scheduleDay,
        isActive: linha.isActive,
        cardId: linha.cardId,
        cardName: linha.cardId ? (nomeDoCartao.get(linha.cardId) ?? null) : null,
        accountId: linha.accountId,
        categoryId: linha.categoryId,
        label: linha.labelId ? (porId.get(linha.labelId) ?? null) : null,
      };
    })
    .sort((esquerda, direita) => direita.monthlyCents - esquerda.monthlyCents);

  // Só as ativas somam. Uma assinatura pausada não é gasto, e contá-la faria o
  // total do mês nunca bater com o extrato.
  const ativas = subscriptions.filter((assinatura) => assinatura.isActive);
  const totalMensal = ativas.reduce((soma, assinatura) => soma + assinatura.monthlyCents, 0);

  const agrupado = new Map<string | null, { monthly: number; count: number }>();
  for (const assinatura of ativas) {
    const chave = assinatura.label?.id ?? null;
    const atual = agrupado.get(chave) ?? { monthly: 0, count: 0 };
    agrupado.set(chave, { monthly: atual.monthly + assinatura.monthlyCents, count: atual.count + 1 });
  }

  const byLabel: LabelTotal[] = [...agrupado]
    .map(([id, valores]) => ({
      label: id ? (porId.get(id) ?? null) : null,
      monthlyCents: valores.monthly,
      yearlyCents: valores.monthly * 12,
      count: valores.count,
      sharePercent: totalMensal > 0 ? (valores.monthly / totalMensal) * 100 : 0,
    }))
    .sort((esquerda, direita) => direita.monthlyCents - esquerda.monthlyCents);

  const porCartao = new Map<string | null, number>();
  for (const assinatura of ativas) {
    porCartao.set(assinatura.cardId, (porCartao.get(assinatura.cardId) ?? 0) + assinatura.monthlyCents);
  }

  const porRecorrencia = new Map(subscriptions.map((assinatura) => [assinatura.id, assinatura]));
  const recognized: RecognizedCharge[] = cobrancas.map((cobranca) => {
    const assinatura = cobranca.subscriptionId
      ? (porRecorrencia.get(cobranca.subscriptionId) ?? null)
      : null;
    return {
      id: cobranca.id,
      description: cobranca.description,
      amountCents: cobranca.amountCents,
      occurredOn: cobranca.occurredOn as LocalDate,
      subscriptionId: cobranca.subscriptionId,
      subscriptionName: assinatura?.description ?? null,
      // Só é reajuste se houver o que comparar e os valores divergirem.
      expectedCents:
        assinatura && assinatura.amountCents !== cobranca.amountCents ? assinatura.amountCents : null,
    };
  });

  return {
    competence: competenceOf(hoje),
    subscriptions,
    byLabel,
    byCard: [...porCartao]
      .map(([cardId, monthlyCents]) => ({
        cardId,
        cardName: cardId ? (nomeDoCartao.get(cardId) ?? "Cartão removido") : "Débito em conta",
        monthlyCents,
      }))
      .sort((esquerda, direita) => direita.monthlyCents - esquerda.monthlyCents),
    totals: {
      monthlyCents: totalMensal,
      yearlyCents: totalMensal * 12,
      activeCount: ativas.length,
      pausedCount: subscriptions.length - ativas.length,
    },
    labels: rotulos,
    recognized,
  };
}
