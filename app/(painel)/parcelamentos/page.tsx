import { redirect } from "next/navigation";

import { buildInstallmentsView } from "../../../server/services/installments.ts";
import { currentUser } from "../../auth-context.ts";
import { Card, Empty, Figure, Label, Meter, SectionHeading } from "../../ui/primitives.tsx";
import { competenceShort, money, moneyCompact, percent } from "../../ui/format.ts";
import { PlanCard } from "./plan-card.tsx";

export const dynamic = "force-dynamic";

export default async function Parcelamentos() {
  const user = await currentUser();
  if (!user) redirect("/entrar");

  const view = await buildInstallmentsView(user.id);
  const maiorMes = Math.max(1, ...view.commitment.map((item) => item.amountCents));

  return (
    <main className="mx-auto w-full max-w-[76rem] px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-[1.625rem] font-semibold tracking-[-0.02em] text-ink">Parcelamentos</h1>
        <p className="mt-1 text-[0.875rem] text-ink-muted">
          Quanto de cada compra ainda falta, e o que já está comprometido mês a mês.
        </p>
      </header>

      {view.active.length || view.settled.length ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card as="article">
              <Label>Em aberto</Label>
              <Figure value={money(view.totals.openCents)} size="sm" className="mt-1.5" />
              <p className="mt-2 text-[0.75rem] text-ink-subtle">
                de {money(view.totals.totalCents)} em {view.active.length + view.settled.length} compras
              </p>
            </Card>
            <Card as="article">
              <Label>Já pago</Label>
              <Figure value={money(view.totals.paidCents)} size="sm" tone="positive" className="mt-1.5" />
              <div className="mt-3">
                <Meter value={view.totals.paidCents} total={view.totals.totalCents} tone="positive" label="Progresso" />
                <p className="mt-1.5 text-[0.75rem] text-ink-subtle">{percent(view.totals.percentPaid)} concluído</p>
              </div>
            </Card>
            <Card as="article">
              <Label>Em andamento</Label>
              <Figure value={String(view.active.length)} size="sm" className="mt-1.5" />
              <p className="mt-2 text-[0.75rem] text-ink-subtle">
                {view.settled.length} já quitad{view.settled.length === 1 ? "o" : "os"}
              </p>
            </Card>
          </div>

          {view.commitment.length ? (
            <Card className="mt-5">
              <SectionHeading
                title="Comprometimento futuro"
                hint="Quanto de parcela já está reservado em cada mês"
              />
              <ol className="flex items-end gap-2" style={{ height: "9rem" }}>
                {view.commitment.map((item) => (
                  <li key={item.competence} className="flex h-full flex-1 flex-col justify-end">
                    <span className="tabular mb-1 text-center text-[0.6875rem] text-ink-subtle">
                      {moneyCompact(item.amountCents)}
                    </span>
                    <div
                      className="w-full rounded-t-sm bg-accent"
                      style={{ height: `${Math.max(3, (item.amountCents / maiorMes) * 100)}%` }}
                      title={`${competenceShort(item.competence)}: ${money(item.amountCents)}`}
                    />
                    <span className="mt-1.5 text-center text-[0.6875rem] text-ink-subtle">
                      {competenceShort(item.competence).replace(" de ", "/")}
                    </span>
                  </li>
                ))}
              </ol>
            </Card>
          ) : null}

          {view.active.length ? (
            <section className="mt-6">
              <h2 className="mb-3 text-[0.9375rem] font-semibold text-ink">Em andamento</h2>
              <div className="space-y-4">
                {view.active.map((plan) => (
                  <PlanCard key={plan.planId} plan={plan} />
                ))}
              </div>
            </section>
          ) : null}

          {view.settled.length ? (
            <section className="mt-6">
              <h2 className="mb-3 text-[0.9375rem] font-semibold text-ink">Quitados</h2>
              <div className="space-y-4">
                {view.settled.map((plan) => (
                  <PlanCard key={plan.planId} plan={plan} />
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <Card>
          <Empty
            title="Nenhuma compra parcelada"
            hint="Ao registrar uma despesa no cartão, informe o número de parcelas para acompanhar aqui."
          />
        </Card>
      )}
    </main>
  );
}
