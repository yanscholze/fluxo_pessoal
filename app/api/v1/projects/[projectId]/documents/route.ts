/**
 * `GET  /api/v1/projects/:id/documents` — os papéis do projeto.
 * `POST /api/v1/projects/:id/documents` — anexa proposta, contrato ou outro.
 *
 * O arquivo chega em base64 dentro de JSON, como a foto do cupom fiscal. É o
 * mesmo caminho já usado no produto, e vale por não exigir um armazenamento de
 * objetos que esta instalação não tem.
 */

import { requireUser } from "../../../../../../server/auth/session.ts";
import { read } from "../../../../../../server/http/input.ts";
import { handle, json, readJson } from "../../../../../../server/http/respond.ts";
import { segmentAfter } from "../../../../../../server/http/route-params.ts";
import { attachDocument, listDocuments, MAX_BYTES } from "../../../../../../server/services/documents.ts";

export const dynamic = "force-dynamic";

const TIPOS = ["proposal", "contract", "other"] as const;

/** Base64 infla um terço; o teto do campo acompanha o teto do arquivo. */
const MAX_PAYLOAD = Math.ceil(MAX_BYTES * 1.4);

export const GET = handle(async (request: Request) => {
  const user = await requireUser(request);
  const projectId = segmentAfter(request, "projects");

  return json({ data: await listDocuments(user.id, projectId) });
});

export const POST = handle(async (request: Request) => {
  const user = await requireUser(request);
  const projectId = segmentAfter(request, "projects");
  const input = read(await readJson(request));

  const payload = {
    projectId,
    kind: input.choice("kind", TIPOS),
    name: input.string("name", { max: 200 }),
    contentType: input.string("contentType", { max: 120 }),
    dataUrl: input.string("dataUrl", { max: MAX_PAYLOAD }),
    notes: input.optionalString("notes", { max: 500 }),
  };
  input.done();

  const id = await attachDocument(user.id, payload);
  return json({ data: { id } }, { status: 201 });
});
