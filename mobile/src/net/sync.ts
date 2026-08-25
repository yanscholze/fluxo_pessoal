/**
 * Motor de sincronização.
 *
 * Um ciclo: sobe a fila de saída, aplica o que voltou, guarda o cursor. Se o
 * servidor avisou que ficou coisa de fora, repete — com teto, porque um
 * servidor que sempre responde `hasMore` não pode virar laço infinito no
 * celular do usuário.
 *
 * O aparelho **não** decide conflito sozinho. Quando o servidor devolve
 * `conflict`, a versão do servidor entra no banco local e a mutação fica
 * parada esperando o usuário — sobrescrever apagaria em silêncio uma edição
 * feita no site.
 */

import { MAX_MUTATIONS, SYNC_PROTOCOL_VERSION } from "@fluxo/core/domain/sync/protocol.ts";
import type { MutationResult, SyncCursor, SyncResponse } from "@fluxo/core/domain/sync/protocol.ts";
import { openDatabase, readMeta, writeMeta } from "../storage/database.ts";
import { applyServerCatalog, applyServerChanges } from "../storage/ledger.ts";
import { markAttempt, markUnresolved, pendingMutations, settle } from "../storage/outbox.ts";

import { ApiError, OfflineError, call } from "./client.ts";

const META_CURSOR = "sync.cursor";
/** Teto de páginas por ciclo. Uma sincronização longa não pode travar a tela. */
const MAX_ROUNDS = 20;

export type SyncOutcome = {
  readonly applied: number;
  readonly conflicts: number;
  readonly rejected: number;
  readonly received: number;
  /** Verdadeiro quando não deu para falar com o servidor. Não é erro do usuário. */
  readonly offline: boolean;
};

export async function readCursor(): Promise<SyncCursor | null> {
  const bruto = await readMeta(META_CURSOR);
  if (!bruto) return null;
  try {
    const analisado = JSON.parse(bruto) as SyncCursor;
    return analisado?.updatedAt && analisado?.id ? analisado : null;
  } catch {
    return null;
  }
}

/**
 * Roda um ciclo completo.
 *
 * `onUnauthenticated` é chamado quando o token não vale mais: só quem cuida da
 * sessão sabe o que fazer (desconectar e voltar para a tela de conexão), e
 * decidir isso aqui acoplaria rede a navegação.
 */
export async function runSync(input: {
  baseUrl: string;
  token: string;
  deviceId: string;
  deviceName: string | null;
  appVersion: string;
  onUnauthenticated?: () => void;
}): Promise<SyncOutcome> {
  let aplicadas = 0;
  let conflitos = 0;
  let recusadas = 0;
  let recebidas = 0;

  for (let rodada = 0; rodada < MAX_ROUNDS; rodada += 1) {
    const mutacoes = await pendingMutations(MAX_MUTATIONS);
    const cursor = await readCursor();

    let resposta: SyncResponse;
    try {
      resposta = await call<SyncResponse>("/api/v1/sync", {
        baseUrl: input.baseUrl,
        token: input.token,
        method: "POST",
        body: {
          protocolVersion: SYNC_PROTOCOL_VERSION,
          device: {
            id: input.deviceId,
            name: input.deviceName ?? undefined,
            platform: "android",
            appVersion: input.appVersion,
          },
          mutations: mutacoes,
          cursor,
        },
      });
    } catch (erro) {
      if (erro instanceof OfflineError) {
        // Nada foi perdido: a fila continua de pé e a próxima tentativa
        // reenvia o mesmo lote. O `mutationId` garante que reenviar não grava
        // duas vezes.
        await markAttempt(mutacoes.map((mutacao) => mutacao.mutationId));
        return { applied: aplicadas, conflicts: conflitos, rejected: recusadas, received: recebidas, offline: true };
      }
      if (erro instanceof ApiError && erro.isUnauthenticated) input.onUnauthenticated?.();
      throw erro;
    }

    const contagem = await processResults(resposta.results);
    aplicadas += contagem.applied;
    conflitos += contagem.conflicts;
    recusadas += contagem.rejected;

    await applyServerChanges(resposta.changes);
    recebidas += resposta.changes.length;

    if (resposta.catalog) await applyServerCatalog(resposta.catalog);
    if (resposta.cursor) await writeMeta(META_CURSOR, JSON.stringify(resposta.cursor));

    const restaFila = (await pendingMutations(1)).length > 0;
    // Só continua se realmente houver o que fazer. Sem isso, uma fila só de
    // conflitos faria o laço rodar até o teto sem progresso.
    if (!resposta.hasMore && !(restaFila && contagem.applied > 0)) break;
  }

  return { applied: aplicadas, conflicts: conflitos, rejected: recusadas, received: recebidas, offline: false };
}

async function processResults(
  results: readonly MutationResult[],
): Promise<{ applied: number; conflicts: number; rejected: number }> {
  const resolvidas: string[] = [];
  let aplicadas = 0;
  let conflitos = 0;
  let recusadas = 0;

  const database = await openDatabase();

  for (const resultado of results) {
    switch (resultado.status) {
      case "applied":
      case "duplicate":
        // A versão local passa a ser a que o servidor confirmou; sem isso a
        // próxima edição subiria com uma base antiga e voltaria como conflito.
        if (typeof resultado.version === "number") {
          await database.runAsync("UPDATE transactions SET version = ? WHERE id = ?", [
            resultado.version,
            resultado.entityId,
          ]);
        }
        resolvidas.push(resultado.mutationId);
        aplicadas += 1;
        break;

      case "noop":
        resolvidas.push(resultado.mutationId);
        break;

      case "conflict":
        if (resultado.current) await applyServerChanges([resultado.current]);
        await markUnresolved(
          resultado.mutationId,
          "conflict",
          "Este lançamento foi alterado em outro lugar depois desta edição.",
          resultado.version ?? null,
        );
        conflitos += 1;
        break;

      case "rejected":
        await markUnresolved(resultado.mutationId, "rejected", resultado.message ?? "Recusado pelo servidor.");
        recusadas += 1;
        break;
    }
  }

  await settle(resolvidas);
  return { applied: aplicadas, conflicts: conflitos, rejected: recusadas };
}
