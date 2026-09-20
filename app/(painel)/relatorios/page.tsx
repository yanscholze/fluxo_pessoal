import { buildReport } from "../../../server/services/reports.ts";
import { currentUser } from "../../auth-context.ts";
import { competenceShort, money, percent } from "../../ui/format.ts";
import { Download, TrendingUp } from "../../ui/icons.tsx";
import { MetricTile, PanelHeading } from "../../ui/mesa.tsx";
import { Empty } from "../../ui/primitives.tsx";
import { PeriodFilter, parsePeriodo } from "./period-filter.tsx";

export const dynamic = "force-dynamic";

/**
 * Relatórios.
 *
 * Três números que resumem o período e dois gráficos: a evolução do patrimônio
 * e para onde o dinheiro foi. A exportação fica no cabeçalho do primeiro
 * painel, como no desenho — é dali que se leva o mês inteiro para fora.
 */
export default async function Relatorios({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const user = await currentUser();
  // O desvio de quem não tem sessão acontece em `proxy.ts`, como resposta
  // HTTP, e o layout mostra o aviso. Lançar aqui viraria exceção na
  // renderização — que o Vite transmite como erro para todas as abas.
  if (!user) return null;

  const params = await searchParams;
  const periodo = parsePeriodo(params.periodo);
  const relatorio = await buildReport(user.id, periodo);

  const meses = relatorio.monthly.slice(-7);
  const teto = Math.max(...meses.map((ponto) => Math.abs(ponto.balanceCents)), 1);
  const categorias = relatorio.expensesByCategory.slice(0, 6);

  return (
    <div className="content-area">
      <div className="grid gap-5 md:grid-cols-3">
        <MetricTile
          tom="positive"
          icone={<TrendingUp className="size-4" aria-hidden />}
          rotulo="Patrimônio líquido"
          valor={money(relatorio.indicators.netWorthCents)}
          apoio={`${competenceShort(relatorio.from)} a ${competenceShort(relatorio.to)}`}
        />
        <MetricTile
          tom="accent"
          icone={<TrendingUp className="size-4" aria-hidden />}
          rotulo="Taxa de economia"
          valor={percent(relatorio.indicators.savingsRatePercent, 1)}
          apoio="Quanto da renda sobrou no período"
        />
        <MetricTile
          tom="caution"
          icone={<TrendingUp className="size-4" aria-hidden />}
          rotulo="Custo médio mensal"
          valor={money(relatorio.indicators.averageMonthlyExpenseCents)}
          apoio={`${relatorio.indicators.transactionCount} lançamentos no período`}
        />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <section className="glass-panel p-6">
          <PanelHeading
            titulo="Evolução patrimonial"
            apoio={`${competenceShort(relatorio.from)} a ${competenceShort(relatorio.to)}`}
            acao={
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <PeriodFilter base="/relatorios" atual={periodo} />
                <a
                  href={`/api/v1/reports/export?periodo=${periodo}&fluxo=saidas`}
                  className="inline-flex h-8 items-center gap-2 rounded-md border border-line bg-canvas px-3 text-caption font-medium text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink"
                >
                  <Download className="size-4" aria-hidden />
                  Exportar
                </a>
              </div>
            }
          />
          {meses.length > 1 ? (
            <div className="flex h-48 items-end gap-3 pt-4">
              {meses.map((ponto) => (
                <div key={ponto.competence} className="group flex h-full flex-1 flex-col justify-end gap-3">
                  <div
                    className="relative h-full overflow-hidden rounded-xl bg-surface-inset"
                    title={`${competenceShort(ponto.competence)}: ${money(ponto.balanceCents)}`}
                  >
                    <div
                      className="absolute inset-x-0 bottom-0 rounded-xl bg-accent/70 transition-all duration-500 group-hover:bg-accent"
                      style={{
                        height: `${Math.max((Math.abs(ponto.balanceCents) / teto) * 100, 2)}%`,
                      }}
                    />
                  </div>
                  <span className="text-center text-[10px] text-ink-subtle">
                    {competenceShort(ponto.competence).replace(/\s*de\s*\d+$/, "")}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <Empty title="Sem histórico suficiente" hint="A evolução precisa de ao menos dois meses." />
          )}
        </section>

        <section className="glass-panel p-6">
          <PanelHeading titulo="Para onde o dinheiro foi" apoio="Saídas por categoria no período" />
          {categorias.length ? (
            <div className="space-y-5">
              {categorias.map((categoria) => (
                <div key={categoria.categoryId ?? categoria.name}>
                  <div className="mb-2 flex justify-between text-caption">
                    <span className="min-w-0 truncate text-ink">{categoria.name}</span>
                    <span className="tabular shrink-0 text-ink-subtle">
                      {money(categoria.amountCents)}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-inset">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(categoria.percent, 2)}%`,
                        background: categoria.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty title="Nenhuma saída no período" hint="Sem despesas para distribuir." />
          )}
        </section>
      </div>

      {relatorio.insights.length ? (
        <section className="glass-panel mt-5 p-6">
          <PanelHeading titulo="O que os números dizem" apoio="Leitura automática do período" />
          <ul className="space-y-3">
            {relatorio.insights.map((frase) => (
              <li key={frase} className="flex gap-3 text-body-sm text-ink-muted">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                <span>{frase}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
