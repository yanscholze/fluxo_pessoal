import assert from "node:assert/strict";
import test from "node:test";
import { scopedImportFingerprint } from "../lib/import-fingerprint.ts";

test("protege fingerprints antigos com cartão, competência e parcela", () => {
  const base = { source: "import" as const, paymentMethod: "credit" as const, fingerprint: "10/07|mercado|100.00", date: "2026-07-10", cardId: "uv", installments: "2/3" };
  assert.notEqual(scopedImportFingerprint({ ...base, invoiceMonth: "2026-07" }), scopedImportFingerprint({ ...base, invoiceMonth: "2026-08" }));
  assert.match(scopedImportFingerprint({ ...base, invoiceMonth: "2026-07" }) ?? "", /^invoice:2026-07\|card:uv\|installment:2\/3\|/);
});
