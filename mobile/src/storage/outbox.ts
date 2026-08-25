/**
 * Fila de saída.
 *
 * Cada ato do usuário vira uma linha aqui antes de virar rede. O aplicativo
 * nunca depende de a requisição dar certo para mostrar o lançamento na tela —
 * ele mostra o dado local e a fila resolve o resto quando houver rede.
 *
 * Três estados, e cada um existe por um motivo:
 *
 * - `pending`: ainda vai subir.
 * - `conflict`: o servidor está noutra versão. A mutação **não** é descartada
 *   nem reenviada automaticamente: reenviar por cima apagaria em silêncio a
 *   edição feita no site, e é o usuário quem sabe qual das duas vale.
 * - `rejected`: o servidor recusou o dado (conta apagada, valor inválido). Fica
 *   visível para o usuário corrigir, em vez de sumir sem explicação.
 *
 * `sequence` preserva a ordem em que o usuário agiu. Duas edições do mesmo
 * lançamento fora de ordem gravariam a versão errada como final.
 */

import type { Mutation } from "@fluxo/core/domain/sync/protocol.ts";

import { openDatabase } from "./database.ts";

export const SYNC_ENTITY = "transaction" as const;

export type OutboxStatus = "pending" | "conflict" | "rejected";

export type OutboxRow = {
  readonly mutationId: string;
  readonly sequence: number;
  readonly entityId: string;
  readonly operation: "upsert" | "delete";
  readonly baseVersion: number;
  readonly dataJson: string | null;
  readonly status: OutboxStatus;
  readonly message: string | null;
  /** Versão atual no servidor, quando o conflito a informou. */
  readonly serverVersion: number | null;
  readonly attempts: number;
  readonly createdAt: string;
};

type Statement = { readonly sql: string; readonly args: (string | number | null)[] };

/**
 * Comandos que enfileiram uma mutação.
 *
 * Devolve comandos em vez de executá-los porque quem chama precisa gravá-los
 * na **mesma** transação do registro que originou a mutação — ver
 * `persist` em `ledger.ts`.
 *
 * `sequence` sai de um contador na própria tabela: `MAX(sequence) + 1` dentro
 * da transação exclusiva não corre risco de empate.
 */
export function enqueueStatements(input: {
  mutationId: string;
  entityId: string;
  operation: "upsert" | "delete";
  baseVersion: number;
  data: Record<string, unknown> | null;
  now: Date;
}): Statement[] {
  return [
    {
      sql: `INSERT INTO outbox
              (mutation_id, sequence, entity, entity_id, operation, base_version, data_json, status, attempts, created_at)
            VALUES (?, (SELECT COALESCE(MAX(sequence), 0) + 1 FROM outbox), ?, ?, ?, ?, ?, 'pending', 0, ?)`,
      args: [
        input.mutationId,
        SYNC_ENTITY,
        input.entityId,
        input.operation,
        input.baseVersion,
        input.data ? JSON.stringify(input.data) : null,
        input.now.toISOString(),
      ],
    },
  ];
}

/** O lote a enviar, em ordem. `limit` respeita o teto do protocolo. */
export async function pendingMutations(limit: number): Promise<Mutation[]> {
  const database = await openDatabase();
  const linhas = await database.getAllAsync<OutboxRow>(
    `SELECT mutation_id AS mutationId, sequence, entity_id AS entityId, operation,
            base_version AS baseVersion, data_json AS dataJson, status, message,
            server_version AS serverVersion, attempts, created_at AS createdAt
       FROM outbox WHERE status = 'pending' ORDER BY sequence LIMIT ?`,
    [limit],
  );

  return linhas.map((linha) => ({
    mutationId: linha.mutationId,
    entity: SYNC_ENTITY,
    entityId: linha.entityId,
    operation: linha.operation,
    baseVersion: linha.baseVersion,
    ...(linha.dataJson ? { data: JSON.parse(linha.dataJson) as Record<string, unknown> } : {}),
  }));
}

export async function countByStatus(): Promise<Record<OutboxStatus, number>> {
  const database = await openDatabase();
  const linhas = await database.getAllAsync<{ status: OutboxStatus; total: number }>(
    "SELECT status, COUNT(*) AS total FROM outbox GROUP BY status",
  );

  const contagem: Record<OutboxStatus, number> = { pending: 0, conflict: 0, rejected: 0 };
  for (const linha of linhas) contagem[linha.status] = linha.total;
  return contagem;
}

export async function listUnresolved(): Promise<OutboxRow[]> {
  const database = await openDatabase();
  return database.getAllAsync<OutboxRow>(
    `SELECT mutation_id AS mutationId, sequence, entity_id AS entityId, operation,
            base_version AS baseVersion, data_json AS dataJson, status, message,
            server_version AS serverVersion, attempts, created_at AS createdAt
       FROM outbox WHERE status <> 'pending' ORDER BY sequence`,
  );
}

/** Remove a mutação da fila: entregue, duplicada ou sem efeito. */
export async function settle(mutationIds: readonly string[]): Promise<void> {
  if (!mutationIds.length) return;
  const database = await openDatabase();
  await database.runAsync(
    `DELETE FROM outbox WHERE mutation_id IN (${mutationIds.map(() => "?").join(", ")})`,
    [...mutationIds],
  );
}

export async function markUnresolved(
  mutationId: string,
  status: Exclude<OutboxStatus, "pending">,
  message: string | null,
  serverVersion: number | null = null,
): Promise<void> {
  const database = await openDatabase();
  await database.runAsync(
    `UPDATE outbox SET status = ?, message = ?, server_version = ?, attempts = attempts + 1
       WHERE mutation_id = ?`,
    [status, message, serverVersion, mutationId],
  );
}

/** Conta a tentativa quando o lote não chegou (rede caiu, servidor fora). */
export async function markAttempt(mutationIds: readonly string[]): Promise<void> {
  if (!mutationIds.length) return;
  const database = await openDatabase();
  await database.runAsync(
    `UPDATE outbox SET attempts = attempts + 1
       WHERE mutation_id IN (${mutationIds.map(() => "?").join(", ")})`,
    [...mutationIds],
  );
}

/**
 * O usuário decidiu reenviar uma mutação em conflito, por cima do servidor.
 *
 * `baseVersion` passa a ser a versão atual do servidor: é isso que transforma
 * "esta edição perdeu" em "esta edição vale". Sem atualizar a base, o servidor
 * devolveria conflito de novo, para sempre.
 */
export async function rebase(mutationId: string, serverVersion: number): Promise<void> {
  const database = await openDatabase();
  await database.runAsync(
    `UPDATE outbox SET status = 'pending', message = NULL, server_version = NULL, base_version = ?
       WHERE mutation_id = ?`,
    [serverVersion, mutationId],
  );
}

/** O usuário descartou a própria edição e ficou com a versão do servidor. */
export async function discard(mutationId: string): Promise<void> {
  const database = await openDatabase();
  await database.runAsync("DELETE FROM outbox WHERE mutation_id = ?", [mutationId]);
}
