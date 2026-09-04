import { buildPlanningView } from "../../../server/services/planning.ts";
import { currentUser } from "../../auth-context.ts";
import { DonutChart, VIZ } from "../../ui/charts.tsx";
import { DataTable, MetricStrip, Td, Timeline, type TimelineItem, Tr } from "../../ui/data-display.tsx";
import { date, money, percent, relativeDay } from "../../ui/format.ts";
import { Calendar, Layers, Repeat, Wallet } from "../../ui/icons.tsx";
import { Page, PageHeader, Stack } from "../../ui/page-frame.tsx";
import { Badge, Empty, Notice, Panel, PanelHeader } from "../../ui/primitives.tsx";

/** Depende da identidade da requisição: nunca pode ser servida de cache. */
export const dynamic = "force-dynamic";

/**
 * Assinaturas.
 *
 * Responde uma pergunta só: **quanto some da minha conta todo mês sem eu
 * decidir nada**. Assinatura é o gasto mais fácil de perder de vista, porque
 * cada uma é pequena e nenhuma exige uma decisão nova — o dano é a soma, e a
 * soma nunca aparece em lugar nenhum.
 *
 * Por isso o custo anual fica ao lado do mensal, com o mesmo peso. "R$ 89,90
 * por mês" soa desprezível; "R$ 1.078,80 por ano" é a mesma informação e muda
 * a decisão.
 *
 * A tela lê do mesmo serviço de recorrências — assinatura não é entidade
 * separada, é uma recorrência com papel `subscription`. Criar uma tabela
 * própria significaria manter duas verdades sobre o mesmo débito mensal.
 */
export default async function Assinaturas() {
  const user = await currentUser();
  // O desvio de quem não tem sessão acontece em `proxy.ts`, como resposta
  // HTTP, e o layout mostra o aviso. Lançar aqui viraria exceção na
  // renderização — que o Vite transmite como erro para todas as abas.
  if (!user) return null;

  const view = await buildPlanningView(user.id);
  const { subscriptions } = view;

  const assinaturas = view.recurrences
    .filter((recorrencia) => recorrencia.role === "subscription")
    .sort((esquerda, direita) => direita.amountCents - esquerda.amountCents);

  const ativas = assinaturas.filter((assinatura) => assinatura.isActive);
  const total = ativas.reduce((soma, assinatura) => soma + assinatura.amountCents, 0);

  const proximas: TimelineItem[] = subscriptions.upcoming.map((cobranca, indice) => ({
    id: `${cobranca.recurrenceId}-${cobranca.date}-${indice}`,
    when: `${date(cobranca.date)} · ${relativeDay(cobranca.date, view.today)}`,
    title: cobranca.description,
    value: money(cobranca.amountCents),
    tone: "caution",
    icon: Repeat,
    isNow: cobranca.date === view.today,
  }));

  return (
    <Page>
      <PageHeader
        title="Assinaturas"
        description="O que é cobrado todo mês sem você decidir nada. O custo anual está ao lado do mensal de propósito."
      />

      {assinaturas.length ? (
        <Stack gap="lg">
          <MetricStrip
            metrics={[
              {
                label: "Por mês",
                value: money(subscriptions.monthlyCents),
                tone: "caution",
                icon: Repeat,
                hint: `${subscriptions.activeCount} assinatura${subscriptions.activeCount === 1 ? "" : "s"} ativa${subscriptions.activeCount === 1 ? "" : "s"}`,
              },
              {
                label: "Por ano",
                value: money(subscriptions.yearlyCents),
                icon: Calendar,
                hint: "O mesmo gasto, na escala em que ele pesa",
              },
              {
                label: "Próximos 7 dias",
                value: money(subscriptions.next7DaysCents),
                tone: subscriptions.next7DaysCents > 0 ? "caution" : "neutral",
                icon: Wallet,
                hint:
                  subscriptions.next7DaysCents > 0
                    ? "Sai da conta nesta semana"
                    : "Nada cobrado nesta semana",
              },
              {
                label: "Maior assinatura",
                value: ativas[0] ? money(ativas[0].amountCents) : "—",
                icon: Layers,
                hint: ativas[0] ? ativas[0].description : "nenhuma ativa",
              },
            ]}
          />

          <div className="grid gap-5 lg:grid-cols-3">
            <Panel className="lg:col-span-2">
              <PanelHeader
                title="Suas assinaturas"
                icon={Repeat}
                hint="Ordenadas pelo que mais pesa no mês"
              />

              <DataTable
                caption="Assinaturas cadastradas"
                columns={[
                  { key: "servico", header: "Serviço" },
                  { key: "cobranca", header: "Cobrança", hideBelow: "md" },
                  { key: "onde", header: "Sai de", hideBelow: "lg" },
                  { key: "proxima", header: "Próxima", align: "right", hideBelow: "sm" },
                  { key: "mensal", header: "Por mês", align: "right", width: "7rem" },
                  { key: "anual", header: "Por ano", align: "right", width: "8rem" },
                ]}
              >
                {assinaturas.map((assinatura) => (
                  <Tr key={assinatura.id}>
                    <Td>
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className={`truncate text-body ${assinatura.isActive ? "text-ink" : "text-ink-subtle"}`}
                        >
                          {assinatura.description}
                        </span>
                        {assinatura.isActive ? null : <Badge tone="neutral">pausada</Badge>}
                      </span>
                      {assinatura.categoryName ? (
                        <span className="mt-0.5 block truncate text-caption text-ink-subtle">
                          {assinatura.categoryName}
                        </span>
                      ) : null}
                    </Td>

                    <Td hideBelow="md" className="text-body-sm text-ink-muted">
                      {assinatura.scheduleLabel}
                    </Td>

                    <Td hideBelow="lg" className="truncate text-body-sm text-ink-muted">
                      {assinatura.originName}
                    </Td>

                    <Td align="right" hideBelow="sm" className="tabular whitespace-nowrap text-caption text-ink-subtle">
                      {assinatura.next ? date(assinatura.next.date) : "—"}
                    </Td>

                    <Td align="right">
                      <span
                        className={`tabular text-body font-medium ${assinatura.isActive ? "text-ink" : "text-ink-subtle"}`}
                      >
                        {money(assinatura.amountCents)}
                      </span>
                    </Td>

                    <Td align="right" className="tabular text-body-sm text-ink-muted">
                      {money(assinatura.amountCents * 12)}
                    </Td>
                  </Tr>
                ))}
              </DataTable>

              {ativas.length ? (
                <div className="mt-4">
                  <Notice tone="caution" icon={Calendar}>
                    Manter estas assinaturas por um ano custa{" "}
                    <span className="tabular font-semibold">{money(subscriptions.yearlyCents)}</span>.
                  </Notice>
                </div>
              ) : null}
            </Panel>

            <div className="space-y-5">
              {ativas.length > 1 ? (
                <Panel>
                  <PanelHeader title="Peso de cada uma" icon={Layers} />
                  <div className="flex flex-col items-center gap-4">
                    <DonutChart
                      slices={ativas.map((assinatura, i) => ({
                        label: assinatura.description,
                        value: assinatura.amountCents,
                        color: VIZ[i % VIZ.length],
                      }))}
                      size={148}
                      thickness={16}
                      centerValue={money(total)}
                      centerLabel="por mês"
                      format={(valor) => money(valor)}
                    />

                    <ul className="w-full space-y-2">
                      {ativas.map((assinatura, i) => (
                        <li key={assinatura.id} className="flex items-baseline gap-2.5">
                          <span
                            className="mt-1.5 size-2 shrink-0 rounded-full"
                            style={{ backgroundColor: VIZ[i % VIZ.length] }}
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1 truncate text-body-sm text-ink">
                            {assinatura.description}
                          </span>
                          <span className="tabular shrink-0 text-caption text-ink-subtle">
                            {percent(total > 0 ? (assinatura.amountCents / total) * 100 : 0)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </Panel>
              ) : null}

              <Panel>
                <PanelHeader
                  title="Próximas cobranças"
                  icon={Calendar}
                  hint={
                    subscriptions.next7DaysCents > 0
                      ? `${money(subscriptions.next7DaysCents)} nos próximos 7 dias`
                      : undefined
                  }
                />
                {proximas.length ? (
                  <Timeline items={proximas} />
                ) : (
                  <Empty icon={Calendar} title="Nenhuma cobrança prevista" compact />
                )}
              </Panel>
            </div>
          </div>
        </Stack>
      ) : (
        <Panel>
          <Empty
            icon={Repeat}
            title="Nenhuma assinatura cadastrada"
            hint="Cadastre uma recorrência com o papel “assinatura” em Recorrências para ela aparecer aqui e entrar no custo mensal."
          />
        </Panel>
      )}
    </Page>
  );
}
