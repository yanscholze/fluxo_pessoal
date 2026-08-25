/**
 * `GET   /api/v1/captures` — fila de revisão e regras por app.
 * `POST  /api/v1/captures` — o aparelho envia um lote de notificações.
 * `PATCH /api/v1/captures` — confirma, ignora, ou define a regra de um app.
 */

import { requireUser } from "../../../../server/auth/session.ts";
import { read } from "../../../../server/http/input.ts";
import { handle, json, readJson } from "../../../../server/http/respond.ts";
import {
  MAX_BATCH,
  buildCapturesView,
  confirmCapture,
  ingest,
  resolveCapture,
  setSource,
} from "../../../../server/services/captures.ts";

export const dynamic = "force-dynamic";

export const GET = handle(async (request: Request) => {
  const user = await requireUser(request);
  return json({ data: await buildCapturesView(user.id) });
});

export const POST = handle(async (request: Request) => {
  const user = await requireUser(request);
  const corpo = await readJson(request);

  const bruto = Array.isArray(corpo.notifications) ? corpo.notifications : [];
  const notificacoes = bruto.slice(0, MAX_BATCH).flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const registro = item as Record<string, unknown>;

    const sourceApp = typeof registro.sourceApp === "string" ? registro.sourceApp.slice(0, 120) : "";
    const text = typeof registro.text === "string" ? registro.text.slice(0, 1000) : "";
    const postedAt = Number(registro.postedAt);

    // Notificação sem app, sem texto ou sem instante não tem o que decidir.
    if (!sourceApp || !text || !Number.isFinite(postedAt)) return [];

    return [
      {
        sourceApp,
        title: typeof registro.title === "string" ? registro.title.slice(0, 200) : "",
        text,
        postedAt: Math.trunc(postedAt),
        deviceEventId:
          typeof registro.deviceEventId === "string" ? registro.deviceEventId.slice(0, 120) : null,
      },
    ];
  });

  const resultado = await ingest(user.id, notificacoes);
  return json({ data: { ...resultado, received: bruto.length, accepted: notificacoes.length } }, { status: 201 });
});

export const PATCH = handle(async (request: Request) => {
  const user = await requireUser(request);
  const input = read(await readJson(request));

  // Três operações num verbo só, distinguidas pelo campo presente: definir a
  // regra de um app, ou resolver uma sugestão da fila.
  const sourceApp = input.optionalString("sourceApp", { max: 120 });

  if (sourceApp) {
    const action = input.choice("action", ["allow", "ignore"] as const);
    const label = input.optionalString("label", { max: 80 });
    const defaultAccountId = input.optionalReference("defaultAccountId");
    const defaultCardId = input.optionalReference("defaultCardId");
    const defaultCategoryId = input.optionalReference("defaultCategoryId");
    input.done();

    await setSource(user.id, {
      sourceApp,
      label,
      action,
      defaultAccountId,
      defaultCardId,
      defaultCategoryId,
    });
    return json({ data: { ok: true } });
  }

  const captureId = input.reference("captureId");
  const decision = input.choice("decision", ["confirmar", "ignorar", "duplicado"] as const);

  if (decision !== "confirmar") {
    input.done();
    await resolveCapture(user.id, captureId, decision === "ignorar" ? "ignorado" : "duplicado");
    return json({ data: { ok: true } });
  }

  const payload = {
    accountId: input.optionalReference("accountId"),
    cardId: input.optionalReference("cardId"),
    categoryId: input.optionalReference("categoryId"),
    description: input.optionalString("description", { max: 160 }),
    amount: input.optionalMoney("amount"),
    occurredOn: input.optionalDate("occurredOn"),
  };

  input.done();

  const resultado = await confirmCapture(user.id, captureId, payload);
  return json({ data: resultado }, { status: 201 });
});
