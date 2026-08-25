/**
 * Entrega das notificações capturadas.
 *
 * O aparelho só **encaminha** o texto bruto. Quem decide se aquilo é uma
 * transação, de quanto, de qual estabelecimento e se é duplicada é o domínio,
 * em `core/domain/capture/notification.ts`, rodando no servidor — uma
 * implementação, e o site mostra exatamente o mesmo resultado.
 *
 * Nada disso entra no razão sozinho: a captura vira **sugestão**, e o usuário
 * confirma. Lançamento que aparece sem alguém ter pedido é o começo de uma
 * planilha em que ninguém confia.
 */

import { call } from "./client.ts";
import { clearCaptures, pendingCaptures } from "../storage/captures.ts";
import type { CaptureIngestResult, CapturesView } from "./types.ts";

/** Teto do servidor por lote. Ver `MAX_BATCH` em `server/services/captures.ts`. */
const BATCH = 100;

export async function flushCaptures(input: { baseUrl: string; token: string }): Promise<CaptureIngestResult | null> {
  const fila = await pendingCaptures(BATCH);
  if (!fila.length) return null;

  const resultado = await call<CaptureIngestResult>("/api/v1/captures", {
    baseUrl: input.baseUrl,
    token: input.token,
    method: "POST",
    body: {
      notifications: fila.map((item) => ({
        sourceApp: item.sourceApp,
        title: item.title,
        text: item.text,
        postedAt: item.postedAt,
        deviceEventId: item.deviceEventId,
      })),
    },
  });

  // Só limpa depois de o servidor confirmar. Uma resposta perdida faz o lote
  // subir de novo, e o `deviceEventId` impede a duplicata do outro lado.
  await clearCaptures(fila.map((item) => item.deviceEventId));
  return resultado;
}

export function fetchCaptures(input: { baseUrl: string; token: string }): Promise<CapturesView> {
  return call<CapturesView>("/api/v1/captures", { baseUrl: input.baseUrl, token: input.token });
}

export function resolveCapture(input: {
  baseUrl: string;
  token: string;
  captureId: string;
  decision: "confirmar" | "ignorar" | "duplicado";
}): Promise<unknown> {
  return call("/api/v1/captures", {
    baseUrl: input.baseUrl,
    token: input.token,
    method: "PATCH",
    body: { captureId: input.captureId, decision: input.decision },
  });
}
