import type { FinanceTransaction } from "./finance-types";

export const SYNC_API_VERSION = "1" as const;
export const SYNC_SCHEMA_VERSION = 2;
export const MAX_SYNC_MUTATIONS = 50;

export type SyncEntityV1 = "transaction";
export type SyncOperationV1 = "upsert" | "delete";

export type SyncMutationV1 = {
  mutationId: string;
  entity: SyncEntityV1;
  entityId: string;
  operation: SyncOperationV1;
  baseVersion: number;
  data?: FinanceTransaction;
};

export type SyncRequestV1 = {
  device: {
    id: string;
    name?: string;
    platform: "android" | "web";
    appVersion?: string;
  };
  mutations: SyncMutationV1[];
};

export type SyncMutationResultV1 = {
  mutationId: string;
  entity: SyncEntityV1;
  entityId: string;
  status: "applied" | "conflict" | "duplicate" | "noop" | "rejected";
  entityVersion?: number;
  entityData?: FinanceTransaction;
  message?: string;
};

type ParseResult = { ok: true; value: SyncRequestV1 } | { ok: false; error: string };
type MutationDecision = { status: "apply"; nextVersion: number } | { status: "conflict"; currentVersion: number } | { status: "noop"; currentVersion: number };

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validId(value: unknown) {
  return typeof value === "string" && value.length >= 8 && value.length <= 160 && /^[\w.:@-]+$/.test(value);
}

export function decideSyncMutation(existingVersion: number | null, baseVersion: number, operation: SyncOperationV1, alreadyDeleted = false): MutationDecision {
  if (existingVersion == null) {
    return operation === "delete" ? { status: "noop", currentVersion: 0 } : { status: "apply", nextVersion: 1 };
  }
  if (operation === "delete" && alreadyDeleted) return { status: "noop", currentVersion: existingVersion };
  if (baseVersion !== existingVersion) return { status: "conflict", currentVersion: existingVersion };
  return { status: "apply", nextVersion: existingVersion + 1 };
}

export function parseSyncRequestV1(input: unknown): ParseResult {
  if (!isObject(input) || !isObject(input.device) || !Array.isArray(input.mutations)) return { ok: false, error: "Formato de sincronização inválido" };
  if (!validId(input.device.id)) return { ok: false, error: "Identificador do dispositivo inválido" };
  if (!["android", "web"].includes(String(input.device.platform))) return { ok: false, error: "Plataforma não suportada" };
  if (input.mutations.length > MAX_SYNC_MUTATIONS) return { ok: false, error: `Envie no máximo ${MAX_SYNC_MUTATIONS} alterações por lote` };

  const seen = new Set<string>();
  const mutations: SyncMutationV1[] = [];
  for (const raw of input.mutations) {
    if (!isObject(raw) || !validId(raw.mutationId) || !validId(raw.entityId)) return { ok: false, error: "Alteração com identificador inválido" };
    if (seen.has(raw.mutationId as string)) return { ok: false, error: "O lote contém alterações repetidas" };
    seen.add(raw.mutationId as string);
    if (raw.entity !== "transaction") return { ok: false, error: "Tipo de dado ainda não suportado nesta versão" };
    if (raw.operation !== "upsert" && raw.operation !== "delete") return { ok: false, error: "Operação de sincronização inválida" };
    if (!Number.isInteger(raw.baseVersion) || Number(raw.baseVersion) < 0) return { ok: false, error: "Versão-base inválida" };
    if (raw.operation === "upsert") {
      if (!isObject(raw.data) || raw.data.id !== raw.entityId) return { ok: false, error: "O lançamento não corresponde ao identificador da alteração" };
    }
    mutations.push({
      mutationId: raw.mutationId as string,
      entity: "transaction",
      entityId: raw.entityId as string,
      operation: raw.operation,
      baseVersion: Number(raw.baseVersion),
      data: raw.operation === "upsert" ? raw.data as FinanceTransaction : undefined,
    });
  }

  return {
    ok: true,
    value: {
      device: {
        id: input.device.id as string,
        name: typeof input.device.name === "string" ? input.device.name.slice(0, 80) : undefined,
        platform: input.device.platform as "android" | "web",
        appVersion: typeof input.device.appVersion === "string" ? input.device.appVersion.slice(0, 40) : undefined,
      },
      mutations,
    },
  };
}
