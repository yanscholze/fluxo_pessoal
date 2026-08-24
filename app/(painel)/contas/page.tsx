import { redirect } from "next/navigation";

import { buildAccountsView } from "../../../server/services/accounts.ts";
import { currentUser } from "../../auth-context.ts";
import { Badge, Card, Empty, Figure, Label, Meter, SectionHeading } from "../../ui/primitives.tsx";
import { competenceShort, money, moneyCompact, percent } from "../../ui/format.ts";
import { NewAccount } from "./new-account.tsx";

export const dynamic = "force-dynamic";

const NOME_DO_TIPO: Record<string, string> = {
  checking: "Conta corrente",
  savings: "Poupança",
  cash: "Dinheiro",
  benefit: "Benefício",
  investment: "Investimento",
};

export default async function Contas() {
  const user = await currentUser();
  if (!user) redirect("/entrar");

  const view = await buildAccountsView(user.id);
  const maiorHistorico = Math.max(1, ...view.history.map((ponto) => ponto.balanceCents));

  return (
    <main className="mx-auto w-full max-w-[76rem] px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.625rem] font-semibold tracking-[-0.02em] text-ink">Contas</h1>
          <p className="mt-1 text-[0.875rem] text-ink-muted">
            Quanto existe agora em cada lugar. O que ainda vai entrar aparece como projeção.
          </p>
        </div>
        <NewAccount />
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card as="article">
          <Label>Disponível</Label>
          <Figure value={money(view.totals.spendableCents)} size="sm" className="mt-1.5" />
          <p className="mt-2 text-[0.75rem] text-ink-subtle">Conta corrente, dinheiro e benefício</p>
        </Card>
        <Card as="article">
          <Label>Reservado</Label>
          <Figure value={money(view.totals.investedCents)} size="sm" className="mt-1.5" />
          <p className="mt-2 text-[0.75rem] text-ink-subtle">Poupança e investimentos</p>
        </Card>
        <Card as="article">
          <Label>Patrimônio em contas</Label>
          <Figure value={money(view.totals.totalCents)} size="sm" className="mt-1.5" />
          {view.totals.byForeignCurrency.length ? (
            <p className="mt-2 text-[0.75rem] text-ink-subtle">
              Fora do total:{" "}
              {view.totals.byForeignCurrency
                .map((item) => money(item.balanceCents, { currency: item.currency }))
                .join(" · ")}
            </p>
          ) : (
            <p className="mt-2 text-[0.75rem] text-ink-subtle">Somente contas em reais entram no total</p>
          )}
        </Card>
      </div>

      {view.history.some((ponto) => ponto.balanceCents !== 0) ? (
        <Card className="mt-5">
          <SectionHeading title="Evolução" hint="Saldo somado das contas em reais ao fim de cada mês" />
          <ol className="flex items-end gap-1.5" style={{ height: "8rem" }}>
            {view.history.map((ponto) => (
              <li key={ponto.competence} className="flex h-full flex-1 flex-col justify-end">
                <div
                  className={`w-full rounded-t-sm ${ponto.balanceCents < 0 ? "bg-negative" : "bg-accent"}`}
                  style={{ height: `${Math.max(2, (Math.abs(ponto.balanceCents) / maiorHistorico) * 100)}%` }}
                  title={`${competenceShort(ponto.competence)}: ${money(ponto.balanceCents)}`}
                />
              </li>
            ))}
          </ol>
          <ol className="mt-2 flex gap-1.5">
            {view.history.map((ponto) => (
              <li key={ponto.competence} className="flex-1 text-center text-[0.625rem] text-ink-subtle">
                {competenceShort(ponto.competence).slice(0, 3)}
              </li>
            ))}
          </ol>
          <p className="mt-2 text-[0.75rem] text-ink-subtle">
            Último mês: {moneyCompact(view.history.at(-1)?.balanceCents ?? 0)}
          </p>
        </Card>
      ) : null}

      <section className="mt-6">
        <h2 className="mb-3 text-[0.9375rem] font-semibold text-ink">Suas contas</h2>
        {view.accounts.length ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {view.accounts.map((account) => (
              <Card key={account.id} as="article">
                <header className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="h-7 w-7 rounded-lg"
                      style={{ backgroundColor: account.color }}
                      aria-hidden
                    />
                    <div>
                      <h3 className="flex items-center gap-2 text-[0.9375rem] font-semibold text-ink">
                        {account.name}
                        {!account.includeInTotals ? <Badge>fora dos totais</Badge> : null}
                      </h3>
                      <p className="text-[0.75rem] text-ink-subtle">
                        {NOME_DO_TIPO[account.kind] ?? account.kind}
                        {account.institution !== "manual" ? ` · ${account.institution}` : ""}
                      </p>
                    </div>
                  </div>
                  <p
                    className={`tabular text-[1.125rem] font-semibold ${
                      account.balanceCents < 0 ? "text-negative" : "text-ink"
                    }`}
                  >
                    {money(account.balanceCents, { currency: account.currency })}
                  </p>
                </header>

                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[0.75rem]">
                  <dt className="text-ink-subtle">Entradas no mês</dt>
                  <dd className="tabular text-right text-positive">{money(account.inflowCents)}</dd>
                  <dt className="text-ink-subtle">Saídas no mês</dt>
                  <dd className="tabular text-right text-ink">{money(account.outflowCents)}</dd>
                  {account.projectedCents !== account.balanceCents ? (
                    <>
                      <dt className="text-ink-subtle">Previsto até o fim do mês</dt>
                      <dd className="tabular text-right text-ink-muted">{money(account.projectedCents)}</dd>
                    </>
                  ) : null}
                  {account.expectedYieldCents > 0 ? (
                    <>
                      <dt className="text-ink-subtle">Rendimento estimado</dt>
                      <dd className="tabular text-right text-ink-muted">{money(account.expectedYieldCents)}</dd>
                    </>
                  ) : null}
                </dl>

                {account.goalCents && account.goalPercent !== null ? (
                  <div className="mt-3">
                    <Meter
                      value={account.balanceCents}
                      total={account.goalCents}
                      tone="positive"
                      label={`Meta de ${account.name}`}
                    />
                    <p className="mt-1.5 text-[0.75rem] text-ink-subtle">
                      {percent(account.goalPercent)} da meta de {money(account.goalCents)}
                    </p>
                  </div>
                ) : null}
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <Empty
              title="Nenhuma conta cadastrada"
              hint="Cadastre suas contas para o Fluxo calcular saldo, patrimônio e livre para gastar."
            />
          </Card>
        )}
      </section>
    </main>
  );
}
