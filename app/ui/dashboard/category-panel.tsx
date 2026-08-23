/**
 * Gastos por categoria na competência corrente.
 *
 * Transferência e pagamento de fatura ficam de fora: eles movem dinheiro mas
 * não são consumo, e incluí-los contaria o mesmo gasto duas vezes.
 */

import type { Dashboard } from "../../../server/services/dashboard.ts";
import { Card, Empty, Meter, SectionHeading } from "../primitives.tsx";
import { money, percent } from "../format.ts";

export function CategoryPanel({ categories }: { categories: Dashboard["categorySpend"] }) {
  const maior = categories[0]?.amountCents ?? 0;
  const total = categories.reduce((soma, item) => soma + item.amountCents, 0);

  return (
    <Card>
      <SectionHeading title="Para onde foi" hint={total > 0 ? `${money(total)} nas principais categorias` : undefined} />
      {categories.length ? (
        <ul className="space-y-3">
          {categories.map((categoria) => (
            <li key={categoria.categoryId ?? "sem-categoria"}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: categoria.color }}
                    aria-hidden
                  />
                  <span className="truncate text-[0.8125rem] text-ink">{categoria.name}</span>
                </span>
                <span className="tabular shrink-0 text-[0.8125rem] text-ink">
                  {money(categoria.amountCents)}
                  <span className="ml-1.5 text-[0.75rem] text-ink-subtle">{percent(categoria.percent)}</span>
                </span>
              </div>
              <Meter value={categoria.amountCents} total={maior} tone="accent" label={categoria.name} />
            </li>
          ))}
        </ul>
      ) : (
        <Empty title="Nenhum gasto registrado nesta competência" />
      )}
    </Card>
  );
}
