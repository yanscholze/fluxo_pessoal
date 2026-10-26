/** Entrega local e leitura no servidor têm estados separados. Sem dependências nativas. */
export type DeliveryNotice = {
  readonly key: string; readonly id?: string; readonly revision?: number;
  readonly severity: string; readonly category?: string; readonly priority?: number;
  readonly readAt?: string | null; readonly resolvedAt?: string | null;
};

export function notificationScope(credentials: { baseUrl: string; user: { id: string } }): string {
  const hex = (value: string) => [...value].map((character) => character.codePointAt(0)!.toString(16).padStart(6, "0")).join("");
  return `fluxo.avisos.${hex(credentials.baseUrl.trim().replace(/\/+$/u, ""))}.${hex(credentials.user.id)}`;
}

export function deliveryKey(notice: DeliveryNotice): string {
  return notice.id ? `${notice.id}.${notice.revision ?? 1}` : notice.key;
}

export function pendingDeliveries<T extends DeliveryNotice>(notices: readonly T[], delivered: readonly string[]): T[] {
  const seen = new Set(delivered);
  return notices.filter((notice) => !notice.readAt && !notice.resolvedAt &&
    (notice.category ? notice.category === "critical" || notice.category === "attention" : notice.severity === "urgente" || notice.severity === "atencao") &&
    !seen.has(deliveryKey(notice)))
    .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0)).slice(0, 3);
}
