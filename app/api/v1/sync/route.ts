/**
 * `POST /api/v1/sync` — sincronização do aplicativo.
 *
 * Recebe a fila de saída do aparelho e devolve o que mudou desde o cursor.
 * Rota fina: o protocolo mora em `core/domain/sync`, a aplicação em
 * `server/services/sync`.
 */

import type { SyncRequest } from "../../../../core/domain/sync/protocol.ts";
import { requireUser } from "../../../../server/auth/session.ts";
import { handle, json, readJson } from "../../../../server/http/respond.ts";
import { synchronize } from "../../../../server/services/sync.ts";

export const dynamic = "force-dynamic";

export const POST = handle(async (request: Request) => {
  const user = await requireUser(request);
  const corpo = await readJson(request);

  // A validação de formato é do protocolo, não da rota: ela precisa valer
  // igual para qualquer cliente, e o aparelho valida com o mesmo código antes
  // de enviar.
  const pedido: SyncRequest = {
    protocolVersion: Number(corpo.protocolVersion),
    device: (corpo.device ?? {}) as SyncRequest["device"],
    mutations: Array.isArray(corpo.mutations) ? (corpo.mutations as SyncRequest["mutations"]) : [],
    cursor: (corpo.cursor ?? null) as SyncRequest["cursor"],
  };

  return json({ data: await synchronize(user.id, pedido) });
});
