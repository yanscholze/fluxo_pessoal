import type { StatementRow } from "../../../server/services/statement.ts";
import { Badge, Card, Empty } from "../../ui/primitives.tsx";
import { dateShort, money } from "../../ui/format.ts";

const ROTULO_ORIGEM: Record<StatementRow["kind"], string> = {
  expense: "Despesa",
  income: "Receita",
  transfer: "Transferência",
  invoice_payment: "Pagamento de fatura",
};

export function StatementList({ rows }: { rows: readonly StatementRow[] }) {
  if (!rows.length) {
    return (
      <Card>
        <Empty
          title="Nenhum lançamento nesta competência"
          hint="Registre um movimento ou navegue para outro mês."
        />
      </Card>
    );
  }

  return (
    <Card className="p-0">
      <ul>
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex items-center justify-between gap-4 border-b border-line px-5 py-3 last:border-0"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span
                className="h-8 w-1 shrink-0 rounded-full"
                style={{ backgroundColor: row.categoryColor ?? "var(--color-line-strong)" }}
                aria-hidden
              />
              <div className="min-w-0">
                <p className="flex items-center gap-2 truncate text-[0.875rem] text-ink">
                  {row.description}
                  {row.state === "planned" ? <Badge tone="caution">previsto</Badge> : null}
                  {row.state === "review" ? <Badge tone="accent">a revisar</Badge> : null}
                </p>
                <p className="truncate text-[0.75rem] text-ink-subtle">
                  {dateShort(row.occurredOn)} · {row.originName}
                  {row.destinationName ? ` → ${row.destinationName}` : ""}
                  {row.categoryName ? ` · ${row.categoryName}` : ""}
                  {row.installmentLabel ? ` · ${row.installmentLabel}` : ""}
                </p>
              </div>
            </div>

            <div className="shrink-0 text-right">
              <p
                className={`tabular text-[0.875rem] font-medium ${
                  row.kind === "income" ? "text-positive" : "text-ink"
                }`}
              >
                {row.kind === "income" ? "+" : "−"} {money(row.amountCents)}
              </p>
              <p className="text-[0.75rem] text-ink-subtle">
                {ROTULO_ORIGEM[row.kind]}
                {/* Em compra no crédito, a competência é a fatura, não o mês da
                    compra — mostrar as duas evita a dúvida de "por que isso
                    aparece em agosto se comprei em julho?". */}
                {row.originKind === "card" && row.competence !== row.occurredOn.slice(0, 7)
                  ? ` · fatura ${row.competence}`
                  : ""}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
