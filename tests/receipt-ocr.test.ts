import assert from "node:assert/strict";
import test from "node:test";
import { normalizeReceiptResult } from "../lib/receipt-ocr.ts";

test("normaliza os dados do cupom e respeita as categorias do usuário", () => {
  const result = normalizeReceiptResult({
    merchant: "Mercado Exemplo",
    description: "Compra no Mercado Exemplo",
    date: "2026-07-20",
    total: 82.349,
    category: "alimentacao",
    paymentHint: "credit",
    confidence: 1.4,
    items: [{ description: "Arroz", quantity: 2, unitPrice: 12.5, total: 25 }],
    warnings: ["Confira o total"],
  }, ["Alimentação", "Transporte", "Outros"]);

  assert.equal(result.category, "Alimentação");
  assert.equal(result.total, 82.35);
  assert.equal(result.date, "2026-07-20");
  assert.equal(result.paymentHint, "credit");
  assert.equal(result.confidence, 1);
  assert.deepEqual(result.items[0], { description: "Arroz", quantity: 2, unitPrice: 12.5, total: 25 });
});

test("usa fallback seguro quando o OCR devolve campos inválidos", () => {
  const result = normalizeReceiptResult({
    merchant: "",
    description: "",
    date: "20/07/2026",
    total: -10,
    category: "Categoria inventada",
    paymentHint: "pix",
    confidence: -1,
    items: [{ description: "", quantity: 0, unitPrice: -4, total: -4 }],
    warnings: [123, "Imagem cortada"],
  }, ["Lazer", "Outros"]);

  assert.equal(result.description, "Compra por cupom");
  assert.equal(result.category, "Outros");
  assert.equal(result.date, "");
  assert.equal(result.total, 0);
  assert.equal(result.paymentHint, "unknown");
  assert.equal(result.confidence, 0);
  assert.deepEqual(result.items, []);
  assert.deepEqual(result.warnings, ["Imagem cortada"]);
});

test("não escolhe a primeira categoria quando o OCR não sugere uma", () => {
  const result = normalizeReceiptResult({ category: "" }, ["Lazer", "Outros"]);

  assert.equal(result.category, "Outros");
});
