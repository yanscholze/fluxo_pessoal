/** Migra fingerprints antigos sem competência para o formato seguro. */
export function scopedImportFingerprint(item: { source?: string; fingerprint?: string; paymentMethod?: string; invoiceMonth?: string; date?: string; cardId?: string; installments?: string }) {
  const fingerprint = item.fingerprint?.trim();
  if (!fingerprint || item.source !== "import" || item.paymentMethod !== "credit" || fingerprint.startsWith("invoice:")) return fingerprint;
  const month = /^\d{4}-\d{2}$/.test(item.invoiceMonth ?? "") ? item.invoiceMonth! : (item.date ?? "").slice(0, 7);
  return `invoice:${month}|card:${item.cardId?.trim() || "credit"}|installment:${item.installments?.trim() || "single"}|${fingerprint}`;
}
