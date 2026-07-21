import assert from "node:assert/strict";
import test from "node:test";

import { parseCsv, parseOfx } from "../lib/import-parser.ts";
import type { FinanceCard } from "../lib/finance-types.ts";

const nubankCard: FinanceCard = {
  id: "nubank-uv",
  name: "Nubank Ultravioleta",
  linkedAccount: "Nubank",
  kind: "credit",
  brand: "Mastercard",
  tier: "Black",
  last4: "0000",
  limit: 0,
  closingDay: 1,
  dueDay: 8,
  dueAdjustment: "next",
  pointsPerDollar: 2.2,
  cashbackPercent: 1.25,
  rewardMode: "both",
  pointsGoal: 30000,
  manualUsdRate: 0,
  color: "uv",
};

test("CSV preserva descrições multilinha e ignora pagamento da fatura", () => {
  const csv = `Data;Descrição;Valor
17/07/2026;"Mercado
Linha complementar";123,45
17/07/2026;"Pagamento recebido";100,00
18/07/2026;"Posto";50,00`;

  const result = parseCsv(csv, "Nubank", nubankCard, "2026-07");

  assert.equal(result.items.length, 2);
  assert.equal(result.ignored, 1);
  assert.match(result.items[0].description, /Linha complementar/);
  assert.equal(result.items[0].type, "expense");
  assert.equal(result.items[0].invoiceMonth, "2026-07");
  assert.equal(result.items[0].amount, 123.45);
  assert.match(result.ignoredReasons.join(" "), /pagamentos recebidos/);
});

test("CSV de fatura vincula todas as compras ao mês da fatura sem alterar suas datas", () => {
  const csv = `Data;Descrição;Valor
30/06/2026;Hospedagem;1700,00
29/06/2026;Mercado;1200,00
28/06/2026;Oficina;1820,00
02/07/2026;Farmácia;60,00
03/07/2026;Combustível;50,00
04/07/2026;Restaurante;70,00
08/07/2026;Pagamento recebido;-4900,00`;

  const result = parseCsv(csv, "Nubank", nubankCard, "2026-07");
  const julyInvoice = result.items.filter((item) => item.invoiceMonth === "2026-07");

  assert.equal(result.items.length, 6);
  assert.equal(result.ignored, 1);
  assert.equal(julyInvoice.reduce((sum, item) => sum + item.amount, 0), 4900);
  assert.equal(result.items[0].date, "2026-06-30");
  assert.ok(result.items.every((item) => item.invoiceMonth === "2026-07"));
});

test("faturas de competências diferentes nunca compartilham a mesma identidade", () => {
  const csv = `Data;Descrição;Valor
17/07/2026;Mercado;123,45`;

  const july = parseCsv(csv, "Nubank", nubankCard, "2026-07");
  const august = parseCsv(csv, "Nubank", nubankCard, "2026-08");

  assert.notEqual(july.items[0]?.fingerprint, august.items[0]?.fingerprint);
  assert.equal(july.items[0]?.invoiceMonth, "2026-07");
  assert.equal(august.items[0]?.invoiceMonth, "2026-08");
});

test("parcela identificada na fatura preenche histórico e meses futuros", () => {
  const csv = `Data;Descrição;Valor
12/07/2026;Notebook - Parcela 3/5;250,00`;

  const result = parseCsv(csv, "Nubank", nubankCard, "2026-07");

  assert.equal(result.items.length, 5);
  assert.equal(result.expandedInstallments, 4);
  assert.deepEqual(result.items.map((item) => item.installments), ["1/5", "2/5", "3/5", "4/5", "5/5"]);
  assert.ok(result.items.every((item) => item.description === "Notebook"));
  assert.deepEqual(result.items.map((item) => item.invoiceMonth), ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]);
  assert.equal(result.items.filter((item) => item.invoiceMonth === "2026-07").reduce((sum, item) => sum + item.amount, 0), 250);
});

test("compras realmente idênticas continuam sendo dois itens da fatura", () => {
  const csv = `Data;Descrição;Valor
17/07/2026;Estacionamento;30,00
17/07/2026;Estacionamento;30,00`;
  const result = parseCsv(csv, "Nubank", nubankCard, "2026-07");
  assert.equal(result.items.length, 2);
  assert.notEqual(result.items[0]?.fingerprint, result.items[1]?.fingerprint);
});

test("CSV de conta preserva entradas como renda", () => {
  const csv = `date,description,amount
2026-07-05,Auxílio faculdade,350.00
2026-07-07,Seguro do carro,-120.00`;

  const result = parseCsv(csv, "Nubank");

  assert.deepEqual(result.items.map(({ type, amount }) => ({ type, amount })), [
    { type: "income", amount: 350 },
    { type: "expense", amount: 120 },
  ]);
});

test("OFX lê todas as movimentações até o fim do arquivo", () => {
  const ofx = `<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260717000000<TRNAMT>-80.00<MEMO>Mercado</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260718000000<TRNAMT>2200.00<MEMO>Salário</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

  const result = parseOfx(ofx, "Nubank");

  assert.equal(result.items.length, 2);
  assert.equal(result.items.at(-1)?.description, "Salário");
  assert.equal(result.items.at(-1)?.type, "income");
});
