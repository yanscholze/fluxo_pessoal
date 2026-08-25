/**
 * Formas que trafegam entre aparelho e servidor.
 *
 * As do protocolo de sincronização vêm de `core/domain/sync/protocol.ts` — são
 * literalmente as mesmas que o servidor valida, e por isso não podem divergir.
 * Aqui ficam apenas as que não pertencem ao domínio: envelope de erro e as
 * rotas de pareamento e captura.
 */

export type ErrorBody = {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly issues?: readonly { path: string; message: string }[];
  };
};

export type PairingStart = {
  readonly code: string;
  readonly expiresAt: string;
  readonly pollToken: string;
};

export type PairingClaim = {
  readonly status: "pendente" | "aprovado" | "expirado";
  readonly token?: string;
  readonly expiresAt?: string;
  readonly user?: { id: string; displayName: string; email: string };
};

export type CaptureIngestResult = {
  readonly received: number;
  readonly accepted: number;
  readonly captured: number;
  readonly ignored: number;
  readonly duplicated: number;
  readonly reasons: Readonly<Record<string, number>>;
};

/** Uma captura na fila de revisão. Espelha `CaptureView` do servidor. */
export type CaptureView = {
  readonly id: string;
  readonly sourceApp: string;
  readonly sourceLabel: string | null;
  readonly rawText: string;
  readonly description: string;
  readonly merchant: string | null;
  readonly amountCents: number;
  readonly kind: string;
  readonly method: string | null;
  readonly installment: { readonly current: number; readonly total: number } | null;
  readonly confidencePercent: number;
  readonly occurredOn: string;
  readonly status: string;
};

/** Fila de revisão e regras por app. Ver `GET /api/v1/captures`. */
export type CapturesView = {
  readonly today: string;
  readonly pending: readonly CaptureView[];
  readonly recent: readonly CaptureView[];
  readonly sources: readonly {
    readonly id: string;
    readonly sourceApp: string;
    readonly label: string | null;
    readonly action: string;
    readonly defaultAccountId: string | null;
    readonly defaultCardId: string | null;
    readonly defaultCategoryId: string | null;
  }[];
  readonly options: {
    readonly accounts: readonly { id: string; name: string }[];
    readonly cards: readonly { id: string; name: string; kind: string }[];
    readonly categories: readonly { id: string; name: string; kind: string }[];
  };
};
