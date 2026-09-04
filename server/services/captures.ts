/**
 * Serviço de captura por notificação.
 *
 * O aparelho envia lotes de notificações; o servidor decide o que vira
 * sugestão. Nada entra no razão até o usuário confirmar — uma leitura errada
 * que virasse lançamento direto corromperia o saldo sem deixar rastro de onde
 * veio.
 */

import { competenceForPurchase } from "../../core/domain/card/invoice-cycle.ts";
import { guessCategory } from "../../core/domain/capture/categorize.ts";
import {
  type CapturedDraft,
  type IgnoreReason,
  type NotificationEvent,
  type RecentCapture,
  captureNotification,
  normalize,
} from "../../core/domain/capture/notification.ts";
import { accountParty, cardParty, type Party, type Transaction } from "../../core/domain/ledger/types.ts";
import { conflict, notFound } from "../../core/kernel/errors.ts";
import { newId } from "../../core/kernel/id.ts";
import { type Cents, cents } from "../../core/kernel/money.ts";
import { type Competence, competenceOf } from "../../core/time/competence.ts";
import { type LocalDate, localDate, todayIn } from "../../core/time/local-date.ts";
import { and, desc, eq, gte } from "drizzle-orm";

import { getDatabase } from "../db/client.ts";
import {
  captureEvents,
  captureReconciliations,
  captureSources,
  projectPayments,
  projects,
} from "../db/schema/index.ts";
import { reconcileCaptures } from "./reconciliation.ts";
import { findAccount, findCard, listAccounts, listCards, listCategories } from "../repositories/catalog.ts";
import { ensureInvoices } from "../repositories/invoices.ts";
import { saveTransactionBatch } from "../repositories/ledger.ts";
import { earningForPurchase } from "./rewards.ts";

/** Janela consultada para a checagem de duplicidade. */
const RECENT_WINDOW_MS = 6 * 60 * 60 * 1000;
/** Teto de notificações por lote. O aparelho fatia se tiver mais. */
export const MAX_BATCH = 100;

export type IncomingNotification = NotificationEvent & {
  /** Identidade da notificação no aparelho, para o reenvio não duplicar. */
  readonly deviceEventId?: string | null;
};

export type IngestResult = {
  /** Recebimentos que a conciliação deu baixa sozinha. */
  readonly settled?: number;
  /** Recebimentos com sugestão esperando decisão na fila. */
  readonly suggested?: number;
  /** Cobranças reconhecidas como assinatura, que não entram na fila. */
  readonly subscriptions?: number;
  readonly captured: number;
  readonly ignored: number;
  readonly duplicated: number;
  readonly reasons: Readonly<Partial<Record<IgnoreReason, number>>>;
};

/**
 * Recebe um lote do aparelho.
 *
 * Devolve o que aconteceu com cada notificação para o app poder mostrar ao
 * usuário por que uma compra não apareceu — silêncio aqui vira "o Fluxo não
 * pegou minha compra" sem explicação.
 */
export async function ingest(
  userId: string,
  events: readonly IncomingNotification[],
  now: Date = new Date(),
): Promise<IngestResult> {
  if (events.length > MAX_BATCH) {
    throw conflict(`Envie no máximo ${MAX_BATCH} notificações por vez`, { received: events.length });
  }

  const database = getDatabase();
  const regras = await database.select().from(captureSources).where(eq(captureSources.userId, userId));

  // Índice por nome normalizado: o palpite do domínio vem como rótulo, e o
  // usuário pode ter renomeado a categoria. Sem equivalente, não há palpite.
  const catalogo = await listCategories(userId);
  const porNome = new Map(catalogo.map((categoria) => [normalize(categoria.name), categoria.id]));
  const categoriaDe = (rotulo: string) => porNome.get(normalize(rotulo)) ?? null;

  const desde = Math.min(...events.map((item) => item.postedAt), now.getTime()) - RECENT_WINDOW_MS;
  const recentes = await database
    .select({
      amountCents: captureEvents.amountCents,
      merchant: captureEvents.merchant,
      postedAt: captureEvents.postedAt,
    })
    .from(captureEvents)
    .where(and(eq(captureEvents.userId, userId), gte(captureEvents.postedAt, desde)));

  // A janela cresce dentro do próprio lote: duas notificações da mesma compra
  // costumam chegar juntas, e conferir só contra o banco não pegaria isso.
  const janela: RecentCapture[] = recentes.map((linha) => ({
    amount: cents(linha.amountCents),
    merchant: linha.merchant,
    postedAt: linha.postedAt,
  }));

  const motivos: Partial<Record<IgnoreReason, number>> = {};
  const novos: (typeof captureEvents.$inferInsert)[] = [];
  let duplicadas = 0;

  for (const evento of [...events].sort((a, b) => a.postedAt - b.postedAt)) {
    const resultado = captureNotification(evento, regras, janela);

    if (resultado.kind === "ignored") {
      motivos[resultado.reason] = (motivos[resultado.reason] ?? 0) + 1;
      if (resultado.reason === "duplicada") duplicadas += 1;
      continue;
    }

    janela.push({
      amount: resultado.draft.amount,
      merchant: resultado.draft.merchant,
      postedAt: resultado.draft.postedAt,
    });
    novos.push(toRow(userId, resultado.draft, evento.deviceEventId ?? null, now, categoriaDe));
  }

  // O índice único por `(user, device_event_id)` absorve o reenvio da fila
  // quando o aparelho reconecta. Contamos o que de fato entrou, não o que
  // tentamos inserir: dizer "3 capturadas" quando nada entrou faria o app
  // mostrar um número que não bate com a fila.
  const inseridos = novos.length
    ? await database
        .insert(captureEvents)
        .values(novos)
        .onConflictDoNothing()
        .returning({
          id: captureEvents.id,
          kind: captureEvents.kind,
          merchant: captureEvents.merchant,
          amountCents: captureEvents.amountCents,
          occurredOn: captureEvents.occurredOn,
        })
    : [];

  /**
   * Conciliação, depois da fila.
   *
   * Roda sobre o que **de fato** entrou, não sobre o que se tentou inserir: o
   * reenvio da fila quando o aparelho reconecta traz tudo de novo, e conciliar
   * o que já estava lá daria baixa duas vezes na mesma parcela.
   *
   * Falhar aqui não derruba a captura. A sugestão é comodidade; a fila é o
   * produto. Perder uma conciliação custa um lançamento manual — perder a
   * notificação custa o registro inteiro.
   */
  const conciliacao = await reconcileCaptures(
    userId,
    inseridos.map((linha) => ({
      id: linha.id,
      kind: linha.kind,
      merchant: linha.merchant,
      amountCents: linha.amountCents,
      occurredOn: linha.occurredOn as LocalDate,
    })),
    now,
  ).catch(() => ({ settled: 0, suggested: 0, subscriptions: 0 }));

  return {
    captured: inseridos.length,
    settled: conciliacao.settled,
    suggested: conciliacao.suggested,
    subscriptions: conciliacao.subscriptions,
    ignored: Object.values(motivos).reduce((soma, valor) => soma + valor, 0),
    duplicated: duplicadas,
    reasons: motivos,
  };
}

function toRow(
  userId: string,
  draft: CapturedDraft,
  deviceEventId: string | null,
  now: Date,
  categoriaDe: (rotulo: string) => string | null,
): typeof captureEvents.$inferInsert {
  // O domínio devolve um rótulo canônico; a ponte para a categoria cadastrada
  // é aqui, porque só o serviço conhece o catálogo do usuário. Quem renomeou
  // "Alimentação" para outra coisa simplesmente não recebe palpite, em vez de
  // receber um identificador inválido.
  const palpite = draft.kind === "expense" ? guessCategory(draft.merchant, draft.rawText) : null;
  const categoriaSugerida = palpite ? categoriaDe(palpite.label) : null;

  return {
    id: newId(now.getTime()),
    userId,
    sourceApp: draft.sourceApp,
    rawText: draft.rawText,
    description: draft.description,
    merchant: draft.merchant,
    amountCents: draft.amount as number,
    kind: draft.kind,
    method: draft.method,
    installmentCurrent: draft.installment?.current ?? null,
    installmentTotal: draft.installment?.total ?? null,
    confidenceMilli: Math.round(draft.confidence * 1000),
    suggestedCategoryId: categoriaSugerida,
    categoryConfidenceMilli: categoriaSugerida && palpite ? Math.round(palpite.confidence * 1000) : 0,
    postedAt: draft.postedAt,
    // A data do lançamento é o dia em que a notificação chegou, no fuso de
    // Brasília — não o dia UTC, que viraria o seguinte a partir das 21h.
    occurredOn: todayIn(new Date(draft.postedAt)) as string,
    status: "pendente",
    deviceEventId,
  };
}

export type CaptureView = {
  readonly id: string;
  readonly sourceApp: string;
  readonly sourceLabel: string | null;
  readonly rawText: string;
  readonly description: string;
  readonly merchant: string | null;
  readonly amountCents: number;
  readonly kind: "expense" | "income";
  readonly method: "credit" | "debit" | "cash" | "unknown";
  readonly installment: { current: number; total: number } | null;
  readonly confidencePercent: number;
  /** Palpite de categoria. `null` quando nada casou — e isso é comum. */
  readonly suggestedCategory: { id: string; name: string; confidencePercent: number } | null;
  readonly occurredOn: LocalDate;
  readonly status: "pendente" | "confirmado" | "ignorado" | "duplicado" | "assinatura";
  /**
   * O que a conciliação reconheceu neste recebimento.
   *
   * Só existe em captura de entrada que casou com um pagador cadastrado. O
   * motivo acompanha a sugestão porque é ele que diz o que o usuário precisa
   * conferir: valor diferente do combinado, várias parcelas possíveis, ou
   * simplesmente um pagamento cujo valor ninguém prometeu.
   */
  readonly reconciliation: ReconciliationHint | null;
};

export type ReconciliationHint = {
  readonly target: "project" | "salary" | "benefit";
  readonly outcome: "exact" | "suggested";
  readonly reason: "valor_diferente" | "sem_valor_esperado" | "varios_candidatos" | null;
  readonly projectName: string | null;
  readonly paymentDescription: string | null;
  readonly expectedCents: number | null;
  readonly dueOn: LocalDate | null;
};

export type CapturesView = {
  readonly today: LocalDate;
  readonly pending: readonly CaptureView[];
  readonly recent: readonly CaptureView[];
  readonly sources: readonly {
    id: string;
    sourceApp: string;
    label: string | null;
    action: "allow" | "ignore";
    defaultAccountId: string | null;
    defaultCardId: string | null;
    defaultCategoryId: string | null;
  }[];
  readonly options: {
    readonly accounts: readonly { id: string; name: string }[];
    readonly cards: readonly { id: string; name: string; kind: "credit" | "debit" }[];
    readonly categories: readonly { id: string; name: string; kind: "expense" | "income" }[];
  };
};

const RECENT_LIMIT = 30;

export async function buildCapturesView(userId: string, now: Date = new Date()): Promise<CapturesView> {
  const database = getDatabase();

  const [eventos, conciliacoes, fontes, contas, cartoes, categorias] = await Promise.all([
    database
      .select()
      .from(captureEvents)
      .where(eq(captureEvents.userId, userId))
      .orderBy(desc(captureEvents.postedAt))
      .limit(200),
    // Colunas explícitas: num `join`, `user_id` e `created_at` existem nas duas
    // tabelas, e a linha achatada faz uma sobrescrever a outra sem erro.
    database
      .select({
        captureEventId: captureReconciliations.captureEventId,
        target: captureReconciliations.target,
        outcome: captureReconciliations.outcome,
        reason: captureReconciliations.reason,
        paymentDescription: projectPayments.description,
        expectedCents: projectPayments.amountCents,
        dueOn: projectPayments.dueOn,
        projectName: projects.name,
      })
      .from(captureReconciliations)
      .leftJoin(projectPayments, eq(projectPayments.id, captureReconciliations.paymentId))
      .leftJoin(projects, eq(projects.id, projectPayments.projectId))
      .where(eq(captureReconciliations.userId, userId)),
    database.select().from(captureSources).where(eq(captureSources.userId, userId)),
    listAccounts(userId),
    listCards(userId),
    listCategories(userId),
  ]);

  const rotulo = new Map(fontes.map((fonte) => [fonte.sourceApp, fonte.label]));
  const conciliacaoDe = new Map<string, ReconciliationHint>(
    conciliacoes.map((linha) => [
      linha.captureEventId,
      {
        target: linha.target,
        outcome: linha.outcome,
        reason: linha.reason,
        projectName: linha.projectName,
        paymentDescription: linha.paymentDescription,
        expectedCents: linha.expectedCents,
        dueOn: linha.dueOn ? localDate(linha.dueOn) : null,
      },
    ]),
  );
  const nomeDaCategoria = new Map(categorias.map((categoria) => [categoria.id, categoria.name]));
  const toView = (linha: typeof captureEvents.$inferSelect): CaptureView => ({
    id: linha.id,
    sourceApp: linha.sourceApp,
    sourceLabel: rotulo.get(linha.sourceApp) ?? null,
    rawText: linha.rawText,
    description: linha.description,
    merchant: linha.merchant,
    amountCents: linha.amountCents,
    kind: linha.kind,
    method: linha.method,
    installment:
      linha.installmentCurrent && linha.installmentTotal
        ? { current: linha.installmentCurrent, total: linha.installmentTotal }
        : null,
    confidencePercent: linha.confidenceMilli / 10,
    suggestedCategory:
      linha.suggestedCategoryId && nomeDaCategoria.has(linha.suggestedCategoryId)
        ? {
            id: linha.suggestedCategoryId,
            name: nomeDaCategoria.get(linha.suggestedCategoryId)!,
            confidencePercent: linha.categoryConfidenceMilli / 10,
          }
        : null,
    occurredOn: localDate(linha.occurredOn),
    status: linha.status,
    reconciliation: conciliacaoDe.get(linha.id) ?? null,
  });

  return {
    today: todayIn(now),
    pending: eventos.filter((linha) => linha.status === "pendente").map(toView),
    recent: eventos.filter((linha) => linha.status !== "pendente").slice(0, RECENT_LIMIT).map(toView),
    sources: fontes.map((fonte) => ({
      id: fonte.id,
      sourceApp: fonte.sourceApp,
      label: fonte.label,
      action: fonte.action,
      defaultAccountId: fonte.defaultAccountId,
      defaultCardId: fonte.defaultCardId,
      defaultCategoryId: fonte.defaultCategoryId,
    })),
    options: {
      accounts: contas.map((conta) => ({ id: conta.id, name: conta.name })),
      cards: cartoes.map((cartao) => ({ id: cartao.id, name: cartao.name, kind: cartao.kind })),
      categories: categorias.map((categoria) => ({
        id: categoria.id,
        name: categoria.name,
        kind: categoria.kind,
      })),
    },
  };
}

export type ConfirmInput = {
  readonly accountId?: string | null;
  readonly cardId?: string | null;
  readonly categoryId?: string | null;
  readonly description?: string | null;
  readonly amount?: Cents | null;
  readonly occurredOn?: LocalDate | null;
};

/**
 * Confirma uma sugestão: ela vira lançamento de verdade.
 *
 * O usuário pode corrigir qualquer campo antes — a leitura automática é um
 * rascunho, não um veredito.
 */
export async function confirmCapture(
  userId: string,
  captureId: string,
  input: ConfirmInput,
  now: Date = new Date(),
): Promise<{ transactionId: string; competence: Competence }> {
  const database = getDatabase();
  const [evento] = await database
    .select()
    .from(captureEvents)
    .where(and(eq(captureEvents.userId, userId), eq(captureEvents.id, captureId)))
    .limit(1);

  if (!evento) throw notFound("Sugestão", captureId);
  if (evento.status !== "pendente") throw conflict("Esta sugestão já foi resolvida");

  const origem = await resolveOrigin(userId, evento, input);
  const amount = input.amount ?? cents(evento.amountCents);
  const occurredOn = input.occurredOn ?? localDate(evento.occurredOn);

  const competence =
    origem.card !== null ? competenceForPurchase(origem.card, occurredOn) : competenceOf(occurredOn);

  if (origem.card) {
    await ensureInvoices({
      userId,
      cardId: origem.card.id,
      cycle: origem.card,
      competences: [competence],
    });
  }

  const transaction: Transaction = {
    id: newId(now.getTime()),
    userId,
    kind: evento.kind,
    state: "confirmed",
    source: "capture",
    description: input.description ?? evento.description,
    categoryId: input.categoryId ?? null,
    amount,
    currency: "BRL",
    occurredOn,
    origin: origem.party,
    destination: null,
    competence,
    tripId: null,
    installmentPlanId: null,
    installmentNumber: evento.installmentCurrent,
    recurrenceId: null,
    notes: null,
  };

  const reward = origem.card ? await earningForPurchase(origem.card, amount, now) : null;
  await saveTransactionBatch([{ transaction, options: { deviceId: "capture", reward } }]);

  await database
    .update(captureEvents)
    .set({ status: "confirmado", transactionId: transaction.id })
    .where(and(eq(captureEvents.userId, userId), eq(captureEvents.id, captureId)));

  return { transactionId: transaction.id, competence };
}

async function resolveOrigin(
  userId: string,
  evento: typeof captureEvents.$inferSelect,
  input: ConfirmInput,
): Promise<{ party: Party; card: Awaited<ReturnType<typeof findCard>> }> {
  const fonte = (
    await getDatabase()
      .select()
      .from(captureSources)
      .where(and(eq(captureSources.userId, userId), eq(captureSources.sourceApp, evento.sourceApp)))
      .limit(1)
  )[0];

  // Precedência: o que o usuário escolheu agora, depois o padrão do app.
  // O método lido da notificação só desempata entre os dois padrões.
  const cardId =
    input.cardId ?? (evento.method === "credit" ? (fonte?.defaultCardId ?? null) : null);
  const accountId = input.accountId ?? fonte?.defaultAccountId ?? null;

  if (cardId) {
    const card = await findCard(userId, cardId);
    if (!card) throw notFound("Cartão", cardId);
    if (card.kind !== "credit") throw conflict("Compra no crédito exige um cartão de crédito");
    return { party: cardParty(card.id), card };
  }

  if (!accountId) {
    throw conflict("Escolha a conta ou o cartão deste lançamento");
  }

  const account = await findAccount(userId, accountId);
  if (!account) throw notFound("Conta", accountId);
  return { party: accountParty(account.id), card: null };
}

export async function resolveCapture(
  userId: string,
  captureId: string,
  status: "ignorado" | "duplicado",
): Promise<void> {
  const resultado = await getDatabase()
    .update(captureEvents)
    .set({ status })
    .where(and(eq(captureEvents.userId, userId), eq(captureEvents.id, captureId)));
  void resultado;
}

export type SourceInput = {
  readonly sourceApp: string;
  readonly label?: string | null;
  readonly action: "allow" | "ignore";
  readonly defaultAccountId?: string | null;
  readonly defaultCardId?: string | null;
  readonly defaultCategoryId?: string | null;
};

/** Define o que fazer com um app — e para onde mandar o que vier dele. */
export async function setSource(userId: string, input: SourceInput, now: Date = new Date()): Promise<void> {
  const valores = {
    id: newId(now.getTime()),
    userId,
    sourceApp: input.sourceApp,
    label: input.label ?? null,
    action: input.action,
    defaultAccountId: input.defaultAccountId ?? null,
    defaultCardId: input.defaultCardId ?? null,
    defaultCategoryId: input.defaultCategoryId ?? null,
  };

  await getDatabase()
    .insert(captureSources)
    .values(valores)
    .onConflictDoUpdate({
      target: [captureSources.userId, captureSources.sourceApp],
      set: { ...valores, id: undefined, updatedAt: now.toISOString() },
    });
}
