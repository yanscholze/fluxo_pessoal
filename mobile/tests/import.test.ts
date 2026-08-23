import assert from "node:assert/strict";
import test from "node:test";
import { parseImportedText } from "../src/import.ts";

const card = { id: "uv", name: "Nubank Ultravioleta", linkedAccount: "Nubank", kind: "credit" as const, brand: "Mastercard", tier: "Black", last4: "1234", limit: 10000, closingDay: 20, dueDay: 27, pointsPerDollar: 2.2, cashbackPercent: 1.25, rewardMode: "both", pointsGoal: 30000, color: "#4c188a" };

test("separa a mesma compra por competência de fatura", () => {
  const csv = "data;descricao;valor\n10/07/2026;Mercado;100,00";
  const july = parseImportedText(csv, "csv", { account: "Nubank", card, invoiceMonth: "2026-07" });
  const august = parseImportedText(csv, "csv", { account: "Nubank", card, invoiceMonth: "2026-08" });
  assert.equal(july.items[0]?.invoiceMonth, "2026-07");
  assert.equal(august.items[0]?.invoiceMonth, "2026-08");
  assert.notEqual(july.items[0]?.fingerprint, august.items[0]?.fingerprint);
});

test("expande uma parcela intermediária para todo o histórico", () => {
  const csv = "data;descricao;valor\n10/07/2026;Notebook parcela 3/5;250,00";
  const result = parseImportedText(csv, "csv", { account: "Nubank", card, invoiceMonth: "2026-07" });
  assert.deepEqual(result.items.map((item) => item.invoiceMonth), ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]);
  assert.ok(result.items.every((item) => item.description === "Notebook"));
  assert.equal(result.expandedInstallments, 4);
});

test("ignora pagamento e crédito recebido dentro da fatura", () => {
  const csv = "data;descricao;valor\n10/07/2026;Compra;100,00\n15/07/2026;Pagamento recebido;-100,00";
  const result = parseImportedText(csv, "csv", { account: "Nubank", card, invoiceMonth: "2026-07" });
  assert.equal(result.items.length, 1);
  assert.equal(result.ignored, 1);
});

test("mantém compras idênticas como linhas distintas", () => {
  const csv = "data;descricao;valor\n10/07/2026;Estacionamento;30,00\n10/07/2026;Estacionamento;30,00";
  const result = parseImportedText(csv, "csv", { account: "Nubank", card, invoiceMonth: "2026-07" });
  assert.equal(result.items.length, 2);
  assert.notEqual(result.items[0]?.fingerprint, result.items[1]?.fingerprint);
});
