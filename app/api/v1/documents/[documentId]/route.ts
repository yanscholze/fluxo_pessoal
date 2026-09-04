/**
 * `GET    /api/v1/documents/:id` — baixa o arquivo.
 * `DELETE /api/v1/documents/:id` — remove.
 *
 * O download vai como anexo, com `content-disposition: attachment`, e nunca
 * inline: um PDF ou HTML servido inline no domínio da aplicação é executado
 * com a mesma origem da sessão do usuário.
 */

import { notFound } from "../../../../../core/kernel/errors.ts";
import { requireUser } from "../../../../../server/auth/session.ts";
import { handle, noContent } from "../../../../../server/http/respond.ts";
import { segmentAfter } from "../../../../../server/http/route-params.ts";
import { readDocument, removeDocument } from "../../../../../server/services/documents.ts";

export const dynamic = "force-dynamic";

function idOf(request: Request): string {
  return segmentAfter(request, "documents");
}

/** Só ASCII no cabeçalho; o nome completo vai no `filename*`, em UTF-8. */
function contentDisposition(nome: string): string {
  const simples = nome.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  return `attachment; filename="${simples}"; filename*=UTF-8''${encodeURIComponent(nome)}`;
}

export const GET = handle(async (request: Request) => {
  const user = await requireUser(request);
  const documentId = idOf(request);

  const documento = await readDocument(user.id, documentId);
  if (!documento) throw notFound("Documento", documentId);

  return new Response(documento.content as BodyInit, {
    headers: {
      "content-type": documento.contentType,
      "content-disposition": contentDisposition(documento.name),
      "content-length": String(documento.content.byteLength),
      // Documento de contrato é dado do usuário: nunca em cache compartilhado.
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
});

export const DELETE = handle(async (request: Request) => {
  const user = await requireUser(request);
  const documentId = idOf(request);

  if (!(await removeDocument(user.id, documentId))) throw notFound("Documento", documentId);
  return noContent();
});
