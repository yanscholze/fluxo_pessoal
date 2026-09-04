import { buildPlanningView, type RecurrenceView } from "../../../server/services/planning.ts";
import { currentUser } from "../../auth-context.ts";
import { BarChart, ChartFrame } from "../../ui/charts.tsx";
import {
  Amount,
  DataTable,
  ListRow,
  MetricStrip,
  type MetricProps,
  Td,
  Timeline,
  type TimelineItem,
  Tr,
} from "../../ui/data-display.tsx";
import { competenceLong, competenceShort, date, dateShort, money, relativeDay } from "../../ui/format.ts";
import {
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  Clock,
  Layers,
  Repeat,
  TrendingUp,
  Wallet,
} from "../../ui/icons.tsx";
import { Page, PageHeader, SectionTitle, Stack } from "../../ui/page-frame.tsx";
import { Badge, Divider, Empty, Notice, Panel, PanelHeader } from "../../ui/primitives.tsx";
import { ConfirmOccurrence } from "./confirm-occurrence.tsx";
import { NewRecurrence } from "./new-recurrence.tsx";

/** Depende da identidade da requisição: nunca pode ser servida de cache. */
export const dynamic = "force-dynamic";

const ROTULO_PAPEL: Record<string, string> = {
  salary: "Salário",
  benefit: "Benefício",
  subscription: "Assinatura",
  standard: "Recorrente",
};

/** Regra com próxima ocorrência conhecida — o que entra na régua do tempo. */
type ComProxima = RecurrenceView & { next: NonNullable<RecurrenceView["next"]> };

/** Regra com ocorrência da competência corrente ainda não confirmada. */
type ComPendente = RecurrenceView & { pending: NonNullable<RecurrenceView["pending"]> };

/**
 * Recorrências.
 *
 * A tela responde, nesta ordem: o que exige uma decisão agora (confirmar),
 * como o mês fica, o que vem pela frente e como os próximos meses ficam. As
 * regras não aparecem como um cadastro — aparecem como uma sequência no tempo,
 * porque "quando cai" é a pergunta que se faz sobre uma recorrência; "que
 * regras existem" é consequência.
 *
 * Nada aqui é fato consumado: a projeção é derivada das regras a cada consulta
 * e só vira lançamento quando o usuário confirma. Por isso o valor previsto
 * nunca recebe o mesmo tratamento de um lançamento confirmado.
 */
export default async function Planejamento() {
  const user = await currentUser();
  // O desvio de quem não tem sessão acontece em `proxy.ts`, como resposta
  // HTTP, e o layout mostra o aviso. Lançar aqui viraria exceção na
  // renderização — que o Vite transmite como erro para todas as abas.
  if (!user) return null;

  const view = await buildPlanningView(user.id);

  const pendentes = view.recurrences.filter(
    (item): item is ComPendente => item.isActive && item.pending !== null,
  );

  // Uma ocorrência por regra — a próxima. Repetir a mesma assinatura em quatro
  // meses encheria a régua sem responder nada que a frequência já não diga.
  const agenda = view.recurrences
    .filter((item): item is ComProxima => item.isActive && item.next !== null)
    .sort((esquerda, direita) => esquerda.next.date.localeCompare(direita.next.date));

  // Pausada ou encerrada não entra na projeção; some da régua e vira nota de
  // rodapé, para o usuário saber que a regra existe sem confundi-la com ativa.
  const paradas = view.recurrences.filter((item) => !item.isActive || item.next === null);

  const mesAtual = view.projection[0];
  const assinaturas = view.subscriptions;

  // Entrada e saída somadas separadamente: um líquido esconde os dois números
  // que interessam, e salário pendente com conta pendente não é a mesma coisa.
  const pendenteEntrada = pendentes
    .filter((item) => item.kind === "income")
    .reduce((soma, item) => soma + item.pending.amountCents, 0);
  const pendenteSaida = pendentes
    .filter((item) => item.kind !== "income")
    .reduce((soma, item) => soma + item.pending.amountCents, 0);

  const metricas: MetricProps[] = [
    {
      label: "Renda prevista",
      value: money(mesAtual.incomeCents),
      tone: "positive",
      hint: `${mesAtual.businessDays} dias úteis em ${competenceShort(mesAtual.competence)}`,
      icon: TrendingUp,
    },
    {
      label: "Comprometido",
      value: money(mesAtual.committedCents),
      hint: "Contas fixas, assinaturas e as faturas que vencem no mês",
      icon: Layers,
    },
    {
      label: "Sobra prevista",
      value: money(mesAtual.freeCents, { signed: true }),
      tone: mesAtual.freeCents < 0 ? "negative" : "neutral",
      hint:
        mesAtual.freeCents < 0
          ? "Os compromissos do mês passam da renda prevista"
          : "Renda prevista menos tudo que já está assumido",
      icon: Wallet,
    },
    {
      label: "Assinaturas",
      value: money(assinaturas.monthlyCents),
      hint: `por mês · ${money(assinaturas.yearlyCents)} por ano`,
      icon: Repeat,
    },
  ];

  const eventos: TimelineItem[] = agenda.map((item) => {
    const entrada = item.kind === "income";
    return {
      id: item.id,
      when: `${dateShort(item.next.date)} · ${relativeDay(item.next.date, view.today)}`,
      title: item.description,
      detail: <DetalheDaRegra item={item} />,
      value: money(item.next.amountCents),
      // Receita ganha o verde no valor; despesa fica em tinta comum — vermelho
      // aqui é alarme, e uma conta que vai vencer no prazo não é alarme.
      valueTone: entrada ? "positive" : "neutral",
      tone: entrada ? "positive" : "neutral",
      icon: entrada ? ArrowUpRight : ArrowDownRight,
    };
  });

  return (
    <Page>
      <PageHeader
        eyebrow={competenceLong(view.competence)}
        title="Recorrências"
        description="Salário, contas fixas e assinaturas: o que se repete todo mês e como os próximos meses ficam por causa disso."
        actions={<NewRecurrence options={view.options} />}
      />

      <Stack gap="lg">
        {pendentes.length ? (
          <section className="rounded-panel border border-caution/30 bg-caution-wash p-4 sm:p-5">
            <header className="mb-3 flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 text-heading text-ink">
                  <Clock size={15} strokeWidth={1.5} className="shrink-0 text-caution" aria-hidden />
                  Aguardando confirmação
                </h2>
                <p className="mt-1 max-w-measure text-caption text-ink-muted">
                  Ocorrências de {competenceLong(view.competence)} que ainda não viraram lançamento.
                  Confirmar transforma a projeção em fato — e só então o saldo muda.
                </p>
              </div>
              <p className="shrink-0 text-caption text-ink-muted">
                {pendenteEntrada > 0 ? (
                  <span className="tabular font-medium text-positive">{money(pendenteEntrada)} a entrar</span>
                ) : null}
                {pendenteEntrada > 0 && pendenteSaida > 0 ? (
                  <span className="mx-1.5 text-line-strong">·</span>
                ) : null}
                {pendenteSaida > 0 ? (
                  <span className="tabular font-medium text-ink">{money(pendenteSaida)} a sair</span>
                ) : null}
              </p>
            </header>

            <ul className="space-y-1.5">
              {pendentes.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-md bg-surface px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body text-ink">{item.description}</p>
                    <p className="mt-0.5 truncate text-caption text-ink-subtle">
                      {date(item.pending.date)} · {relativeDay(item.pending.date, view.today)} ·{" "}
                      {item.originName}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Amount
                      cents={item.pending.amountCents}
                      tone={item.kind === "income" ? "positive" : "neutral"}
                    />
                    <ConfirmOccurrence
                      recurrenceId={item.id}
                      competence={item.pending.competence}
                      amountCents={item.pending.amountCents}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <MetricStrip metrics={metricas} />

        <div className="grid gap-5 lg:grid-cols-3">
          <div className="min-w-0 lg:col-span-2">
            <Panel>
              <PanelHeader
                title="Próximas ocorrências"
                icon={Calendar}
                hint="A próxima data de cada regra ativa, na ordem em que acontecem"
                action={<Badge variant="outline">previsto</Badge>}
              />
              {eventos.length ? (
                <Timeline items={eventos} />
              ) : (
                <Empty
                  icon={Calendar}
                  title="Nenhuma recorrência ativa"
                  hint="Cadastre salário, contas fixas e assinaturas para o Fluxo projetar os próximos meses."
                />
              )}
            </Panel>
          </div>

          <Panel>
            <PanelHeader
              title="Assinaturas"
              icon={Repeat}
              hint={
                assinaturas.activeCount
                  ? `${assinaturas.activeCount} ativa${assinaturas.activeCount > 1 ? "s" : ""} · ${money(assinaturas.monthlyCents)} por mês`
                  : undefined
              }
            />

            {assinaturas.activeCount ? (
              <>
                {assinaturas.next7DaysCents > 0 ? (
                  <Notice tone="caution" icon={Clock}>
                    <span className="tabular font-medium">{money(assinaturas.next7DaysCents)}</span> em
                    cobranças nos próximos 7 dias.
                  </Notice>
                ) : null}

                {assinaturas.upcoming.length ? (
                  <ul className={assinaturas.next7DaysCents > 0 ? "mt-3" : undefined}>
                    {assinaturas.upcoming.slice(0, 6).map((cobranca) => (
                      <ListRow
                        key={`${cobranca.recurrenceId}-${cobranca.date}`}
                        title={cobranca.description}
                        subtitle={relativeDay(cobranca.date, view.today)}
                        value={money(cobranca.amountCents)}
                        meta={dateShort(cobranca.date)}
                      />
                    ))}
                  </ul>
                ) : (
                  <Empty
                    icon={Calendar}
                    title="Nenhuma cobrança nos próximos 30 dias"
                    hint="As assinaturas cadastradas só voltam a cobrar depois desse prazo."
                    compact
                  />
                )}
              </>
            ) : (
              <Empty
                icon={Repeat}
                title="Nenhuma assinatura"
                hint="Cadastre uma recorrência com o papel Assinatura para ver o custo total aqui."
                compact
              />
            )}
          </Panel>
        </div>

        <Panel>
          <ChartFrame
            title="Projeção dos próximos meses"
            hint="O que sobra em cada mês depois de honrar tudo que já está assumido"
            legend={[
              { label: "sobra", color: "var(--color-positive)" },
              { label: "estouro", color: "var(--color-negative)" },
            ]}
          >
            <BarChart
              bars={view.projection.map((mes) => ({
                label: competenceShort(mes.competence),
                value: mes.freeCents,
                tone: mes.freeCents < 0 ? "negative" : "positive",
              }))}
              height={160}
              format={(valor) => money(valor)}
            />
          </ChartFrame>

          <Divider soft className="my-5" />

          {/* A tabela existe para conferir a barra: sem a conta que produziu o
              número, o gráfico pede confiança cega. */}
          <DataTable
            caption="Renda prevista, comprometido e sobra por competência"
            columns={[
              { key: "mes", header: "Mês" },
              { key: "uteis", header: "Dias úteis", align: "right", hideBelow: "md" },
              { key: "renda", header: "Renda prevista", align: "right" },
              { key: "comprometido", header: "Comprometido", align: "right" },
              { key: "sobra", header: "Sobra", align: "right" },
            ]}
          >
            {view.projection.map((mes) => (
              <Tr key={mes.competence}>
                <Td>
                  <span className="flex items-center gap-2">
                    <span className="whitespace-nowrap">{competenceShort(mes.competence)}</span>
                    {mes.competence === view.competence ? (
                      <Badge tone="accent" variant="outline">
                        atual
                      </Badge>
                    ) : null}
                  </span>
                </Td>
                <Td align="right" hideBelow="md" className="tabular text-ink-subtle">
                  {mes.businessDays}
                </Td>
                <Td align="right">
                  <Amount cents={mes.incomeCents} tone="positive" size="body-sm" />
                </Td>
                <Td align="right">
                  <Amount cents={mes.committedCents} size="body-sm" />
                </Td>
                <Td align="right">
                  <Amount
                    cents={mes.freeCents}
                    signed
                    tone={mes.freeCents < 0 ? "negative" : "neutral"}
                    size="body-sm"
                  />
                </Td>
              </Tr>
            ))}
          </DataTable>
        </Panel>

        {paradas.length ? (
          <section>
            <SectionTitle
              title="Fora da projeção"
              hint="Regras pausadas ou já encerradas — não entram no cálculo dos próximos meses"
            />
            <ul>
              {paradas.map((item) => (
                <ListRow
                  key={item.id}
                  title={item.description}
                  subtitle={`${ROTULO_PAPEL[item.role] ?? item.role} · ${item.scheduleLabel} · ${item.originName}`}
                  value={money(item.amountCents)}
                  meta={item.interval === "yearly" ? "anual" : "mensal"}
                  badge={
                    <Badge tone={item.isActive ? "neutral" : "caution"}>
                      {item.isActive ? "encerrada" : "pausada"}
                    </Badge>
                  }
                />
              ))}
            </ul>
          </section>
        ) : null}
      </Stack>
    </Page>
  );
}

/**
 * A linha de contexto de uma regra na régua do tempo.
 *
 * Papel, origem e agendamento numa linha só: é o que distingue duas regras de
 * mesmo nome — "Internet" no cartão e "Internet" no débito.
 */
function DetalheDaRegra({ item }: { item: ComProxima }) {
  const partes = [item.originName, item.scheduleLabel];
  if (item.categoryName) partes.push(item.categoryName);
  if (item.amountMode === "per_business_day") partes.push("por dia útil");
  if (item.interval === "yearly") partes.push("anual");

  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5">
      {item.role !== "standard" ? (
        <Badge tone={item.kind === "income" ? "positive" : "neutral"} variant="outline">
          {ROTULO_PAPEL[item.role] ?? item.role}
        </Badge>
      ) : null}
      <span>{partes.join(" · ")}</span>
    </span>
  );
}
