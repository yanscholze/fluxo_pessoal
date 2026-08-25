/**
 * Últimos lançamentos registrados.
 *
 * Tabela e não lista: aqui o usuário compara valores e varre datas, e coluna
 * alinhada é o que torna a varredura possível. A natureza do lançamento vira
 * ícone à esquerda em vez de texto — na largura de um painel, "Pagamento de
 * fatura" por extenso empurrava a descrição para fora.
 */

import type { Dashboard } from "../../../server/services/dashboard.ts";
import { DataTable, Td, Tr } from "../data-display.tsx";
import { dateShort, money } from "../format.ts";
import { ArrowDownRight, ArrowLeftRight, ArrowUpRight, type LucideIcon, Receipt } from "../icons.tsx";
import { Badge, Empty, Panel, PanelHeader, type Tone } from "../primitives.tsx";

const NATUREZA: Record<string, { label: string; icon: LucideIcon; tone: Tone }> = {
  expense: { label: "Despesa", icon: ArrowDownRight, tone: "negative" },
  income: { label: "Receita", icon: ArrowUpRight, tone: "positive" },
  transfer: { label: "Transferência", icon: ArrowLeftRight, tone: "info" },
  invoice_payment: { label: "Pagamento de fatura", icon: Receipt, tone: "caution" },
};

export function RecentPanel({ transactions }: { transactions: Dashboard["recentTransactions"] }) {
  return (
    <Panel>
      <PanelHeader
        title="Últimos lançamentos"
        icon={Receipt}
        action={
          <a href="/lancamentos" className="text-body-sm font-medium text-accent hover:underline">
            Ver extrato
          </a>
        }
      />

      {transactions.length ? (
        <DataTable
          caption="Últimos lançamentos confirmados"
          columns={[
            { key: "descricao", header: "Lançamento" },
            { key: "tipo", header: "Natureza", hideBelow: "sm" },
            { key: "data", header: "Data", align: "right" },
            { key: "valor", header: "Valor", align: "right" },
          ]}
        >
          {transactions.map((transaction) => {
            const natureza = NATUREZA[transaction.kind] ?? NATUREZA.expense;
            const Icone = natureza.icon;
            const entrada = transaction.kind === "income";

            return (
              <Tr key={transaction.id}>
                <Td>
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={`flex size-7 shrink-0 items-center justify-center rounded-md ${
                        entrada ? "bg-positive-wash text-positive" : "bg-surface-inset text-ink-muted"
                      }`}
                    >
                      <Icone size={14} strokeWidth={1.9} aria-hidden />
                    </span>
                    <span className="truncate text-body text-ink">{transaction.description}</span>
                  </span>
                </Td>
                <Td hideBelow="sm">
                  <Badge tone={natureza.tone}>{natureza.label}</Badge>
                </Td>
                <Td align="right" className="tabular whitespace-nowrap text-caption text-ink-subtle">
                  {dateShort(transaction.occurredOn)}
                </Td>
                <Td align="right">
                  <span className={`tabular text-body font-medium ${entrada ? "text-positive" : "text-ink"}`}>
                    {entrada ? "+ " : "− "}
                    {money(transaction.amountCents)}
                  </span>
                </Td>
              </Tr>
            );
          })}
        </DataTable>
      ) : (
        <Empty
          icon={Receipt}
          title="Nenhum lançamento ainda"
          hint="Registre o primeiro movimento ou importe um extrato."
        />
      )}
    </Panel>
  );
}
