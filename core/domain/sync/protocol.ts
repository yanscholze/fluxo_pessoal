/**
 * Protocolo de sincronização.
 *
 * O aparelho trabalha offline e acumula mutações numa fila de saída. Quando
 * reconecta, envia o lote e puxa o que mudou desde o último cursor.
 *
 * Duas garantias sustentam isso:
 *
 * - **Idempotência**: cada mutação carrega um `mutationId` gerado no aparelho.
 *   Reenviar o lote depois de uma resposta perdida devolve o mesmo resultado
 *   em vez de gravar duas vezes.
 * - **Concorrência otimista**: cada mutação declara sobre qual `baseVersion`
 *   foi feita. Se o servidor já está noutra versão, a mutação volta como
 *   conflito com os dados atuais — quem decide é o aparelho, não o servidor,
 *   porque só o usuário sabe qual das duas edições vale.
 *
 * A versão anterior devolvia o snapshot inteiro a cada sincronização e só
 * sincronizava lançamentos. Aqui o retorno é incremental, guiado por cursor.
 */

import { validationError } from "../../kernel/errors.ts";

/** Só lançamento é escrito pelo aparelho. O resto é puxado e não editado. */
export type SyncEntity = "transaction";

export type SyncOperation = "upsert" | "delete";

export const SYNC_PROTOCOL_VERSION = 1;

/** Teto por lote. Acima disso o aparelho fatia. */
export const MAX_MUTATIONS = 50;

export type Mutation = {
  /** ULID gerado no aparelho. Chave de idempotência. */
  readonly mutationId: string;
  readonly entity: SyncEntity;
  readonly entityId: string;
  readonly operation: SyncOperation;
  /**
   * Versão sobre a qual a edição foi feita. Zero quando é criação — nada
   * existia para versionar.
   */
  readonly baseVersion: number;
  /** Ausente em `delete`. */
  readonly data?: Record<string, unknown>;
};

export type MutationStatus =
  /** Gravada. */
  | "applied"
  /** Já tinha sido gravada antes; devolve o resultado original. */
  | "duplicate"
  /** O servidor está noutra versão; o aparelho precisa reconciliar. */
  | "conflict"
  /** Não havia o que fazer (apagar o que já não existe). */
  | "noop"
  /** Recusada: dado inválido ou de outro dono. */
  | "rejected";

export type MutationResult = {
  readonly mutationId: string;
  readonly entityId: string;
  readonly status: MutationStatus;
  /** Versão do registro depois da operação, quando aplicável. */
  readonly version?: number;
  /** Estado atual no servidor, para o aparelho reconciliar um conflito. */
  readonly current?: Record<string, unknown> | null;
  readonly message?: string;
};

/**
 * Posição no fluxo de mudanças.
 *
 * `updatedAt` sozinho não basta: dois registros gravados no mesmo
 * milissegundo empatariam e um deles seria pulado. O `id` desempata, e o par
 * ordena de forma total.
 */
export type SyncCursor = {
  readonly updatedAt: string;
  readonly id: string;
};

export type SyncRequest = {
  readonly protocolVersion: number;
  readonly device: {
    readonly id: string;
    readonly name?: string;
    readonly platform?: string;
    readonly appVersion?: string;
  };
  readonly mutations: readonly Mutation[];
  /** Ausente na primeira sincronização: o aparelho quer tudo. */
  readonly cursor?: SyncCursor | null;
};

export type SyncResponse = {
  readonly protocolVersion: number;
  readonly results: readonly MutationResult[];
  /** Registros alterados desde o cursor, em ordem. */
  readonly changes: readonly Record<string, unknown>[];
  readonly cursor: SyncCursor | null;
  /** Verdadeiro quando ficou mudança de fora e o aparelho deve pedir de novo. */
  readonly hasMore: boolean;
  /** Cadastros, enviados só quando mudaram desde o cursor. */
  readonly catalog: {
    readonly accounts: readonly Record<string, unknown>[];
    readonly categories: readonly Record<string, unknown>[];
    readonly cards: readonly Record<string, unknown>[];
  } | null;
  readonly serverTime: string;
};

/** Identificadores aceitos: o aparelho gera os seus, mas não qualquer coisa. */
const ID_PATTERN = /^[\w.:@-]{8,160}$/;

/**
 * Confere o formato do lote antes de qualquer escrita.
 *
 * Um lote malformado é recusado **inteiro**: aplicar metade deixaria o
 * aparelho sem saber o que entrou, e a fila de saída dele não tem como se
 * recuperar disso.
 */
export function assertValidRequest(request: SyncRequest): void {
  const problemas: { path: string; message: string }[] = [];

  if (request.protocolVersion !== SYNC_PROTOCOL_VERSION) {
    problemas.push({
      path: "protocolVersion",
      message: `Este servidor fala a versão ${SYNC_PROTOCOL_VERSION} do protocolo`,
    });
  }

  if (!ID_PATTERN.test(request.device?.id ?? "")) {
    problemas.push({ path: "device.id", message: "Identificador de aparelho inválido" });
  }

  if (request.mutations.length > MAX_MUTATIONS) {
    problemas.push({
      path: "mutations",
      message: `Envie no máximo ${MAX_MUTATIONS} mutações por lote`,
    });
  }

  const vistas = new Set<string>();
  request.mutations.forEach((mutation, indice) => {
    const onde = `mutations[${indice}]`;

    if (!ID_PATTERN.test(mutation.mutationId)) {
      problemas.push({ path: `${onde}.mutationId`, message: "Identificador de mutação inválido" });
    } else if (vistas.has(mutation.mutationId)) {
      // Repetido dentro do mesmo lote: o aparelho montou a fila errado, e
      // aceitar esconderia o defeito.
      problemas.push({ path: `${onde}.mutationId`, message: "Mutação repetida no lote" });
    } else {
      vistas.add(mutation.mutationId);
    }

    if (!ID_PATTERN.test(mutation.entityId)) {
      problemas.push({ path: `${onde}.entityId`, message: "Identificador de registro inválido" });
    }

    if (mutation.entity !== "transaction") {
      problemas.push({ path: `${onde}.entity`, message: "Só lançamento sincroniza" });
    }

    if (mutation.operation !== "upsert" && mutation.operation !== "delete") {
      problemas.push({ path: `${onde}.operation`, message: "Operação desconhecida" });
    }

    if (!Number.isInteger(mutation.baseVersion) || mutation.baseVersion < 0) {
      problemas.push({ path: `${onde}.baseVersion`, message: "Versão base inválida" });
    }

    if (mutation.operation === "upsert") {
      if (!mutation.data || typeof mutation.data !== "object") {
        problemas.push({ path: `${onde}.data`, message: "Gravação exige os dados do registro" });
      } else if (mutation.data.id !== mutation.entityId) {
        // O `id` do payload divergir do `entityId` costuma ser bug de
        // montagem da fila, e gravaria no registro errado.
        problemas.push({ path: `${onde}.data.id`, message: "O id do registro não confere" });
      }
    }
  });

  if (problemas.length) throw validationError("Lote de sincronização inválido", problemas);
}

/**
 * Decide o que fazer com uma mutação, dada a versão que o servidor tem.
 *
 * `currentVersion` é `null` quando o registro não existe.
 */
export function decide(
  mutation: Mutation,
  currentVersion: number | null,
  isDeleted: boolean,
): { action: "apply"; nextVersion: number } | { action: "conflict" } | { action: "noop" } {
  if (currentVersion === null) {
    // Apagar o que nunca existiu não é erro: o aparelho pode ter criado e
    // apagado offline, e só a exclusão chegou.
    return mutation.operation === "delete" ? { action: "noop" } : { action: "apply", nextVersion: 1 };
  }

  if (mutation.operation === "delete" && isDeleted) return { action: "noop" };

  // O aparelho editou uma versão que não é mais a atual. Sobrescrever
  // apagaria a outra edição em silêncio — quem resolve é quem tem contexto.
  if (mutation.baseVersion !== currentVersion) return { action: "conflict" };

  return { action: "apply", nextVersion: currentVersion + 1 };
}

/** Verdadeiro quando `left` vem depois de `right` na ordem do cursor. */
export function isAfter(left: SyncCursor, right: SyncCursor): boolean {
  if (left.updatedAt !== right.updatedAt) return left.updatedAt > right.updatedAt;
  return left.id > right.id;
}
