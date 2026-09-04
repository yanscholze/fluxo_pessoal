/**
 * Conciliação de recebimento: da notificação à baixa.
 *
 * Roda depois que uma captura entra na fila. Junta o que o usuário apontou —
 * quem paga o quê — com o que está em aberto, e pergunta ao domínio o que
 * fazer. O domínio decide; este módulo só executa.
 *
 * A régua está em `core/domain/capture/reconcile.ts` e é severa de propósito:
 * **só nome equivalente e valor idêntico, com um único candidato, vira baixa
 * automática**. Todo o resto vira sugestão na fila, com o candidato apontado e
 * o motivo registrado.
 *
 * A assimetria que justifica isso: sugestão errada custa um toque; baixa errada
 * registra dinheiro de um cliente no projeto de outro, some de "a receber" e só
 * aparece meses depois.
 */

import { and, eq, isNull } from "drizzle-orm";

import {
  type IncomingReceipt,
  type KnownSubscription,
  type ReceiptCandidate,
  matchReceipt,
  matchSubscription,
} from "../../core/domain/capture/reconcile.ts";
import { conflict, notFound, validationError } from "../../core/kernel/errors.ts";
import { newId } from "../../core/kernel/id.ts";
import { cents } from "../../core/kernel/money.ts";
import type { LocalDate } from "../../core/time/local-date.ts";
import { getDatabase } from "../db/client.ts";
import {
  accounts,
  captureEvents,
  captureReconciliations,
  projectPayments,
  projects,
  receiptRules,
  recurrences,
} from "../db/schema/index.ts";
import { recordTransaction } from "./transactions.ts";
import { receivePayment } from "./work.ts";

// ---------------------------------------------------------------------------
// As regras: quem paga o quê
// ---------------------------------------------------------------------------

export type ReceiptRuleInput = {
  readonly payerName: string;
  readonly target: "project" | "salary" | "benefit";
  /** Só para alvo `project`. Sem ele, vale para qualquer projeto do usuário. */
  readonly projectId?: string | null;
  readonly accountId: string;
  readonly categoryId?: string | null;
};

/**
 * Cadastra um pagador reconhecido.
 *
 * É o que substitui montar uma automação por evento: o usuário diz "quem me
 * paga é a Acme" uma vez, e o recebimento passa a ser reconhecido — sem regra
 * de recorrência, sem agendamento, sem data esperada.
 */
export async function createReceiptRule(
  userId: string,
  input: ReceiptRuleInput,
  now: Date = new Date(),
): Promise<string> {
  const nome = input.payerName.trim();
  if (nome.length < 3) {
    throw validationError("Informe o nome de quem paga", [
      { path: "payerName", message: "Use ao menos três caracteres" },
    ]);
  }

  const database = getDatabase();

  const [conta] = await database
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.id, input.accountId)))
    .limit(1);
  if (!conta) throw notFound("Conta", input.accountId);

  if (input.projectId) {
    const [projeto] = await database
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.userId, userId), eq(projects.id, input.projectId)))
      .limit(1);
    if (!projeto) throw notFound("Projeto", input.projectId);
  }

  const id = newId(now.getTime());
  await database.insert(receiptRules).values({
    id,
    userId,
    payerName: nome,
    target: input.target,
    projectId: input.projectId ?? null,
    accountId: input.accountId,
    categoryId: input.categoryId ?? null,
  });

  return id;
}

export async function listReceiptRules(userId: string) {
  return getDatabase()
    .select()
    .from(receiptRules)
    .where(eq(receiptRules.userId, userId))
    .orderBy(receiptRules.payerName);
}

export async function setReceiptRuleActive(
  userId: string,
  ruleId: string,
  isActive: boolean,
  now: Date = new Date(),
): Promise<void> {
  const database = getDatabase();
  const [existente] = await database
    .select({ id: receiptRules.id })
    .from(receiptRules)
    .where(and(eq(receiptRules.userId, userId), eq(receiptRules.id, ruleId)))
    .limit(1);
  if (!existente) throw notFound("Regra de recebimento", ruleId);

  await database
    .update(receiptRules)
    .set({ isActive, updatedAt: now.toISOString() })
    .where(and(eq(receiptRules.userId, userId), eq(receiptRules.id, ruleId)));
}

export async function removeReceiptRule(userId: string, ruleId: string): Promise<boolean> {
  const database = getDatabase();
  const [existente] = await database
    .select({ id: receiptRules.id })
    .from(receiptRules)
    .where(and(eq(receiptRules.userId, userId), eq(receiptRules.id, ruleId)))
    .limit(1);
  if (!existente) return false;

  await database
    .delete(receiptRules)
    .where(and(eq(receiptRules.userId, userId), eq(receiptRules.id, ruleId)));
  return true;
}

/** Uma captura recém-entrada, do jeito que a conciliação precisa dela. */
export type CaptureToReconcile = {
  readonly id: string;
  readonly kind: "expense" | "income";
  readonly merchant: string | null;
  readonly amountCents: number;
  readonly occurredOn: LocalDate;
};

export type ReconcileResult = {
  /** Quantas viraram lançamento sozinhas. */
  readonly settled: number;
  /** Quantas ganharam sugestão e esperam decisão. */
  readonly suggested: number;
  /** Quantas foram reconhecidas como assinatura e saíram da fila. */
  readonly subscriptions: number;
};

/**
 * Monta os candidatos a partir do que o usuário cadastrou.
 *
 * Uma regra de projeto vira **um candidato por parcela em aberto** — é o que
 * dá valor esperado para conferir, e portanto o único caminho para a baixa
 * automática. Salário e benefício viram um candidato sem valor esperado, o que
 * pelo desenho do domínio garante que nunca sejam automáticos.
 */
async function candidatesFor(userId: string): Promise<ReceiptCandidate[]> {
  const database = getDatabase();

  const regras = await database
    .select()
    .from(receiptRules)
    .where(and(eq(receiptRules.userId, userId), eq(receiptRules.isActive, true)));

  if (!regras.length) return [];

  const candidatos: ReceiptCandidate[] = [];

  for (const regra of regras) {
    if (regra.target !== "project") {
      candidatos.push({
        target: { kind: regra.target },
        ruleId: regra.id,
        payerName: regra.payerName,
        // Salário e benefício variam — e sem valor esperado o domínio nunca
        // dá baixa sozinho, que é exatamente o que se quer aqui.
        expectedAmount: null,
        dueOn: null,
        accountId: regra.accountId,
        categoryId: regra.categoryId,
      });
      continue;
    }

    const parcelas = await database
      .select({
        id: projectPayments.id,
        projectId: projectPayments.projectId,
        projectName: projects.name,
        amountCents: projectPayments.amountCents,
        dueOn: projectPayments.dueOn,
      })
      .from(projectPayments)
      .innerJoin(projects, eq(projects.id, projectPayments.projectId))
      .where(
        and(
          eq(projectPayments.userId, userId),
          // Só o que ainda não foi recebido: dar baixa de novo numa parcela
          // quitada duplicaria a receita no razão.
          isNull(projectPayments.receivedOn),
          ...(regra.projectId ? [eq(projectPayments.projectId, regra.projectId)] : []),
        ),
      );

    for (const parcela of parcelas) {
      candidatos.push({
        target: {
          kind: "project",
          paymentId: parcela.id,
          projectId: parcela.projectId,
          projectName: parcela.projectName,
        },
        ruleId: regra.id,
        payerName: regra.payerName,
        expectedAmount: cents(parcela.amountCents),
        dueOn: parcela.dueOn as LocalDate,
        accountId: regra.accountId,
        categoryId: regra.categoryId,
      });
    }
  }

  return candidatos;
}

/**
 * Concilia as capturas de receita que ainda não foram conciliadas.
 *
 * Despesa não passa por aqui: o que se concilia é dinheiro que **entra** contra
 * o que se espera receber. Uma compra não paga parcela de ninguém.
 */
export async function reconcileCaptures(
  userId: string,
  capturas: readonly CaptureToReconcile[],
  now: Date = new Date(),
): Promise<ReconcileResult> {
  // Despesas: o que interessa é reconhecer assinatura, para tirá-la da fila.
  const subscriptions = await routeSubscriptionCharges(
    userId,
    capturas.filter((captura) => captura.kind === "expense"),
  );

  const receitas = capturas.filter((captura) => captura.kind === "income");
  if (!receitas.length) return { settled: 0, suggested: 0, subscriptions };

  const candidatos = await candidatesFor(userId);
  if (!candidatos.length) return { settled: 0, suggested: 0, subscriptions };

  const database = getDatabase();
  let settled = 0;
  let suggested = 0;

  for (const captura of receitas) {
    const recebimento: IncomingReceipt = {
      payer: captura.merchant,
      amount: cents(captura.amountCents),
    };

    const decisao = matchReceipt(recebimento, candidatos);
    if (decisao.kind === "none") continue;

    const alvo = decisao.candidate.target;
    const ruleId = decisao.candidate.ruleId;

    if (decisao.kind === "exact" && alvo.kind === "project") {
      // Baixa de verdade: cria a receita no razão e marca a parcela, pelo mesmo
      // serviço que a tela do projeto usa. Uma segunda implementação aqui
      // divergiria da primeira no primeiro ajuste.
      await receivePayment(
        userId,
        alvo.paymentId,
        {
          accountId: decisao.candidate.accountId,
          receivedOn: captura.occurredOn,
          categoryId: decisao.candidate.categoryId,
          // Idêntico ao combinado por definição — a baixa automática só acontece
          // quando os valores batem. Passar mesmo assim mantém uma origem só.
          amount: cents(captura.amountCents),
        },
        now,
      );

      await database
        .update(captureEvents)
        .set({ status: "confirmado" })
        .where(and(eq(captureEvents.userId, userId), eq(captureEvents.id, captura.id)));

      await registrar(userId, captura.id, ruleId, alvo, "exact", null, now);
      settled += 1;
      continue;
    }

    // Tudo o mais fica na fila, com o candidato apontado.
    await registrar(
      userId,
      captura.id,
      ruleId,
      alvo,
      "suggested",
      decisao.kind === "suggested" ? decisao.reason : null,
      now,
    );
    suggested += 1;
  }

  if (settled + suggested > 0) {
    await database
      .update(receiptRules)
      .set({ lastMatchedAt: now.toISOString() })
      .where(and(eq(receiptRules.userId, userId), eq(receiptRules.isActive, true)));
  }

  return { settled, suggested, subscriptions };
}

/**
 * Tira da fila as cobranças que são de assinatura conhecida.
 *
 * Não cria lançamento nem confirma nada: só reclassifica a captura, para que
 * ela apareça na aba de Assinaturas em vez da fila de revisão. Nenhuma decisão
 * sobre dinheiro é tomada aqui — é por isso que a régua de reconhecimento pode
 * ser mais frouxa que a da baixa automática.
 */
async function routeSubscriptionCharges(
  userId: string,
  despesas: readonly CaptureToReconcile[],
): Promise<number> {
  if (!despesas.length) return 0;

  const database = getDatabase();
  const linhas = await database
    .select({
      recurrenceId: recurrences.id,
      description: recurrences.description,
      amountCents: recurrences.amountCents,
      cardId: recurrences.cardId,
    })
    .from(recurrences)
    .where(
      and(
        eq(recurrences.userId, userId),
        eq(recurrences.role, "subscription"),
        eq(recurrences.isActive, true),
      ),
    );

  if (!linhas.length) return 0;

  const assinaturas: KnownSubscription[] = linhas.map((linha) => ({
    recurrenceId: linha.recurrenceId,
    description: linha.description,
    amount: cents(linha.amountCents),
    cardId: linha.cardId,
  }));

  let reconhecidas = 0;

  for (const captura of despesas) {
    const assinatura = matchSubscription(
      { merchant: captura.merchant, amount: cents(captura.amountCents) },
      assinaturas,
    );
    if (!assinatura) continue;

    await database
      .update(captureEvents)
      .set({ status: "assinatura", subscriptionId: assinatura.recurrenceId })
      .where(and(eq(captureEvents.userId, userId), eq(captureEvents.id, captura.id)));

    reconhecidas += 1;
  }

  return reconhecidas;
}

async function registrar(
  userId: string,
  captureEventId: string,
  ruleId: string,
  alvo: ReceiptCandidate["target"],
  outcome: "exact" | "suggested",
  reason: "valor_diferente" | "sem_valor_esperado" | "varios_candidatos" | null,
  now: Date,
): Promise<void> {
  await getDatabase()
    .insert(captureReconciliations)
    .values({
      captureEventId,
      userId,
      ruleId,
      target: alvo.kind,
      paymentId: alvo.kind === "project" ? alvo.paymentId : null,
      outcome,
      reason,
      createdAt: now.toISOString(),
    })
    .onConflictDoNothing();
}

/**
 * Confirma uma sugestão de conciliação.
 *
 * É o caminho do "sim" na fila de revisão. Para projeto, dá baixa na parcela;
 * para salário e benefício, cria a receita — que é o que a regra prometeu ao
 * usuário quando ele apontou o pagador.
 */
export async function acceptReconciliation(
  userId: string,
  captureEventId: string,
  now: Date = new Date(),
): Promise<{ transactionId: string }> {
  const database = getDatabase();

  // Colunas explícitas, e não as duas tabelas inteiras: num `join`, `user_id`,
  // `created_at` e `id` existem nas duas, e a linha achatada faz uma sobrescrever
  // a outra. O sintoma é um campo virar `undefined` sem erro nenhum.
  const [linha] = await database
    .select({
      ruleId: captureReconciliations.ruleId,
      target: captureReconciliations.target,
      paymentId: captureReconciliations.paymentId,
      status: captureEvents.status,
      description: captureEvents.description,
      amountCents: captureEvents.amountCents,
      occurredOn: captureEvents.occurredOn,
    })
    .from(captureReconciliations)
    .innerJoin(captureEvents, eq(captureEvents.id, captureReconciliations.captureEventId))
    .where(
      and(
        eq(captureReconciliations.userId, userId),
        eq(captureReconciliations.captureEventId, captureEventId),
      ),
    )
    .limit(1);

  if (!linha) throw notFound("Conciliação", captureEventId);
  if (linha.status !== "pendente") {
    throw conflict("Esta captura já foi resolvida", { status: linha.status });
  }

  const regra = linha.ruleId
    ? (
        await database
          .select()
          .from(receiptRules)
          .where(and(eq(receiptRules.userId, userId), eq(receiptRules.id, linha.ruleId)))
          .limit(1)
      )[0]
    : null;

  // Sem regra não há conta de destino, e criar receita sem conta produziria
  // lançamento órfão. Acontece quando a regra é apagada depois da sugestão.
  if (!regraValida(regra)) {
    throw conflict("A regra que reconheceu este recebimento não existe mais");
  }

  const ocorridoEm = linha.occurredOn as LocalDate;

  if (linha.target === "project" && linha.paymentId) {
    const { transactionId } = await receivePayment(
      userId,
      linha.paymentId,
      {
        accountId: regra.accountId,
        receivedOn: ocorridoEm,
        categoryId: regra.categoryId,
        // O que entrou, não o que foi combinado: a sugestão existe justamente
        // porque os dois podem divergir, e é o extrato que manda no razão.
        amount: cents(linha.amountCents),
      },
      now,
    );

    await marcarConfirmada(userId, captureEventId, transactionId);
    return { transactionId };
  }

  // Salário e benefício: receita comum, na conta que a regra aponta.
  const { ids } = await recordTransaction(
    userId,
    {
      kind: "income",
      description: linha.description,
      amount: cents(linha.amountCents),
      occurredOn: ocorridoEm,
      accountId: regra.accountId,
      categoryId: regra.categoryId,
      state: "confirmed",
    },
    now,
  );

  await marcarConfirmada(userId, captureEventId, ids[0]);
  return { transactionId: ids[0] };
}

async function marcarConfirmada(userId: string, captureEventId: string, transactionId: string) {
  await getDatabase()
    .update(captureEvents)
    .set({ status: "confirmado", transactionId })
    .where(and(eq(captureEvents.userId, userId), eq(captureEvents.id, captureEventId)));
}

/** Estreita o tipo e recusa a sugestão cuja regra foi apagada. */
function regraValida(
  regra: typeof receiptRules.$inferSelect | null | undefined,
): regra is typeof receiptRules.$inferSelect {
  return Boolean(regra);
}
