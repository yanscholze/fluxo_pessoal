import assert from "node:assert/strict";
import test from "node:test";
import { formatAccountMoney, normalizeAccountCurrency } from "../lib/currency.ts";

test("normaliza somente moedas suportadas", () => {
  assert.equal(normalizeAccountCurrency("usd"), "USD");
  assert.equal(normalizeAccountCurrency("inexistente"), "BRL");
});

test("formata o saldo na moeda própria da conta", () => {
  assert.match(formatAccountMoney(1250.5, "USD"), /US\$/);
  assert.match(formatAccountMoney(1250.5, "BRL"), /R\$/);
});
