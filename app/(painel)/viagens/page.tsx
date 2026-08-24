import { redirect } from "next/navigation";

import { buildTripsView } from "../../../server/services/trips.ts";
import { currentUser } from "../../auth-context.ts";
import { Badge, Card, Empty, Figure, Label, Meter, SectionHeading } from "../../ui/primitives.tsx";
import { date, dateShort, money, percent } from "../../ui/format.ts";
import { TripForm } from "./trip-form.tsx";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { texto: string; tom: "positive" | "caution" | "neutral" }> = {
  planejada: { texto: "Planejada", tom: "neutral" },
  em_andamento: { texto: "Em andamento", tom: "caution" },
  concluida: { texto: "Concluída", tom: "positive" },
};

export default async function Viagens() {
  const user = await currentUser();
  if (!user) redirect("/entrar");

  const view = await buildTripsView(user.id);

  return (
    <main className="mx-auto w-full max-w-[76rem] px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.625rem] font-semibold tracking-[-0.02em] text-ink">Viagens</h1>
          <p className="mt-1 text-[0.875rem] text-ink-muted">
            Separe os gastos de cada destino. A viagem é uma etiqueta: não muda conta nem fatura.
          </p>
        </div>
        <TripForm />
      </header>

      {view.trips.length ? (
        <div className="space-y-5">
          {view.trips.map((viagem) => {
            const rotulo = STATUS[viagem.status];
            const maior = Math.max(1, ...viagem.byCategory.map((item) => item.amountCents));

            return (
              <Card key={viagem.id} as="article">
                <header className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="flex items-center gap-2 text-[1rem] font-semibold text-ink">
                      {viagem.name}
                      <Badge tone={rotulo.tom}>{rotulo.texto}</Badge>
                    </h2>
                    <p className="mt-0.5 text-[0.75rem] text-ink-subtle">
                      {date(viagem.startDate)} a {date(viagem.endDate)}
                    </p>
                  </div>
                  <div className="text-right">
                    <Label>Gasto total</Label>
                    <Figure value={money(viagem.totalCents)} size="sm" className="mt-1" />
                    <p className="mt-1 text-[0.75rem] text-ink-subtle">
                      ≈{" "}
                      {viagem.totalInCurrency.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: viagem.currency,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </div>
                </header>

                <p className="mt-3 rounded-[--radius-control] bg-surface-sunken px-3 py-2 text-[0.75rem] text-ink-muted">
                  Cotação usada: 1 {viagem.currency} ={" "}
                  {viagem.exchangeRate.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}. A
                  conversão é informativa — seus saldos continuam registrados em reais.
                </p>

                <dl className="mt-3 grid grid-cols-3 gap-3 text-[0.75rem]">
                  <div>
                    <dt className="text-ink-subtle">Lançamentos</dt>
                    <dd className="tabular text-[0.9375rem] text-ink">{viagem.transactionCount}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-subtle">Categorias</dt>
                    <dd className="tabular text-[0.9375rem] text-ink">{viagem.byCategory.length}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-subtle">Média por gasto</dt>
                    <dd className="tabular text-[0.9375rem] text-ink">{money(viagem.averageCents)}</dd>
                  </div>
                </dl>

                {viagem.byCategory.length ? (
                  <div className="mt-4">
                    <SectionHeading title="Gastos por categoria" />
                    <ul className="space-y-2.5">
                      {viagem.byCategory.map((item) => (
                        <li key={item.name}>
                          <div className="mb-1 flex items-baseline justify-between gap-3">
                            <span className="flex items-center gap-2 text-[0.8125rem] text-ink">
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: item.color }}
                                aria-hidden
                              />
                              {item.name}
                            </span>
                            <span className="tabular text-[0.8125rem] text-ink">
                              {money(item.amountCents)}
                              <span className="ml-1.5 text-[0.75rem] text-ink-subtle">
                                {percent(item.percent)}
                              </span>
                            </span>
                          </div>
                          <Meter value={item.amountCents} total={maior} tone="accent" label={item.name} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="mt-4">
                    <Empty
                      title="Nenhum gasto etiquetado nesta viagem"
                      hint="Ao registrar um lançamento, escolha a viagem para ele aparecer aqui."
                    />
                  </div>
                )}

                {viagem.entries.length ? (
                  <details className="mt-4">
                    <summary className="cursor-pointer text-[0.8125rem] text-ink-muted">
                      Lançamentos da viagem
                    </summary>
                    <ul className="mt-2 border-t border-line">
                      {viagem.entries.map((item) => (
                        <li
                          key={item.transactionId}
                          className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-0"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-[0.8125rem] text-ink">{item.description}</p>
                            <p className="text-[0.6875rem] text-ink-subtle">
                              {dateShort(item.occurredOn)}
                              {item.categoryName ? ` · ${item.categoryName}` : ""}
                            </p>
                          </div>
                          <p className="tabular shrink-0 text-[0.8125rem] text-ink">{money(item.amountCents)}</p>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <Empty
            title="Nenhuma viagem cadastrada"
            hint="Crie uma viagem e etiquete os lançamentos dela para ver o gasto total no destino."
          />
        </Card>
      )}
    </main>
  );
}
