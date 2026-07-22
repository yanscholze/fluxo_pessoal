import assert from "node:assert/strict";
import test from "node:test";

import type { FinanceCard, FinanceTransaction } from "../lib/finance-types.ts";
import { inferredInstallmentGroupId, installmentFamily, installmentParts, transactionOriginLabel } from "../lib/installments.ts";

const base = {
  description: "Compra parcelada", category: "Outros", account: "Nubank", amount: 100,
  type: "expense" as const, paymentMethod: "credit" as const, cardId: "uv", source: "import" as const,
};

test("mantém uma identidade estável para a família de parcelas", () => {
  const items: FinanceTransaction[] = Array.from({ length: 3 }, (_, index) => ({
    ...base, id: `grupo-seguro-${index + 1}`, date: `2026-0${index + 7}-10`, invoiceMonth: `2026-0${index + 7}`,
    installments: `${index + 1}/3`, installmentGroupId: "grupo-seguro",
  }));
  assert.deepEqual(installmentParts("2/3"), { current: 2, total: 3 });
  assert.equal(inferredInstallmentGroupId(items[1]), "grupo-seguro");
  assert.deepEqual(installmentFamily(items, items[1]).map((item) => item.id), ["grupo-seguro-1", "grupo-seguro-2", "grupo-seguro-3"]);
});

test("reconhece parcelas legadas pelo ID sem misturar outra compra", () => {
  const first: FinanceTransaction = { ...base, id: "compra-antiga-1", date: "2026-07-10", installments: "1/2" };
  const second: FinanceTransaction = { ...base, id: "compra-antiga-2", date: "2026-08-10", installments: "2/2" };
  const other: FinanceTransaction = { ...base, id: "outra-compra-1", date: "2026-07-11", installments: "1/2" };
  assert.deepEqual(installmentFamily([other, second, first], second).map((item) => item.id), [first.id, second.id]);
});

test("mostra o cartão como origem de uma compra no crédito", () => {
  const card = { id: "uv", name: "Nubank Ultravioleta" } as FinanceCard;
  const transaction: FinanceTransaction = { ...base, id: "tx-credit", date: "2026-07-10" };
  assert.equal(transactionOriginLabel(transaction, [card]), "Nubank Ultravioleta");
  assert.equal(transactionOriginLabel({ ...transaction, cardId: undefined, paymentMethod: "debit" }, [card]), "Nubank");
});
