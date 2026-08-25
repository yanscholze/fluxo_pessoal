import { redirect } from "next/navigation";

import { buildTripsView } from "../../../server/services/trips.ts";
import { currentUser } from "../../auth-context.ts";
import { DonutChart, VIZ } from "../../ui/charts.tsx";
import { DataTable, KeyValue, Td, Tr } from "../../ui/data-display.tsx";
import { date, dateShort, money, percent } from "../../ui/format.ts";
import { Plane } from "../../ui/icons.tsx";
import { Page, PageHeader, SectionTitle, Stack } from "../../ui/page-frame.tsx";
import { Badge, Empty, Notice, Panel, type Tone } from "../../ui/primitives.tsx";
import { TripForm } from "./trip-form.tsx";

export const dynamic = "force-dynamic";

const SITUACAO: Record<string, { texto: string; tom: Tone }> = {
  planejada: { texto: "Planejada", tom: "neutral" },
  em_andamento: { texto: "Em andamento", tom: "caution" },
  concluida: { texto: "Concluída", tom: "positive" },
};

/**
 * Viagens.
 *
 * A viagem é uma etiqueta sobre lançamentos que já existem — não é conta nem
 * carteira. A conversão para a moeda do destino é informativa e a tela diz
 * isso: somar moeda estrangeira ao patrimônio em reais seria inventar
 * dinheiro a cada oscilação de câmbio.
 */
export default async function Viagens() {
  const user = await currentUser();
  if (!user) redirect("/entrar");

  const view = await buildTripsView(user.id);

  return (
    <Page>
      <PageHeader
        title="Viagens"
        description="Separe os gastos de cada destino. A viagem é uma etiqueta: não muda conta nem fatura."
        actions={<TripForm />}
      />

      {view.trips.length ? (
        <Stack gap="lg">
          {view.trips.map((viagem) => {
            const situacao = SITUACAO[viagem.status] ?? SITUACAO.planejada;

            return (
              <Panel key={viagem.id} as="article">
                <header className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="flex flex-wrap items-center gap-2 text-heading text-ink">
                      <Plane size={15} strokeWidth={1.75} className="shrink-0 text-ink-subtle" aria-hidden />
                      {viagem.name}
                      <Badge tone={situacao.tom}>{situacao.texto}</Badge>
                    </h2>
                    <p className="mt-0.5 text-caption text-ink-subtle">
                      {date(viagem.startDate)} a {date(viagem.endDate)}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-label uppercase text-ink-subtle">Gasto total</p>
                    <p className="tabular mt-0.5 text-figure text-ink">{money(viagem.totalCents)}</p>
                    <p className="tabular mt-0.5 text-caption text-ink-subtle">
                      ≈{" "}
                      {viagem.totalInCurrency.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: viagem.currency,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </div>
                </header>

                <div className="mt-4">
                  <Notice tone="info">
                    Cotação usada: 1 {viagem.currency} ={" "}
                    <span className="tabular">
                      {viagem.exchangeRate.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </span>
                    . A conversão é informativa — seus saldos continuam registrados em reais.
                  </Notice>
                </div>

                <KeyValue
                  className="mt-4"
                  columns={3}
                  entries={[
                    {
                      label: "Lançamentos",
                      value: <span className="tabular">{viagem.transactionCount}</span>,
                    },
                    { label: "Categorias", value: <span className="tabular">{viagem.byCategory.length}</span> },
                    {
                      label: "Média por gasto",
                      value: <span className="tabular">{money(viagem.averageCents)}</span>,
                    },
                  ]}
                />

                {viagem.byCategory.length ? (
                  <div className="mt-5">
                    <SectionTitle title="Gastos por categoria" />
                    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
                      <DonutChart
                        slices={viagem.byCategory.map((item, i) => ({
                          label: item.name,
                          value: item.amountCents,
                          color: item.color ?? VIZ[i % VIZ.length],
                        }))}
                        size={140}
                        thickness={15}
                        centerValue={money(viagem.totalCents)}
                        centerLabel="na viagem"
                        format={(valor) => money(valor)}
                      />

                      <ul className="min-w-0 flex-1 space-y-2">
                        {viagem.byCategory.map((item, i) => (
                          <li key={item.name} className="flex items-baseline gap-2.5">
                            <span
                              className="mt-1.5 size-2 shrink-0 rounded-full"
                              style={{ backgroundColor: item.color ?? VIZ[i % VIZ.length] }}
                              aria-hidden
                            />
                            <span className="min-w-0 flex-1 truncate text-body-sm text-ink">{item.name}</span>
                            <span className="tabular shrink-0 text-body-sm font-medium text-ink">
                              {money(item.amountCents)}
                            </span>
                            <span className="tabular w-10 shrink-0 text-right text-caption text-ink-subtle">
                              {percent(item.percent)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4">
                    <Empty
                      compact
                      title="Nenhum gasto etiquetado nesta viagem"
                      hint="Ao registrar um lançamento, escolha a viagem para ele aparecer aqui."
                    />
                  </div>
                )}

                {viagem.entries.length ? (
                  <div className="mt-5">
                    <SectionTitle title="Lançamentos da viagem" />
                    <DataTable
                      caption={`Lançamentos de ${viagem.name}`}
                      columns={[
                        { key: "descricao", header: "Lançamento" },
                        { key: "categoria", header: "Categoria", hideBelow: "sm" },
                        { key: "data", header: "Data", align: "right", width: "5.5rem" },
                        { key: "valor", header: "Valor", align: "right", width: "7rem" },
                      ]}
                    >
                      {viagem.entries.map((item) => (
                        <Tr key={item.transactionId}>
                          <Td className="truncate text-body">{item.description}</Td>
                          <Td hideBelow="sm" className="text-body-sm text-ink-muted">
                            {item.categoryName ?? "sem categoria"}
                          </Td>
                          <Td align="right" className="tabular text-caption text-ink-subtle">
                            {dateShort(item.occurredOn)}
                          </Td>
                          <Td align="right" className="tabular text-body font-medium text-ink">
                            {money(item.amountCents)}
                          </Td>
                        </Tr>
                      ))}
                    </DataTable>
                  </div>
                ) : null}
              </Panel>
            );
          })}
        </Stack>
      ) : (
        <Panel>
          <Empty
            icon={Plane}
            title="Nenhuma viagem cadastrada"
            hint="Crie uma viagem e etiquete os lançamentos dela para ver o gasto total no destino."
          />
        </Panel>
      )}
    </Page>
  );
}
