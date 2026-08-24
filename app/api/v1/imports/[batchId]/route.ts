/**
 * `GET    /api/v1/imports/:id` — lote com as linhas para revisão.
 * `PATCH  /api/v1/imports/:id` — decide uma linha, ou aceita todas as pendentes.
 * `POST   /api/v1/imports/:id` — confirma o lote: as aceitas viram lançamentos.
 * `DELETE /api/v1/imports/:id` — descarta o lote sem gravar nada.
 */

import { notFound } from "../../../../../core/kernel/errors.ts";
import { requireUser } from "../../../../../server/auth/session.ts";
import { read } from "../../../../../server/http/input.ts";
import { handle, json, noContent, readJson } from "../../../../../server/http/respond.ts";
import {
  acceptAllPending,
  commitBatch,
  decideItem,
  discardBatch,
  findBatch,
} from "../../../../../server/services/imports.ts";

export const dynamic = "force-dynamic";

function batchIdOf(request: Request): string {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  return segments[segments.indexOf("imports") + 1] ?? "";
}

export const GET = handle(async (request: Request) => {
  const user = await requireUser(request);
  const found = await findBatch(user.id, batchIdOf(request));
  if (!found) throw notFound("Lote de importação");
  return json({ data: found });
});

export const PATCH = handle(async (request: Request) => {
  const user = await requireUser(request);
  const batchId = batchIdOf(request);
  const input = read(await readJson(request));

  const acceptAll = input.boolean("acceptAll", false);
  const itemId = input.optionalReference("itemId");
  const decision = input.optionalChoice("decision", ["pendente", "aceitar", "ignorar"] as const);
  const categoryId = input.optionalReference("categoryId");
  const clearCategory = input.boolean("clearCategory", false);

  input.done();

  if (acceptAll) {
    const accepted = await acceptAllPending(user.id, batchId);
    return json({ data: { accepted } });
  }

  if (!itemId) throw notFound("Linha da importação");
  await decideItem(user.id, itemId, {
    decision: decision ?? undefined,
    categoryId: clearCategory ? null : (categoryId ?? undefined),
  });

  return json({ data: { ok: true } });
});

export const POST = handle(async (request: Request) => {
  const user = await requireUser(request);
  const result = await commitBatch(user.id, batchIdOf(request));
  return json({ data: result }, { status: 201 });
});

export const DELETE = handle(async (request: Request) => {
  const user = await requireUser(request);
  await discardBatch(user.id, batchIdOf(request));
  return noContent();
});
