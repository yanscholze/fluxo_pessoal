import { SectionIntro } from "../../ui/section-tabs.tsx";
import { listAccounts, listCards, listCategories } from "../../../server/repositories/catalog.ts";
import { buildPlanningView } from "../../../server/services/planning.ts";
import { buildSubscriptionsReport } from "../../../server/services/subscriptions.ts";
import { currentUser } from "../../auth-context.ts";
import { DonutChart, VIZ } from "../../ui/charts.tsx";
import { DataTable, MetricStrip, Td, Timeline, type TimelineItem, Tr } from "../../ui/data-display.tsx";
import { date, money, percent, relativeDay } from "../../ui/format.ts";
import { Calendar, Check, Layers, Repeat, Wallet } from "../../ui/icons.tsx";
import { Stack } from "../../ui/page-frame.tsx";
import { Badge, Empty, Notice, Panel, PanelHeader } from "../../ui/primitives.tsx";
import { ConfirmOccurrence } from "../planejamento/confirm-occurrence.tsx";
import { LabelsPanel } from "./labels-panel.tsx";
import { NewSubscription } from "./new-subscription.tsx";
import { SubscriptionActions } from "./subscription-actions.tsx";
import type { Opcoes } from "./subscription-form.tsx";

/** Depende da identidade da requisição: nunca pode ser servida de cache. */

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

  const now = new Date();
  const [view, relatorio, contas, cartoes, categorias] = await Promise.all([
    buildPlanningView(user.id, now),
    buildSubscriptionsReport(user.id, now),
    listAccounts(user.id),
    listCards(user.id),
    listCategories(user.id),
  ]);
  const { subscriptions } = view;

  // O relatório é a fonte da edição: ele sabe o cartão, a conta, a categoria e
  // a classificação de cada assinatura, que é o que o formulário precisa.
  const detalheDe = new Map(relatorio.subscriptions.map((assinatura) => [assinatura.id, assinatura]));
  const assinaturas = view.recurrences
    .filter((recorrencia) => recorrencia.role === "subscription")
    .sort((esquerda, direita) =>
      (detalheDe.get(direita.id)?.monthlyCents ?? 0) - (detalheDe.get(esquerda.id)?.monthlyCents ?? 0));

  const opcoes: Opcoes = {
    cards: cartoes.filter((cartao) => cartao.kind === "credit").map((cartao) => ({ id: cartao.id, name: cartao.name })),
    accounts: contas
      .filter((conta) => conta.archivedAt === null)
      .map((conta) => ({ id: conta.id, name: conta.name })),
    labels: relatorio.labels.map((rotulo) => ({ id: rotulo.id, name: rotulo.name })),
    categories: categorias
      .filter((categoria) => categoria.kind === "expense")
      .map((categoria) => ({ id: categoria.id, name: categoria.name })),
  };

  const ativas = assinaturas.filter((assinatura) => assinatura.isActive);
  const total = relatorio.totals.monthlyCents;
  const baixasManuais = ativas.filter((assinatura) => assinatura.accountId && !assinatura.cardId && assinatura.pending !== null);
  const classificacoes = relatorio.labels.map((rotulo) => ({
    ...rotulo,
    count: relatorio.byLabel.find((linha) => linha.label?.id === rotulo.id)?.count ?? 0,
  }));

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
    <>
      <SectionIntro
        description="Cadastre e organize suas assinaturas. Confira o custo mensal equivalente, o custo anual e as cobranças em conta ou no cartão."
        actions={
          <NewSubscription opcoes={opcoes} />
        }
      />

      {assinaturas.length ? (
        <Stack gap="lg">
          <MetricStrip
            metrics={[
              {
                label: "Por mês",
                value: money(relatorio.totals.monthlyCents),
                tone: "caution",
                icon: Repeat,
                hint: `${relatorio.totals.activeCount} ativas · ${relatorio.totals.pausedCount} pausadas`,
              },
              {
                label: "Por ano",
                value: money(relatorio.totals.yearlyCents),
                icon: Calendar,
                hint: "Doze cobranças mensais, uma cobrança anual",
              },
              {
                label: "Próximos 7 dias",
                value: money(subscriptions.next7DaysCents),
                tone: subscriptions.next7DaysCents > 0 ? "caution" : "neutral",
                icon: Wallet,
                hint:
                  subscriptions.next7DaysCents > 0
                    ? "Cobranças previstas nesta semana"
                    : "Nada cobrado nesta semana",
              },
              {
                label: "Maior assinatura",
                value: ativas[0] ? money(detalheDe.get(ativas[0].id)?.monthlyCents ?? 0) : "—",
                icon: Layers,
                hint: ativas[0] ? ativas[0].description : "nenhuma ativa",
              },
            ]}
          />

          {baixasManuais.length ? (
            <Panel>
              <PanelHeader
                title="Assinaturas em conta aguardando baixa"
                icon={Wallet}
                hint="Vincule o débito que já entrou no extrato ou registre a cobrança que ainda falta. No cartão, o lançamento é automático na data cadastrada."
              />
              <ul className="space-y-3">
                {baixasManuais.map((assinatura) => assinatura.pending ? (
                  <li key={assinatura.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line p-3">
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-body-sm font-medium text-ink">{assinatura.description}</p>
                      <p className="mt-1 text-caption text-ink-subtle">{assinatura.originName} · {date(assinatura.pending.date)} · {money(assinatura.pending.amountCents)}</p>
                    </div>
                    <ConfirmOccurrence
                      recurrenceId={assinatura.id}
                      competence={assinatura.pending.competence}
                      amountCents={assinatura.pending.amountCents}
                      description={assinatura.description}
                      scheduledFor={assinatura.pending.date}
                    />
                  </li>
                ) : null)}
              </ul>
            </Panel>
          ) : null}

          <div className="grid gap-5 xl:grid-cols-3">
            <Panel className="xl:col-span-2">
              <PanelHeader
                title="Suas assinaturas"
                icon={Repeat}
                hint="Ordenadas pelo que mais pesa no mês"
              />

              <DataTable
                caption="Assinaturas cadastradas"
                columns={[
                  { key: "servico", header: "Serviço", flexible: true },
                  { key: "classificacao", header: "Classificação", hideBelow: "md" },
                  { key: "onde", header: "Sai de", hideBelow: "xl" },
                  { key: "proxima", header: "Próxima", align: "right", hideBelow: "lg" },
                  { key: "mensal", header: "Por mês", align: "right", width: "6.5rem" },
                  { key: "anual", header: "Por ano", align: "right", width: "7rem", hideBelow: "sm" },
                  { key: "acoes", header: "", align: "right", width: "6.5rem" },
                ]}
              >
                {assinaturas.map((assinatura) => (
                  <Tr key={assinatura.id}>
                    <Td truncate>
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className={`truncate text-body ${assinatura.isActive ? "text-ink" : "text-ink-subtle"}`}
                        >
                          {assinatura.description}
                        </span>
                        {assinatura.isActive ? null : <Badge tone="neutral">pausada</Badge>}
                      </span>
                      <span className="mt-0.5 block truncate text-caption text-ink-subtle">
                        {assinatura.scheduleLabel}
                        {assinatura.categoryName ? ` · ${assinatura.categoryName}` : ""}
                      </span>
                      <span className="mt-1 block text-caption text-ink-subtle">
                        {assinatura.cardId ? "Automática · cobrança no cartão" : "Débito em conta · baixa manual"}
                        {detalheDe.get(assinatura.id)?.interval === "yearly" ? " · cobrança anual" : ""}
                      </span>
                    </Td>

                    <Td hideBelow="md">
                      {detalheDe.get(assinatura.id)?.label ? (
                        <span className="flex items-center gap-1.5">
                          <span
                            className="size-2 shrink-0 rounded-full"
                            style={{ backgroundColor: detalheDe.get(assinatura.id)?.label?.color }}
                            aria-hidden
                          />
                          <span className="truncate text-body-sm text-ink-muted">
                            {detalheDe.get(assinatura.id)?.label?.name}
                          </span>
                        </span>
                      ) : (
                        <span className="text-caption text-ink-subtle">sem classificação</span>
                      )}
                    </Td>

                    <Td hideBelow="xl" className="truncate text-body-sm text-ink-muted">
                      {assinatura.originName}
                    </Td>

                    <Td align="right" hideBelow="lg" className="tabular whitespace-nowrap text-caption text-ink-subtle">
                      {assinatura.next ? date(assinatura.next.date) : "—"}
                    </Td>

                    <Td align="right">
                      <span
                        className={`tabular text-body font-medium ${assinatura.isActive ? "text-ink" : "text-ink-subtle"}`}
                      >
                        {money(detalheDe.get(assinatura.id)?.monthlyCents ?? 0)}
                      </span>
                    </Td>

                    <Td align="right" hideBelow="sm" className="tabular text-body-sm text-ink-muted">
                      {money(detalheDe.get(assinatura.id)?.yearlyCents ?? 0)}
                    </Td>

                    <Td align="right">
                      {(() => {
                        const detalhe = detalheDe.get(assinatura.id);
                        if (!detalhe) return null;

                        return (
                          <SubscriptionActions
                            isActive={assinatura.isActive}
                            opcoes={opcoes}
                            assinatura={{
                              id: detalhe.id,
                              description: detalhe.description,
                              amountCents: detalhe.amountCents,
                              scheduleDay: detalhe.scheduleDay,
                              interval: detalhe.interval,
                              cardId: detalhe.cardId,
                              accountId: detalhe.accountId,
                              categoryId: detalhe.categoryId,
                              labelId: detalhe.label?.id ?? null,
                              startsOn: detalhe.startsOn,
                            }}
                          />
                        );
                      })()}
                    </Td>
                  </Tr>
                ))}
              </DataTable>

              {ativas.length ? (
                <div className="mt-4">
                  <Notice tone="caution" icon={Calendar}>
                    Manter estas assinaturas por um ano custa{" "}
                    <span className="tabular font-semibold">{money(relatorio.totals.yearlyCents)}</span>.
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
                        value: detalheDe.get(assinatura.id)?.monthlyCents ?? 0,
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
                            {percent(total > 0 ? ((detalheDe.get(assinatura.id)?.monthlyCents ?? 0) / total) * 100 : 0)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </Panel>
              ) : null}

              {relatorio.byLabel.length ? (
                <Panel>
                  <PanelHeader title="Custo por classificação" icon={Layers} hint="Somente assinaturas ativas" />
                  <ul className="space-y-3">
                    {relatorio.byLabel.map((grupo) => (
                      <li key={grupo.label?.id ?? "sem-classificacao"} className="flex flex-wrap items-baseline justify-between gap-2 text-body-sm">
                        <span className="min-w-0 break-words text-ink">{grupo.label?.name ?? "Sem classificação"}</span>
                        <span className="tabular text-right text-ink-muted">{money(grupo.monthlyCents)}/mês<span className="block text-caption text-ink-subtle">{money(grupo.yearlyCents)}/ano</span></span>
                      </li>
                    ))}
                  </ul>
                </Panel>
              ) : null}

              {relatorio.byCard.length ? (
                <Panel>
                  <PanelHeader title="Onde é cobrado" icon={Wallet} hint="Custo mensal equivalente por cartão ou débito em conta" />
                  <ul className="space-y-3">
                    {relatorio.byCard.map((grupo) => (
                      <li key={grupo.cardId ?? "debito-em-conta"} className="flex flex-wrap items-baseline justify-between gap-2 text-body-sm">
                        <span className="min-w-0 break-words text-ink">{grupo.cardName}</span>
                        <span className="tabular text-ink-muted">{money(grupo.monthlyCents)}/mês</span>
                      </li>
                    ))}
                  </ul>
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

              <LabelsPanel labels={classificacoes} />

              <Panel>
                <PanelHeader
                  title="Cobranças reconhecidas"
                  icon={Check}
                  hint="Não passam pela fila de captura"
                />
                {relatorio.recognized.some((cobranca) => cobranca.expectedCents !== null) ? (
                  <Notice tone="caution">Há cobrança com valor diferente do cadastrado. Confira o lançamento e atualize o valor da assinatura; diferenças pendentes não geram outra cobrança automaticamente.</Notice>
                ) : null}
                {relatorio.recognized.length ? (
                  <ul className="space-y-2.5">
                    {relatorio.recognized.map((cobranca) => (
                      <li key={cobranca.id} className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block truncate text-body-sm text-ink">
                            {cobranca.subscriptionName ?? cobranca.description}
                          </span>
                          <span className="block text-caption text-ink-subtle">
                            {date(cobranca.occurredOn)}
                            {cobranca.expectedCents !== null
                              ? ` · antes ${money(cobranca.expectedCents)}`
                              : ""}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="tabular block text-body-sm text-ink">
                            {money(cobranca.amountCents)}
                          </span>
                          {cobranca.expectedCents !== null ? (
                            <Badge tone="caution">reajuste</Badge>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty
                    icon={Check}
                    title="Nenhuma cobrança reconhecida ainda"
                    hint="Quando a captura identificar a cobrança de uma assinatura cadastrada, ela aparece aqui em vez de ir para a fila."
                    compact
                  />
                )}
              </Panel>
            </div>
          </div>
        </Stack>
      ) : (
        <div className="grid gap-5 xl:grid-cols-3">
          <Panel className="xl:col-span-2">
            <Empty
              icon={Repeat}
              title="Nenhuma assinatura cadastrada"
              hint="Use “Nova assinatura” para escolher o serviço, o valor, a conta ou cartão e a classificação."
            />
          </Panel>
          <LabelsPanel labels={classificacoes} />
        </div>
      )}
    </>
  );
}
