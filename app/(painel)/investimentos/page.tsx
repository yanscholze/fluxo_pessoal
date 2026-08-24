import { redirect } from "next/navigation";

import {
  ASSET_CLASS_LABEL,
  LIQUIDITY_LABEL,
  buildInvestmentsView,
} from "../../../server/services/investments.ts";
import { currentUser } from "../../auth-context.ts";
import { Badge, Card, Empty, Figure, Label, Meter, SectionHeading } from "../../ui/primitives.tsx";
import { date, money, percent } from "../../ui/format.ts";
import { InvestmentForm } from "./investment-form.tsx";

export const dynamic = "force-dynamic";

export default async function Investimentos() {
  const user = await currentUser();
  if (!user) redirect("/entrar");

  const view = await buildInvestmentsView(user.id);
  const maiorClasse = Math.max(1, ...view.byClass.map((item) => item.valueCents));

  return (
    <main className="mx-auto w-full max-w-[76rem] px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.625rem] font-semibold tracking-[-0.02em] text-ink">Investimentos</h1>
          <p className="mt-1 text-[0.875rem] text-ink-muted">
            Patrimônio investido, rentabilidade e distribuição.
          </p>
        </div>
        <InvestmentForm accounts={view.accounts} />
      </header>

      {view.investments.length ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card as="article">
              <Label>Valor atual</Label>
              <Figure value={money(view.totals.currentValueCents)} size="sm" className="mt-1.5" />
              <p className="mt-2 text-[0.75rem] text-ink-subtle">
                {money(view.totals.principalCents)} aportados
              </p>
            </Card>
            <Card as="article">
              <Label>Rendimento</Label>
              <Figure
                value={money(view.totals.yieldCents, { signed: true })}
                size="sm"
                tone={view.totals.yieldCents < 0 ? "negative" : "positive"}
                className="mt-1.5"
              />
              <p className="mt-2 text-[0.75rem] text-ink-subtle">
                {percent(view.totals.yieldPercent, 1)} sobre o aportado
              </p>
            </Card>
            <Card as="article">
              <Label>Ativos</Label>
              <Figure value={String(view.investments.length)} size="sm" className="mt-1.5" />
              <p className="mt-2 text-[0.75rem] text-ink-subtle">
                em {view.byClass.length} classe{view.byClass.length === 1 ? "" : "s"}
              </p>
            </Card>
          </div>

          {view.byClass.length > 1 ? (
            <Card className="mt-5">
              <SectionHeading title="Distribuição" />
              <ul className="space-y-3">
                {view.byClass.map((item) => (
                  <li key={item.assetClass}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-3">
                      <span className="text-[0.8125rem] text-ink">{item.label}</span>
                      <span className="tabular text-[0.8125rem] text-ink">
                        {money(item.valueCents)}
                        <span className="ml-1.5 text-[0.75rem] text-ink-subtle">{percent(item.percent)}</span>
                      </span>
                    </div>
                    <Meter value={item.valueCents} total={maiorClasse} tone="accent" label={item.label} />
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {view.investments.map((ativo) => (
              <Card key={ativo.id} as="article">
                <header className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="flex flex-wrap items-center gap-2 text-[0.9375rem] font-semibold text-ink">
                      {ativo.name}
                      <Badge>{ASSET_CLASS_LABEL[ativo.assetClass]}</Badge>
                    </h2>
                    <p className="mt-0.5 text-[0.75rem] text-ink-subtle">
                      {ativo.institution ? `${ativo.institution} · ` : ""}
                      liquidez {LIQUIDITY_LABEL[ativo.liquidity].toLowerCase()}
                      {ativo.maturityDate ? ` · vence ${date(ativo.maturityDate)}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tabular text-[1.125rem] font-semibold text-ink">
                      {money(ativo.currentValueCents)}
                    </p>
                    <p
                      className={`tabular text-[0.75rem] ${
                        ativo.yieldCents < 0 ? "text-negative" : "text-positive"
                      }`}
                    >
                      {money(ativo.yieldCents, { signed: true })} ({percent(ativo.yieldPercent, 1)})
                    </p>
                  </div>
                </header>

                <dl className="mt-3 space-y-1 text-[0.75rem]">
                  <Linha rotulo="Aportado" valor={money(ativo.principalCents)} />
                  <Linha rotulo="Fatia da carteira" valor={percent(ativo.sharePercent)} />
                  {ativo.accountName ? <Linha rotulo="Custódia" valor={ativo.accountName} /> : null}
                  {ativo.valuedOn ? <Linha rotulo="Valor de" valor={date(ativo.valuedOn)} /> : null}
                </dl>
              </Card>
            ))}
          </div>
        </>
      ) : (
        <Card>
          <Empty
            title="Nenhum investimento cadastrado"
            hint="Cadastre seus ativos para acompanhar rentabilidade e distribuição da carteira."
          />
        </Card>
      )}
    </main>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-subtle">{rotulo}</dt>
      <dd className="tabular text-ink">{valor}</dd>
    </div>
  );
}
