/** Últimos lançamentos registrados. */

import type { Dashboard } from "../../../server/services/dashboard.ts";
import { Card, Empty, Row, SectionHeading } from "../primitives.tsx";
import { dateShort, money } from "../format.ts";

const ROTULO_DO_TIPO: Record<string, string> = {
  expense: "Despesa",
  income: "Receita",
  transfer: "Transferência",
  invoice_payment: "Pagamento de fatura",
};

export function RecentPanel({ transactions }: { transactions: Dashboard["recentTransactions"] }) {
  return (
    <Card>
      <SectionHeading title="Últimos lançamentos" />
      {transactions.length ? (
        <ul>
          {transactions.map((transaction) => (
            <Row
              key={transaction.id}
              title={transaction.description}
              subtitle={`${dateShort(transaction.occurredOn)} · ${ROTULO_DO_TIPO[transaction.kind] ?? transaction.kind}`}
              value={money(transaction.amountCents)}
              valueTone={transaction.kind === "income" ? "positive" : "neutral"}
            />
          ))}
        </ul>
      ) : (
        <Empty title="Nenhum lançamento ainda" hint="Registre o primeiro movimento ou importe um extrato." />
      )}
    </Card>
  );
}
