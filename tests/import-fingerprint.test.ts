import assert from "node:assert/strict";
import test from "node:test";
import { importFingerprintCandidates, scopedImportFingerprint } from "../lib/import-fingerprint.ts";

test("protege fingerprints antigos com cartão, competência e parcela", () => {
  const base = { source: "import" as const, paymentMethod: "credit" as const, fingerprint: "10/07|mercado|100.00", date: "2026-07-10", cardId: "uv", installments: "2/3" };
  assert.notEqual(scopedImportFingerprint({ ...base, invoiceMonth: "2026-07" }), scopedImportFingerprint({ ...base, invoiceMonth: "2026-08" }));
  assert.match(scopedImportFingerprint({ ...base, invoiceMonth: "2026-07" }) ?? "", /^invoice:2026-07\|card:uv\|installment:2\/3\|/);
});

test("preserva identidade estável de parcelamento entre competências", () => {
  const fingerprint = "installment-family:card:uv|anchor:2026-01|description:notebook|amount:250.00|total:5|occurrence:1|part:2/5";
  const base = { source: "import" as const, paymentMethod: "credit" as const, fingerprint, date: "2026-02-10", cardId: "uv", installments: "2/5" };
  assert.equal(scopedImportFingerprint({ ...base, invoiceMonth: "2026-02" }), fingerprint);
  assert.equal(scopedImportFingerprint({ ...base, invoiceMonth: "2026-03" }), fingerprint);
});

test("FITID do OFX permanece estável mesmo se a competência selecionada mudar", () => {
  const base = { source: "import" as const, paymentMethod: "credit" as const, fingerprint: "ofx:nubank-123", date: "2026-01-10", cardId: "uv" };
  assert.equal(scopedImportFingerprint({ ...base, invoiceMonth: "2026-01" }), "ofx:nubank-123");
  assert.equal(scopedImportFingerprint({ ...base, invoiceMonth: "2026-02" }), "ofx:nubank-123");
});

test("reconhece também o fingerprint OFX salvo pelo formato antigo", () => {
  const item = { source: "import" as const, paymentMethod: "credit" as const, fingerprint: "ofx:nubank-123", date: "2026-01-10", invoiceMonth: "2026-02", cardId: "uv" };
  assert.deepEqual(importFingerprintCandidates(item), [
    "ofx:nubank-123",
    "invoice:2026-02|card:uv|installment:single|ofx:nubank-123",
  ]);
  assert.equal(scopedImportFingerprint({ ...item, fingerprint: "invoice:2026-02|card:uv|installment:single|ofx:nubank-123" }), "ofx:nubank-123");
});

test("reconhece parcelamento OFX novo contra a identidade legada com arredondamento", () => {
  const current = {
    source: "import" as const,
    paymentMethod: "credit" as const,
    fingerprint: "ofx-installment:card:uv|fitid:purchase-1|occurrence:1|part:3/18",
    description: "Samsung - Shop.com - NuPay",
    amount: 110.78,
    invoiceMonth: "2026-06",
    date: "2026-05-13",
    cardId: "uv",
    installments: "3/18",
  };
  const candidates = importFingerprintCandidates(current);

  assert.ok(candidates.includes("installment-family:card:uv|anchor:2026-04|description:samsung - shop.com - nupay|amount:110.79|total:18|occurrence:1|part:3/18"));
});
