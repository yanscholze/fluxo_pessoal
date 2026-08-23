/**
 * Fluxo futuro.
 *
 * Mostra como o saldo evolui nos próximos meses considerando o que já está
 * previsto. É projeção, e a tela diz isso — misturar com saldo atual seria
 * apresentar dinheiro que ainda não existe como se existisse.
 */

import type { Dashboard } from "../../../server/services/dashboard.ts";
import { Card, Empty, SectionHeading } from "../primitives.tsx";
import { competenceShort, money, moneyCompact } from "../format.ts";

export function CashflowPanel({ points }: { points: Dashboard["cashflow"] }) {
  const comMovimento = points.filter((point) => point.inflowCents > 0 || point.outflowCents > 0);
  if (!comMovimento.length) {
    return (
      <Card>
        <SectionHeading title="Fluxo futuro" />
        <Empty
          title="Sem projeção para os próximos meses"
          hint="Recorrências e parcelas em aberto alimentam esta previsão."
        />
      </Card>
    );
  }

  // A escala inclui o zero para que um saldo negativo apareça abaixo da linha,
  // em vez de ser desenhado como se fosse uma barra pequena positiva.
  const valores = points.map((point) => point.projectedBalanceCents);
  const maximo = Math.max(0, ...valores);
  const minimo = Math.min(0, ...valores);
  const amplitude = maximo - minimo || 1;
  const linhaZero = ((maximo - 0) / amplitude) * 100;

  return (
    <Card>
      <SectionHeading title="Fluxo futuro" hint="Saldo projetado ao fim de cada mês, com o que já está previsto" />

      <div className="relative h-40">
        <div
          className="absolute inset-x-0 border-t border-dashed border-line-strong"
          style={{ top: `${linhaZero}%` }}
          aria-hidden
        />
        <ol className="flex h-full items-stretch gap-2">
          {points.map((point) => {
            const alturaSaldo = ((point.projectedBalanceCents - minimo) / amplitude) * 100;
            const negativo = point.projectedBalanceCents < 0;
            return (
              <li key={point.competence} className="flex flex-1 flex-col justify-end">
                <span className="tabular mb-1 text-center text-[0.6875rem] text-ink-subtle">
                  {moneyCompact(point.projectedBalanceCents)}
                </span>
                <div
                  className={`w-full rounded-t-sm ${negativo ? "bg-negative" : "bg-accent"}`}
                  style={{ height: `${Math.max(2, alturaSaldo)}%` }}
                  title={`${competenceShort(point.competence)}: ${money(point.projectedBalanceCents)}`}
                />
              </li>
            );
          })}
        </ol>
      </div>

      <ol className="mt-2 flex gap-2">
        {points.map((point) => (
          <li key={point.competence} className="flex-1 text-center text-[0.6875rem] text-ink-subtle">
            {competenceShort(point.competence)}
          </li>
        ))}
      </ol>
    </Card>
  );
}
