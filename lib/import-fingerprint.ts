/** Migra fingerprints antigos sem competência para o formato seguro. */
type ImportFingerprintItem = { source?: string; fingerprint?: string; paymentMethod?: string; invoiceMonth?: string; date?: string; cardId?: string; installments?: string; description?: string; amount?: number };

function normalizedDescription(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function offsetMonth(month: string, offset: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const target = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function scopedImportFingerprint(item: ImportFingerprintItem) {
  const fingerprint = item.fingerprint?.trim();
  const legacyOfx = fingerprint?.match(/^invoice:[^|]+\|card:[^|]+\|installment:[^|]+\|(ofx:.+)$/)?.[1];
  // O FITID é fornecido pelo emissor justamente como identidade estável da
  // movimentação. Vinculá-lo à competência escolhida pelo usuário fazia o
  // mesmo registro OFX ganhar uma nova identidade ao reimportar/ajustar o mês.
  if (legacyOfx) return legacyOfx;
  if (!fingerprint || item.source !== "import" || item.paymentMethod !== "credit" || fingerprint.startsWith("ofx:") || fingerprint.startsWith("ofx-installment:") || fingerprint.startsWith("invoice:") || fingerprint.startsWith("installment-family:")) return fingerprint;
  const month = /^\d{4}-\d{2}$/.test(item.invoiceMonth ?? "") ? item.invoiceMonth! : (item.date ?? "").slice(0, 7);
  return `invoice:${month}|card:${item.cardId?.trim() || "credit"}|installment:${item.installments?.trim() || "single"}|${fingerprint}`;
}

/** Inclui a identidade usada antes da correção para reconhecer dados já salvos. */
export function importFingerprintCandidates(item: ImportFingerprintItem) {
  const canonical = scopedImportFingerprint(item);
  if (!canonical) return [];
  if (item.source === "import" && item.paymentMethod === "credit" && canonical.startsWith("ofx-installment:")) {
    const parts = item.installments?.match(/^(\d{1,2})\/(\d{1,2})$/);
    const occurrence = Number(canonical.match(/\|occurrence:(\d+)\|part:/)?.[1] ?? 1);
    const month = /^\d{4}-\d{2}$/.test(item.invoiceMonth ?? "") ? item.invoiceMonth! : (item.date ?? "").slice(0, 7);
    const amount = Number(item.amount);
    if (!parts || !/^\d{4}-\d{2}$/.test(month) || !item.description || !Number.isFinite(amount)) return [canonical];
    const current = Number(parts[1]);
    const total = Number(parts[2]);
    const anchor = offsetMonth(month, 1 - current);
    const legacyPrefix = `installment-family:card:${item.cardId?.trim() || "credit"}|anchor:${anchor}|description:${normalizedDescription(item.description)}|amount:`;
    // A implementação anterior incluía o valor na identidade da família. Os
    // emissores podem distribuir centavos de arredondamento entre parcelas, por
    // isso reconhecemos uma pequena faixa ao migrar dados já importados.
    const legacy = Array.from({ length: 11 }, (_, index) => amount + (index - 5) / 100)
      .filter((candidate) => candidate > 0)
      .map((candidate) => `${legacyPrefix}${candidate.toFixed(2)}|total:${total}|occurrence:${occurrence}|part:${current}/${total}`);
    return [canonical, ...legacy];
  }
  if (item.source !== "import" || item.paymentMethod !== "credit" || !canonical.startsWith("ofx:")) return [canonical];
  const month = /^\d{4}-\d{2}$/.test(item.invoiceMonth ?? "") ? item.invoiceMonth! : (item.date ?? "").slice(0, 7);
  const legacy = `invoice:${month}|card:${item.cardId?.trim() || "credit"}|installment:${item.installments?.trim() || "single"}|${canonical}`;
  return legacy === canonical ? [canonical] : [canonical, legacy];
}
