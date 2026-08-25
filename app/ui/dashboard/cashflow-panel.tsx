/**
 * Fluxo futuro.
 *
 * Mostra como o saldo evolui nos próximos meses considerando o que já está
 * previsto. É projeção, e a tela diz isso — misturar com saldo atual seria
 * apresentar dinheiro que ainda não existe como se existisse. Por isso a
 * linha do saldo projetado é **tracejada**: o traço é a diferença entre fato e
 * previsão, e ela precisa ser lida sem legenda.
 */

import type { Dashboard } from "../../../server/services/dashboard.ts";
import { ChartFrame, LineChart, chartColor } from "../charts.tsx";
import { competenceShort, money, moneyCompact } from "../format.ts";
import { Empty, Panel, PanelHeader } from "../primitives.tsx";
import { TrendingUp } from "../icons.tsx";

export function CashflowPanel({ points }: { points: Dashboard["cashflow"] }) {
  const comMovimento = points.filter((point) => point.inflowCents > 0 || point.outflowCents > 0);

  if (!comMovimento.length) {
    return (
      <Panel>
        <PanelHeader title="Fluxo futuro" icon={TrendingUp} />
        <Empty
          icon={TrendingUp}
          title="Sem projeção para os próximos meses"
          hint="Recorrências e parcelas em aberto alimentam esta previsão."
        />
      </Panel>
    );
  }

  const rotulos = points.map((point) => competenceShort(point.competence));
  const fim = points.at(-1);

  return (
    <Panel>
      <ChartFrame
        title="Fluxo futuro"
        hint="Saldo projetado ao fim de cada mês, com o que já está previsto"
        readout={
          fim ? (
            <p className="text-body-sm text-ink-muted">
              Em {competenceShort(fim.competence)}:{" "}
              <span
                className={`tabular font-semibold ${
                  fim.projectedBalanceCents < 0 ? "text-negative" : "text-ink"
                }`}
              >
                {money(fim.projectedBalanceCents)}
              </span>
            </p>
          ) : null
        }
        legend={[
          { label: "Entradas", color: chartColor("positive") },
          { label: "Saídas", color: chartColor("negative") },
          { label: "Saldo projetado", color: chartColor("accent") },
        ]}
      >
        <LineChart
          labels={rotulos}
          height={190}
          zeroLine
          format={(valor) => money(valor)}
          series={[
            {
              id: "entradas",
              label: "Entradas",
              color: chartColor("positive"),
              values: points.map((point) => point.inflowCents),
            },
            {
              id: "saidas",
              label: "Saídas",
              color: chartColor("negative"),
              values: points.map((point) => point.outflowCents),
            },
            {
              id: "saldo",
              label: "Saldo projetado",
              color: chartColor("accent"),
              values: points.map((point) => point.projectedBalanceCents),
              projected: true,
              fill: true,
            },
          ]}
        />
      </ChartFrame>

      <ol className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-6">
        {points.map((point) => (
          <li key={point.competence} className="bg-surface px-2 py-2 text-center">
            <p className="text-caption text-ink-subtle">{competenceShort(point.competence)}</p>
            <p
              className={`tabular mt-0.5 text-body-sm font-medium ${
                point.projectedBalanceCents < 0 ? "text-negative" : "text-ink"
              }`}
            >
              {moneyCompact(point.projectedBalanceCents)}
            </p>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
