import type { StatementRow } from "../../../server/services/statement.ts";
import { DataTable, Td, Tr } from "../../ui/data-display.tsx";
import { dateShort, money } from "../../ui/format.ts";
import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  type LucideIcon,
  Receipt,
} from "../../ui/icons.tsx";
import { Badge, Empty, Panel, type Tone } from "../../ui/primitives.tsx";

const NATUREZA: Record<StatementRow["kind"], { label: string; icon: LucideIcon; tone: Tone }> = {
  expense: { label: "Despesa", icon: ArrowDownRight, tone: "negative" },
  income: { label: "Receita", icon: ArrowUpRight, tone: "positive" },
  transfer: { label: "Transferência", icon: ArrowLeftRight, tone: "info" },
  invoice_payment: { label: "Pagamento de fatura", icon: Receipt, tone: "caution" },
};

/**
 * O extrato.
 *
 * Tabela, e não lista, porque aqui o usuário **compara**: varre a coluna de
 * valores procurando o gasto grande, confere datas em sequência, checa em que
 * conta caiu. Coluna alinhada é o que torna a varredura possível; a lista da
 * versão anterior obrigava a ler cada linha inteira.
 *
 * As colunas de contexto — natureza, conta, categoria — somem no celular. A
 * descrição, a data e o valor nunca somem: sem uma delas a linha deixa de ser
 * um lançamento.
 */
export function StatementList({ rows }: { rows: readonly StatementRow[] }) {
  if (!rows.length) {
    return (
      <Panel>
        <Empty
          icon={Receipt}
          title="Nenhum lançamento nesta competência"
          hint="Registre um movimento ou navegue para outro mês."
        />
      </Panel>
    );
  }

  return (
    <Panel>
      <DataTable
        caption="Lançamentos da competência"
        columns={[
          { key: "descricao", header: "Lançamento" },
          { key: "categoria", header: "Categoria", hideBelow: "md" },
          { key: "conta", header: "Conta", hideBelow: "lg" },
          { key: "natureza", header: "Natureza", hideBelow: "lg" },
          { key: "data", header: "Data", align: "right", width: "5.5rem" },
          { key: "valor", header: "Valor", align: "right", width: "8rem" },
        ]}
      >
        {rows.map((row) => {
          const natureza = NATUREZA[row.kind];
          const Icone = natureza.icon;
          const entrada = row.kind === "income";
          const previsto = row.state === "planned";

          // Em compra no crédito a competência é a da fatura, não a do mês da
          // compra. Mostrar as duas evita a dúvida de "por que isso aparece em
          // agosto se comprei em julho?".
          const faturaDeOutroMes =
            row.originKind === "card" && row.competence !== row.occurredOn.slice(0, 7);

          return (
            <Tr key={row.id}>
              <Td>
                <span className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={`flex size-7 shrink-0 items-center justify-center rounded-md ${
                      entrada ? "bg-positive-wash text-positive" : "bg-surface-inset text-ink-muted"
                    }`}
                  >
                    <Icone size={14} strokeWidth={1.5} aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className={`truncate text-body ${previsto ? "text-ink-muted" : "text-ink"}`}>
                        {row.description}
                      </span>
                      {previsto ? <Badge tone="caution">previsto</Badge> : null}
                      {row.state === "review" ? <Badge tone="accent">a revisar</Badge> : null}
                    </span>
                    {row.installmentLabel || faturaDeOutroMes ? (
                      <span className="mt-0.5 block truncate text-caption text-ink-subtle">
                        {row.installmentLabel}
                        {row.installmentLabel && faturaDeOutroMes ? " · " : ""}
                        {faturaDeOutroMes ? `fatura ${row.competence}` : ""}
                      </span>
                    ) : null}
                  </span>
                </span>
              </Td>

              <Td hideBelow="md">
                {row.categoryName ? (
                  <span className="flex items-center gap-1.5">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: row.categoryColor ?? "var(--color-line-strong)" }}
                      aria-hidden
                    />
                    <span className="truncate text-body-sm text-ink-muted">{row.categoryName}</span>
                  </span>
                ) : (
                  <span className="text-caption text-ink-subtle">sem categoria</span>
                )}
              </Td>

              <Td hideBelow="lg" className="truncate text-body-sm text-ink-muted">
                {row.originName}
                {row.destinationName ? ` → ${row.destinationName}` : ""}
              </Td>

              <Td hideBelow="lg">
                <Badge tone={natureza.tone}>{natureza.label}</Badge>
              </Td>

              <Td align="right" className="tabular whitespace-nowrap text-caption text-ink-subtle">
                {dateShort(row.occurredOn)}
              </Td>

              <Td align="right">
                <span
                  className={`tabular whitespace-nowrap text-body font-medium ${
                    entrada ? "text-positive" : previsto ? "text-ink-muted" : "text-ink"
                  }`}
                >
                  {entrada ? "+ " : "− "}
                  {money(row.amountCents)}
                </span>
              </Td>
            </Tr>
          );
        })}
      </DataTable>
    </Panel>
  );
}
