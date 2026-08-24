import Link from "next/link";
import { redirect } from "next/navigation";

import { type ReportPeriod, buildReport } from "../../../server/services/reports.ts";
import { currentUser } from "../../auth-context.ts";
import { Card, Empty, Figure, Label, Meter, SectionHeading } from "../../ui/primitives.tsx";
import { competenceShort, money, moneyCompact, percent } from "../../ui/format.ts";

export const dynamic = "force-dynamic";

const PERIODOS: readonly [ReportPeriod, string][] = [
  ["mes", "Mês"],
  ["3m", "3 meses"],
  ["6m", "6 meses"],
  ["12m", "1 ano"],
  ["todos", "Tudo"],
];

function periodoValido(valor: string | undefined): ReportPeriod {
  return PERIODOS.some(([chave]) => chave === valor) ? (valor as ReportPeriod) : "6m";
}

export default async function Relatorios({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/entrar");

  const params = await searchParams;
  const periodo = periodoValido(params.periodo);
  const report = await buildReport(user.id, periodo);

  const maiorFluxo = Math.max(
    1,
    ...report.monthly.map((ponto) => Math.max(ponto.incomeCents, ponto.expenseCents)),
  );
  const maiorCategoria = report.expensesByCategory[0]?.amountCents ?? 1;

  return (
    <main className="mx-auto w-full max-w-[76rem] px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.625rem] font-semibold tracking-[-0.02em] text-ink">Relatórios</h1>
          <p className="mt-1 text-[0.875rem] text-ink-muted">
            {competenceShort(report.from)} a {competenceShort(report.to)} ·{" "}
            {report.indicators.transactionCount} lançamentos
          </p>
        </div>

        <nav className="flex flex-wrap gap-1.5">
          {PERIODOS.map(([chave, rotulo]) => (
            <Link
              key={chave}
              href={`/relatorios?periodo=${chave}`}
              aria-current={periodo === chave ? "page" : undefined}
              className={`rounded-[--radius-control] border px-3 py-1.5 text-[0.8125rem] ${
                periodo === chave
                  ? "border-accent bg-accent-wash font-medium text-accent"
                  : "border-line text-ink-muted hover:bg-surface-sunken"
              }`}
            >
              {rotulo}
            </Link>
          ))}
        </nav>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card as="article">
          <Label>Entradas</Label>
          <Figure value={money(report.indicators.incomeCents)} size="sm" tone="positive" className="mt-1.5" />
        </Card>
        <Card as="article">
          <Label>Saídas</Label>
          <Figure value={money(report.indicators.expenseCents)} size="sm" className="mt-1.5" />
          <p className="mt-2 text-[0.75rem] text-ink-subtle">
            {money(report.indicators.averageMonthlyExpenseCents)} por mês em média
          </p>
        </Card>
        <Card as="article">
          <Label>Resultado</Label>
          <Figure
            value={money(report.indicators.netCents, { signed: true })}
            size="sm"
            tone={report.indicators.netCents < 0 ? "negative" : "positive"}
            className="mt-1.5"
          />
        </Card>
        <Card as="article">
          <Label>Taxa de poupança</Label>
          <Figure
            value={percent(report.indicators.savingsRatePercent)}
            size="sm"
            tone={report.indicators.savingsRatePercent < 0 ? "negative" : "neutral"}
            className="mt-1.5"
          />
          <p className="mt-2 text-[0.75rem] text-ink-subtle">Do que entrou, quanto sobrou</p>
        </Card>
      </div>

      {report.insights.length ? (
        <Card className="mt-5">
          <SectionHeading title="O que os números dizem" />
          <ul className="space-y-1.5">
            {report.insights.map((frase) => (
              <li key={frase} className="text-[0.875rem] text-ink">
                {frase}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <SectionHeading title="Entradas e saídas" hint="Mês a mês, só o que passou por conta" />
          {report.monthly.length ? (
            <>
              <ol className="flex items-end gap-2" style={{ height: "10rem" }}>
                {report.monthly.map((ponto) => (
                  <li key={ponto.competence} className="flex h-full flex-1 items-end gap-0.5">
                    <div
                      className="w-1/2 rounded-t-sm bg-positive"
                      style={{ height: `${Math.max(2, (ponto.incomeCents / maiorFluxo) * 100)}%` }}
                      title={`${competenceShort(ponto.competence)} entradas: ${money(ponto.incomeCents)}`}
                    />
                    <div
                      className="w-1/2 rounded-t-sm bg-negative"
                      style={{ height: `${Math.max(2, (ponto.expenseCents / maiorFluxo) * 100)}%` }}
                      title={`${competenceShort(ponto.competence)} saídas: ${money(ponto.expenseCents)}`}
                    />
                  </li>
                ))}
              </ol>
              <ol className="mt-2 flex gap-2">
                {report.monthly.map((ponto) => (
                  <li key={ponto.competence} className="flex-1 text-center text-[0.625rem] text-ink-subtle">
                    {competenceShort(ponto.competence).slice(0, 3)}
                  </li>
                ))}
              </ol>
              <p className="mt-2 flex gap-4 text-[0.75rem] text-ink-subtle">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-positive" aria-hidden /> entradas
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-negative" aria-hidden /> saídas
                </span>
              </p>
            </>
          ) : (
            <Empty title="Nenhum movimento no período" />
          )}
        </Card>

        <Card>
          <SectionHeading title="Evolução do saldo" hint="Saldo somado ao fim de cada mês" />
          {report.monthly.length ? (
            <ol className="flex items-end gap-2" style={{ height: "10rem" }}>
              {report.monthly.map((ponto) => {
                const maior = Math.max(1, ...report.monthly.map((item) => Math.abs(item.balanceCents)));
                return (
                  <li key={ponto.competence} className="flex h-full flex-1 flex-col justify-end">
                    <span className="tabular mb-1 text-center text-[0.625rem] text-ink-subtle">
                      {moneyCompact(ponto.balanceCents)}
                    </span>
                    <div
                      className={`w-full rounded-t-sm ${ponto.balanceCents < 0 ? "bg-negative" : "bg-accent"}`}
                      style={{ height: `${Math.max(2, (Math.abs(ponto.balanceCents) / maior) * 100)}%` }}
                    />
                  </li>
                );
              })}
            </ol>
          ) : (
            <Empty title="Sem histórico de saldo" />
          )}
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <SectionHeading
            title="Saídas por categoria"
            action={
              report.expensesByCategory.length ? (
                <Link
                  href={`/api/v1/reports/export?periodo=${periodo}&fluxo=saidas`}
                  className="text-[0.8125rem] text-accent hover:underline"
                  prefetch={false}
                >
                  Exportar CSV
                </Link>
              ) : undefined
            }
          />
          {report.expensesByCategory.length ? (
            <ul className="space-y-3">
              {report.expensesByCategory.slice(0, 10).map((item) => (
                <li key={item.categoryId ?? "sem"}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: item.color }}
                        aria-hidden
                      />
                      <span className="truncate text-[0.8125rem] text-ink">{item.name}</span>
                      <span className="shrink-0 text-[0.6875rem] text-ink-subtle">
                        {item.transactionCount}×
                      </span>
                    </span>
                    <span className="tabular shrink-0 text-[0.8125rem] text-ink">
                      {money(item.amountCents)}
                      <span className="ml-1.5 text-[0.75rem] text-ink-subtle">{percent(item.percent)}</span>
                    </span>
                  </div>
                  <Meter value={item.amountCents} total={maiorCategoria} tone="accent" label={item.name} />
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="Nenhuma saída no período" />
          )}
        </Card>

        <Card>
          <SectionHeading title="Patrimônio hoje" />
          <dl className="space-y-2.5">
            <Linha rotulo="Investimentos" valor={money(report.indicators.investmentsCents)} />
            <Linha rotulo="Dívida de cartão" valor={money(report.indicators.cardDebtCents)} tom="text-negative" />
            <Linha
              rotulo="Patrimônio líquido"
              valor={money(report.indicators.netWorthCents)}
              destaque
              tom={report.indicators.netWorthCents < 0 ? "text-negative" : undefined}
            />
          </dl>

          {report.incomeByCategory.length ? (
            <>
              <h3 className="mt-5 mb-2 text-[0.8125rem] font-semibold text-ink">Entradas por origem</h3>
              <ul className="space-y-1.5">
                {report.incomeByCategory.slice(0, 5).map((item) => (
                  <li key={item.categoryId ?? "sem"} className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[0.8125rem] text-ink-muted">{item.name}</span>
                    <span className="tabular shrink-0 text-[0.8125rem] text-positive">
                      {money(item.amountCents)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </Card>
      </div>
    </main>
  );
}

function Linha({
  rotulo,
  valor,
  tom,
  destaque,
}: {
  rotulo: string;
  valor: string;
  tom?: string;
  destaque?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 ${destaque ? "border-t border-line pt-2.5" : ""}`}
    >
      <dt className={`text-[0.8125rem] ${destaque ? "font-medium text-ink" : "text-ink-muted"}`}>{rotulo}</dt>
      <dd className={`tabular text-[0.875rem] ${destaque ? "font-semibold" : ""} ${tom ?? "text-ink"}`}>
        {valor}
      </dd>
    </div>
  );
}
