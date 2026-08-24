/**
 * `GET  /api/v1/imports` — lotes de importação.
 * `POST /api/v1/imports` — envia um arquivo e devolve o lote em revisão.
 *
 * O envio **não** cria lançamento: cria um lote para revisar.
 */

import { requireUser } from "../../../../server/auth/session.ts";
import { read } from "../../../../server/http/input.ts";
import { handle, json, readJson } from "../../../../server/http/respond.ts";
import { listBatches, startImport } from "../../../../server/services/imports.ts";

export const dynamic = "force-dynamic";

/** Teto do arquivo aceito. Extrato de um ano cabe folgado em 2 MB. */
const MAX_CONTENT = 2_000_000;

export const GET = handle(async (request: Request) => {
  const user = await requireUser(request);
  return json({ data: await listBatches(user.id) });
});

export const POST = handle(async (request: Request) => {
  const user = await requireUser(request);
  const input = read(await readJson(request));

  const payload = {
    filename: input.string("filename", { max: 200 }),
    content: input.string("content", { max: MAX_CONTENT }),
    accountId: input.optionalReference("accountId"),
    cardId: input.optionalReference("cardId"),
    competence: input.optionalCompetence("competence"),
  };

  input.done();

  const batch = await startImport(user.id, payload);
  return json({ data: batch }, { status: 201 });
});
