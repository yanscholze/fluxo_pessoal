import { cents } from "../../kernel/money.ts";
import { localDate } from "../../time/local-date.ts";
import { buildReview } from "./review.ts";

const row = (description: string, amount: number) => ({
  externalId: null, date: localDate("2026-08-13"), description,
  amount: cents(amount), rawText: description, installment: null,
});

const items = buildReview(
  { format: "csv" as const, rows: [row("TARIFA MENSAL CONTA CORRENTE ITAU", -3490), row("UNITED AIRLINES 0161", -285000), row("PAGAMENTO TED", -50000)], discarded: [] },
  {
    target: { kind: "account", accountId: "acc-corrente" },
    knownFingerprints: new Set<string>(),
    categoryRules: [{ match: "united airlines", categoryId: "cat-viagem" }],
    accounts: [{ id: "acc-corrente", name: "Conta Corrente Itau" }, { id: "acc-poupanca", name: "Poupanca" }],
  },
);
console.log(items.map((i) => ({ d: i.row.description, v: i.verdict, cp: i.transferCounterpartId, cat: i.suggestedCategoryId })));
