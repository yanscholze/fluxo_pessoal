/**
 * Fila local de notificações capturadas.
 *
 * O serviço nativo escreve direto no servidor quando há rede (ver
 * `plugins/native/notifications/NotificationForwarderService.kt`): ele roda
 * com o aplicativo fechado e não teria como abrir este banco com segurança.
 *
 * Esta fila existe para o caminho **JS**: notificações que o aplicativo
 * capturou enquanto estava aberto e não conseguiu entregar. Sem ela, uma
 * captura feita no metrô sem sinal simplesmente sumiria.
 *
 * `deviceEventId` é a chave de deduplicação ponta a ponta: o mesmo evento
 * reenviado depois de uma resposta perdida não vira duas sugestões.
 */

import { openDatabase } from "./database.ts";

export type QueuedCapture = {
  readonly deviceEventId: string;
  readonly sourceApp: string;
  readonly title: string;
  readonly text: string;
  readonly postedAt: number;
};

export async function enqueueCapture(capture: QueuedCapture): Promise<void> {
  const database = await openDatabase();
  await database.runAsync(
    `INSERT INTO capture_queue (device_event_id, source_app, title, text, posted_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(device_event_id) DO NOTHING`,
    [
      capture.deviceEventId,
      capture.sourceApp,
      capture.title,
      capture.text,
      Math.trunc(capture.postedAt),
      new Date().toISOString(),
    ],
  );
}

export async function pendingCaptures(limit: number): Promise<QueuedCapture[]> {
  const database = await openDatabase();
  return database.getAllAsync<QueuedCapture>(
    `SELECT device_event_id AS deviceEventId, source_app AS sourceApp, title, text, posted_at AS postedAt
       FROM capture_queue ORDER BY posted_at LIMIT ?`,
    [limit],
  );
}

export async function clearCaptures(ids: readonly string[]): Promise<void> {
  if (!ids.length) return;
  const database = await openDatabase();
  await database.runAsync(
    `DELETE FROM capture_queue WHERE device_event_id IN (${ids.map(() => "?").join(", ")})`,
    [...ids],
  );
}
