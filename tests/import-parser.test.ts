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
  assert.equal(new Set(result.items.map((item) => item.installmentGroupId)).size, 1);
  assert.ok(result.items[0]?.installmentGroupId);
  assert.ok(result.items.every((item) => item.description === "Notebook"));
  assert.deepEqual(result.items.map((item) => item.invoiceMonth), ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]);
  assert.equal(result.items.filter((item) => item.invoiceMonth === "2026-07").reduce((sum, item) => sum + item.amount, 0), 250);
});

test("faturas consecutivas reconhecem a mesma família de parcelamento", () => {
  const december = parseCsv(`Data;Descrição;Valor\n12/12/2025;Notebook - Parcela 1/5;250,00`, "Nubank", nubankCard, "2025-12");
  const january = parseCsv(`Data;Descrição;Valor\n12/12/2025;Notebook - Parcela 2/5;250,00`, "Nubank", nubankCard, "2026-01");

  assert.deepEqual(december.items.map((item) => item.fingerprint), january.items.map((item) => item.fingerprint));
  assert.deepEqual(december.items.map((item) => item.installmentGroupId), january.items.map((item) => item.installmentGroupId));
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

test("OFX usa FITID como identidade bancária estável", () => {
  const ofx = `<OFX><STMTTRN><DTPOSTED>20260717000000<TRNAMT>-80.00<FITID>bank-transaction-123<MEMO>Mercado</STMTTRN></OFX>`;
  const first = parseOfx(ofx, "Nubank");
  const second = parseOfx(ofx, "Nubank");

  assert.equal(first.items[0]?.fingerprint, "ofx:bank-transaction-123");
  assert.equal(first.items[0]?.fingerprint, second.items[0]?.fingerprint);
});

test("OFX XML com tags fechadas, atributos e entidades preserva os detalhes", () => {
  const ofx = `OFXHEADER:100\nDATA:OFXSGML\n\n<OFX><BANKTRANLIST>
<STMTTRN id="1"><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260719000000[-3:BRT]</DTPOSTED><TRNAMT>-1,234.56</TRNAMT><FITID>xml-1</FITID><NAME>POSTO &amp; CIA</NAME><MEMO>Combustível premium</MEMO></STMTTRN>
</BANKTRANLIST></OFX>`;

  const result = parseOfx(ofx, "Nubank");

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.amount, 1234.56);
  assert.equal(result.items[0]?.description, "POSTO & CIA - Combustível premium");
  assert.equal(result.items[0]?.fingerprint, "ofx:xml-1");
});

test("OFX de cartão entra na fatura selecionada e reconhece parcelamento", () => {
  const ofx = `<OFX><CCSTMTRS><BANKTRANLIST>
<CCSTMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260715000000<TRNAMT>-250.00<FITID>card-1<NAME>Notebook<MEMO>Parcela 3/5</CCSTMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260716000000<TRNAMT>1000.00<FITID>payment-1<MEMO>Pagamento recebido</STMTTRN>
</BANKTRANLIST></CCSTMTRS></OFX>`;

  const result = parseOfx(ofx, "Nubank", nubankCard, "2026-07");

  assert.equal(result.items.length, 5);
  assert.equal(result.ignored, 1);
  assert.equal(result.expandedInstallments, 4);
  assert.ok(result.items.every((item) => item.type === "expense" && item.paymentMethod === "credit" && item.cardId === nubankCard.id));
  assert.deepEqual(result.items.map((item) => item.invoiceMonth), ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]);
  assert.equal(result.items.find((item) => item.invoiceMonth === "2026-07")?.installments, "3/5");
});

test("OFX do Nubank mantém a mesma família entre faturas mesmo com diferença de centavos", () => {
  const april = `<OFX><STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260409000000[-3:BRT]</DTPOSTED><TRNAMT>-110.79</TRNAMT><FITID>69d7cae8-e15f-4fd7-a552-d714024b9946</FITID><MEMO>Samsung - Shop.com - NuPay - Parcela 1/18</MEMO></STMTTRN></OFX>`;
  const june = `<OFX><STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260513000000[-3:BRT]</DTPOSTED><TRNAMT>-110.78</TRNAMT><FITID>69d7cae8-e15f-4fd7-a552-d714024b9946</FITID><MEMO>Samsung - Shop.com - NuPay - Parcela 3/18</MEMO></STMTTRN></OFX>`;

  const first = parseOfx(april, "Nubank", nubankCard, "2026-04");
  const later = parseOfx(june, "Nubank", nubankCard, "2026-06");

  assert.deepEqual(first.items.map((item) => item.fingerprint), later.items.map((item) => item.fingerprint));
  assert.deepEqual(first.items.map((item) => item.installmentGroupId), later.items.map((item) => item.installmentGroupId));
});

test("OFX preserva o deslocamento entre a data do lançamento e a competência da fatura", () => {
  const ofx = `<OFX><STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260613000000[-3:BRT]</DTPOSTED><TRNAMT>-160.00</TRNAMT><FITID>purchase-1</FITID><MEMO>Pgz*Trustmoto - Parcela 4/10</MEMO></STMTTRN></OFX>`;

  const result = parseOfx(ofx, "Nubank", nubankCard, "2026-07");

  assert.equal(result.items.find((item) => item.installments === "4/10")?.date, "2026-06-13");
  assert.equal(result.items.find((item) => item.installments === "5/10")?.date, "2026-07-13");
  assert.equal(result.items.find((item) => item.installments === "5/10")?.invoiceMonth, "2026-08");
});
