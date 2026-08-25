/**
 * Gastos por categoria na competência corrente.
 *
 * Transferência e pagamento de fatura ficam de fora: eles movem dinheiro mas
 * não são consumo, e incluí-los contaria o mesmo gasto duas vezes.
 *
 * Rosca com leitura central mais lista ordenada. A rosca responde "como está
 * repartido" de longe; a lista responde "quanto foi em quê" de perto. Uma sem
 * a outra obriga o usuário a estimar ângulo ou a somar de cabeça.
 */

import type { Dashboard } from "../../../server/services/dashboard.ts";
import { DonutChart, VIZ } from "../charts.tsx";
import { money, percent } from "../format.ts";
import { PieChart } from "../icons.tsx";
import { Empty, Panel, PanelHeader } from "../primitives.tsx";

export function CategoryPanel({ categories }: { categories: Dashboard["categorySpend"] }) {
  const total = categories.reduce((soma, item) => soma + item.amountCents, 0);

  return (
    <Panel>
      <PanelHeader
        title="Para onde foi"
        icon={PieChart}
        hint={total > 0 ? "Consumo da competência, por categoria" : undefined}
      />

      {categories.length ? (
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
          <DonutChart
            slices={categories.map((categoria, i) => ({
              label: categoria.name,
              value: categoria.amountCents,
              color: categoria.color ?? VIZ[i % VIZ.length],
            }))}
            size={148}
            thickness={16}
            centerValue={money(total)}
            centerLabel="no mês"
            format={(valor) => money(valor)}
          />

          <ul className="min-w-0 flex-1 space-y-2">
            {categories.map((categoria, i) => (
              <li key={categoria.categoryId ?? "sem-categoria"} className="flex items-baseline gap-2.5">
                <span
                  className="mt-1.5 size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: categoria.color ?? VIZ[i % VIZ.length] }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-body-sm text-ink">{categoria.name}</span>
                <span className="tabular shrink-0 text-body-sm font-medium text-ink">
                  {money(categoria.amountCents)}
                </span>
                <span className="tabular w-10 shrink-0 text-right text-caption text-ink-subtle">
                  {percent(categoria.percent)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <Empty icon={PieChart} title="Nenhum gasto nesta competência" compact />
      )}
    </Panel>
  );
}
