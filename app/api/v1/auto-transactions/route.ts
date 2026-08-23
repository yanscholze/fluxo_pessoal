import { and, desc, eq, gte } from "drizzle-orm";
import { ensureFinanceSchema } from "../../../../db/ensure-schema";
import { getDb } from "../../../../db";
import { establishmentRules, notificationAppRules, pendingAutoTransactions, transactions } from "../../../../db/schema";
import { apiIdentityFrom, apiUnauthorized } from "../../../../lib/api-v1-auth";
import { financePostForOwner } from "../../finance/route";
import {
  DEDUP_WINDOW_MS,
  guessTrustedApp,
  isLikelyDuplicate,
  isWalletPackage,
  normalizeEstablishment,
  parseNotificationText,
} from "../../../../lib/auto-transactions";

const headers = { "cache-control": "no-store", "x-fluxo-api-version": "1" };

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

async function logPending(ownerId: string, values: {
  sourceApp: string; rawText: string; confidence: number; description: string; amountCents: number;
  type: string; occurredAt: string; suggestedCategory?: string | null; suggestedAccount?: string | null;
  cardId?: string | null; reviewStatus: "new" | "ignored" | "duplicate"; ignoreReason?: string | null;
}) {
  const db = getDb();
  const id = newId("pending");
  await db.insert(pendingAutoTransactions).values({
    id, ownerId, sourceApp: values.sourceApp, rawText: values.rawText.slice(0, 2000), confidence: values.confidence,
    description: values.description, amountCents: values.amountCents, type: values.type, occurredAt: values.occurredAt,
    suggestedCategory: values.suggestedCategory ?? null, suggestedAccount: values.suggestedAccount ?? null,
    cardId: values.cardId ?? null, reviewStatus: values.reviewStatus, ignoreReason: values.ignoreReason ?? null,
    createdAt: new Date().toISOString(),
  });
  return id;
}

export async function POST(request: Request) {
  const identity = await apiIdentityFrom(request);
  if (!identity) return apiUnauthorized();
  await ensureFinanceSchema();

  let body: { packageName?: string; sourceApp?: string; rawText?: string; postedAt?: string };
  try { body = await request.json(); } catch { return Response.json({ error: "JSON inválido" }, { status: 400, headers }); }

  const packageName = body.packageName?.trim();
  const rawText = body.rawText?.trim();
  if (!packageName || !rawText) return Response.json({ error: "packageName e rawText são obrigatórios" }, { status: 400, headers });
  const postedAt = body.postedAt && !Number.isNaN(Date.parse(body.postedAt)) ? new Date(body.postedAt) : new Date();
  const ownerId = identity.ownerId;
  const db = getDb();

  // 1. Wallets/reward apps nunca criam lançamento — só ficam no log, sem afetar nada.
  if (isWalletPackage(packageName)) {
    await logPending(ownerId, {
      sourceApp: body.sourceApp || packageName, rawText, confidence: 0, description: rawText.slice(0, 60),
      amountCents: 0, type: "expense", occurredAt: postedAt.toISOString(),
      reviewStatus: "ignored", ignoreReason: "wallet_reward_or_confirmation",
    });
    return Response.json({ status: "ignored", reason: "wallet_reward_or_confirmation" }, { headers });
  }

  // 2. Só apps financeiros confiáveis (ou liberados manualmente) criam lançamento.
  const appRule = (await db.select().from(notificationAppRules).where(and(eq(notificationAppRules.ownerId, ownerId), eq(notificationAppRules.sourceApp, packageName))).limit(1))[0];
  const trustedLabel = guessTrustedApp(packageName);
  const isAllowed = appRule ? appRule.action === "allow" : Boolean(trustedLabel);
  if (!isAllowed) {
    await logPending(ownerId, {
      sourceApp: body.sourceApp || packageName, rawText, confidence: 0, description: rawText.slice(0, 60),
      amountCents: 0, type: "expense", occurredAt: postedAt.toISOString(),
      reviewStatus: "ignored", ignoreReason: "app_not_trusted",
    });
    return Response.json({ status: "ignored", reason: "app_not_trusted" }, { headers });
  }

  // 3. Extrai valor/descrição do texto da notificação.
  const parsed = parseNotificationText(rawText);
  if (!parsed) {
    await logPending(ownerId, {
      sourceApp: packageName, rawText, confidence: 0, description: rawText.slice(0, 60),
      amountCents: 0, type: "expense", occurredAt: postedAt.toISOString(), reviewStatus: "new",
    });
    return Response.json({ status: "pending", reason: "unparsed" }, { headers });
  }

  // 4. Deduplicação: mesmo valor + estabelecimento normalizado + janela de tempo.
  const target = parsed.paymentMethod === "credit"
    ? { cardId: appRule?.cardId ?? undefined, account: undefined as string | undefined }
    : { cardId: undefined as string | undefined, account: appRule?.accountId ?? undefined };
  const windowStart = new Date(postedAt.getTime() - DEDUP_WINDOW_MS).toISOString();
  const recent = await db.select().from(transactions)
    .where(and(eq(transactions.ownerId, ownerId), gte(transactions.updatedAt, windowStart)))
    .orderBy(desc(transactions.updatedAt)).limit(200);
  const duplicate = recent.find((row) => !row.deletedAt && isLikelyDuplicate(
    { description: parsed.description, amount: parsed.amount, date: postedAt.toISOString(), cardId: target.cardId, account: target.account },
    { description: row.description, amount: row.amountCents / 100, date: row.occurredAt, cardId: row.cardId ?? undefined, account: row.account },
    postedAt, new Date(row.occurredAt),
  ));
  if (duplicate) {
    await logPending(ownerId, {
      sourceApp: packageName, rawText, confidence: parsed.confidence, description: parsed.description,
      amountCents: Math.round(parsed.amount * 100), type: parsed.type, occurredAt: postedAt.toISOString(),
      reviewStatus: "duplicate",
    });
    return Response.json({ status: "duplicate", matchedTransactionId: duplicate.id }, { headers });
  }

  // 5. Categoria fixa por estabelecimento, se o usuário já configurou uma regra (correspondência por "contém").
  const establishmentNormalized = normalizeEstablishment(parsed.description);
  const ownerEstablishmentRules = await db.select().from(establishmentRules).where(eq(establishmentRules.ownerId, ownerId));
  const matchedRule = ownerEstablishmentRules.find((rule) => establishmentNormalized.includes(rule.matchText) || rule.matchText.includes(establishmentNormalized));
  const suggestedCategory = matchedRule?.category ?? appRule?.defaultCategory ?? undefined;

  // A notificação diz se é crédito, débito, boleto etc — o app precisa ter a
  // conta OU o cartão certo configurado para ESSE tipo específico (ver
  // NotificationAppRuleForm no site: um mesmo app pode ter os dois).
  const hasRequiredMapping = parsed.paymentMethod === "credit" ? Boolean(target.cardId) : Boolean(target.account);
  const highConfidence = parsed.confidence >= 0.6;

  // 6. Sem confiança suficiente OU sem conta/cartão configurados pra esse tipo -> fila de revisão, sem afetar saldo.
  if (!highConfidence || !hasRequiredMapping) {
    const id = await logPending(ownerId, {
      sourceApp: packageName, rawText, confidence: parsed.confidence, description: parsed.description,
      amountCents: Math.round(parsed.amount * 100), type: parsed.type, occurredAt: postedAt.toISOString(),
      suggestedCategory, suggestedAccount: target.account, cardId: target.cardId,
      reviewStatus: "new",
    });
    return Response.json({ status: "pending", id }, { headers });
  }

  // 7. Confiança alta e conta/cartão certos conhecidos -> cria o lançamento de verdade, via o mesmo caminho usado pelo site.
  const installmentGroupId = parsed.installmentsTotal && parsed.installmentsTotal > 1 ? newId("auto-parcela") : undefined;
  const fakeRequest = new Request("https://internal.fluxo/api/finance", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      transaction: {
        id: newId("auto"),
        description: parsed.description,
        category: suggestedCategory || "Outros",
        account: target.account || "Nubank",
        date: postedAt.toISOString().slice(0, 10),
        amount: parsed.amount,
        type: parsed.type,
        paymentMethod: target.cardId ? "credit" : parsed.paymentMethod === "debit" ? "debit" : "other",
        cardId: target.cardId,
        installments: installmentGroupId ? `1/${parsed.installmentsTotal}` : undefined,
        installmentGroupId,
        status: "confirmed",
        source: "notification",
        sourceApp: packageName,
        rawText,
        confidence: parsed.confidence,
      },
    }),
  });
  const result = await financePostForOwner(fakeRequest, ownerId);
  const resultBody = await result.json().catch(() => null);
  return Response.json({ status: "created", transaction: resultBody?.transaction ?? null }, { headers });
}
