/**
 * Contas.
 *
 * A tela responde uma pergunta só: **quanto dinheiro existe agora, e onde**.
 *
 * Por isso a hierarquia começa pelo disponível de hoje, em tamanho que não
 * deixa dúvida, e tudo o mais recua. As grandezas vizinhas — reservado,
 * patrimônio, previsto — aparecem separadas e nomeadas, nunca somadas ao
 * número principal: reserva não é dinheiro de gasto do dia a dia, e previsto
 * não é dinheiro que já entrou.
 *
 * A lista de contas vem em duas tabelas, e não numa só: "uso corrente" e
 * "reserva" respondem perguntas diferentes, e cada uma ganha as colunas que
 * importam para ela — movimento do mês de um lado, meta e rendimento do outro.
 */

import { redirect } from "next/navigation";

import { lastDay } from "../../../core/time/competence.ts";
import { type AccountView, buildAccountsView } from "../../../server/services/accounts.ts";
import { currentUser } from "../../auth-context.ts";
import { ChartFrame, LineChart, chartColor } from "../../ui/charts.tsx";
import {
  Amount,
  Breakdown,
  DataTable,
  Delta,
  type MetricProps,
  MetricStrip,
  Td,
  Tr,
} from "../../ui/data-display.tsx";
import { competenceShort, dateShort, money, percent } from "../../ui/format.ts";
import {
  Banknote,
  Calendar,
  Landmark,
  type LucideIcon,
  PiggyBank,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "../../ui/icons.tsx";
import { Page, PageHeader, SectionTitle, Stack } from "../../ui/page-frame.tsx";
import { Badge, Caption, Empty, Figure, Label, Meter, Panel } from "../../ui/primitives.tsx";
import { NewAccount } from "./new-account.tsx";

export const dynamic = "force-dynamic";

const TIPO: Record<string, { label: string; icon: LucideIcon }> = {
  checking: { label: "Conta corrente", icon: Landmark },
  savings: { label: "Poupança", icon: PiggyBank },
  cash: { label: "Dinheiro", icon: Banknote },
  benefit: { label: "Benefício", icon: Wallet },
  investment: { label: "Investimento", icon: TrendingUp },
};

/** Poupança e investimento são patrimônio, não dinheiro de gasto do dia a dia. */
const RESERVA = new Set(["savings", "investment"]);

export default async function Contas() {
  const user = await currentUser();
  if (!user) redirect("/entrar");

  const view = await buildAccountsView(user.id);

  const cabecalho = (
    <PageHeader
      eyebrow={`Saldos de ${dateShort(view.today)}`}
      title="Contas"
      description="Quanto existe agora em cada lugar. O que ainda vai entrar aparece como previsto, sempre separado."
      actions={<NewAccount />}
    />
  );

  if (!view.accounts.length) {
    return (
      <Page>
        {cabecalho}
        <Empty
          icon={Landmark}
          title="Nenhuma conta cadastrada"
          hint="Cadastre suas contas para o Fluxo calcular saldo, patrimônio e livre para gastar."
        />
      </Page>
    );
  }

  const correntes = view.accounts.filter((conta) => !RESERVA.has(conta.kind));
  const reservas = view.accounts.filter((conta) => RESERVA.has(conta.kind));

  // O previsto acompanha exatamente o mesmo conjunto que compõe o total: contas
  // em reais que entram nos totais. Somar as demais faria o previsto contar
  // dinheiro que o patrimônio ao lado não conta.
  const noTotal = view.accounts.filter((conta) => conta.currency === "BRL" && conta.includeInTotals);
  const previstoCents = noTotal.reduce((soma, conta) => soma + conta.projectedCents, 0);
  const aAcontecerCents = previstoCents - noTotal.reduce((soma, conta) => soma + conta.balanceCents, 0);
  const entradasCents = noTotal.reduce((soma, conta) => soma + conta.inflowCents, 0);
  const saidasCents = noTotal.reduce((soma, conta) => soma + conta.outflowCents, 0);

  const fimDoMes = lastDay(view.competence);
  const negativo = view.totals.spendableCents < 0;

  const indicadores: MetricProps[] = [
    {
      label: "Previsto no fim do mês",
      value: money(previstoCents),
      icon: Calendar,
      hint:
        aAcontecerCents === 0
          ? `Nada previsto além do que já aconteceu até ${dateShort(fimDoMes)}`
          : `${money(aAcontecerCents, { signed: true })} ainda por acontecer até ${dateShort(fimDoMes)}`,
    },
    {
      label: "Entradas no mês",
      value: money(entradasCents),
      tone: "positive",
      icon: TrendingUp,
      hint: "Receitas já confirmadas nas contas",
    },
    {
      label: "Saídas no mês",
      value: money(saidasCents),
      icon: TrendingDown,
      hint: "Despesas confirmadas nas contas. Transferência e pagamento de fatura ficam de fora.",
    },
  ];

  const temHistorico = view.history.some((ponto) => ponto.balanceCents !== 0);

  return (
    <Page>
      {cabecalho}

      <Stack gap="lg">
        {/* A resposta da tela, sem moldura: um número grande sobre a tela é mais
            forte do que o mesmo número dentro da primeira de várias caixas. */}
        <section className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between lg:gap-10">
          <div className="min-w-0 flex-1">
            <Label>Disponível hoje</Label>
            <Figure
              value={money(view.totals.spendableCents)}
              size="xl"
              tone={negativo ? "negative" : "neutral"}
              className="mt-2"
            />
            <p className="mt-3 flex max-w-measure items-start gap-2 text-body-sm text-ink-muted">
              <Landmark size={15} strokeWidth={1.5} className="mt-0.5 shrink-0 text-ink-subtle" aria-hidden />
              <span>
                Conta corrente, dinheiro e benefício, em reais. É o que existe agora — nada aqui é promessa.
              </span>
            </p>
          </div>

          <div className="w-full shrink-0 rounded-panel border border-line bg-surface p-4 shadow-panel lg:w-80">
            <Label className="mb-3">Patrimônio em contas</Label>
            <Breakdown
              parts={[
                { label: "Disponível para gastar", cents: view.totals.spendableCents, sign: "+" },
                { label: "Reservado e investido", cents: view.totals.investedCents, sign: "+" },
              ]}
              result={{ label: "Total nas contas", cents: view.totals.totalCents }}
            />
            {view.totals.byForeignCurrency.length ? (
              <Caption className="mt-3">
                Fora do total:{" "}
                {view.totals.byForeignCurrency
                  .map((item) => money(item.balanceCents, { currency: item.currency }))
                  .join(" · ")}{" "}
                — moeda estrangeira não é convertida.
              </Caption>
            ) : null}
          </div>
        </section>

        <MetricStrip metrics={indicadores} />

        {temHistorico ? <Evolucao history={view.history} /> : null}

        {correntes.length ? <UsoCorrente accounts={correntes} /> : null}

        {reservas.length ? <Reserva accounts={reservas} /> : null}
      </Stack>
    </Page>
  );
}

/**
 * Evolução do patrimônio.
 *
 * Linha e não barra: aqui o que importa é a trajetória entre os meses, não a
 * comparação de um mês contra o outro.
 */
function Evolucao({ history }: { history: Awaited<ReturnType<typeof buildAccountsView>>["history"] }) {
  const primeiro = history[0]?.balanceCents ?? 0;
  const ultimo = history.at(-1)?.balanceCents ?? 0;
  const variacao = primeiro !== 0 ? ((ultimo - primeiro) / Math.abs(primeiro)) * 100 : null;

  return (
    <Panel>
      <ChartFrame
        title="Evolução do patrimônio"
        hint="Saldo somado das contas em reais ao fim de cada mês"
        readout={
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="tabular text-figure-sm text-ink">{money(ultimo)}</span>
            <Delta percent={variacao} suffix="no período" />
          </div>
        }
      >
        <LineChart
          labels={history.map((ponto) => competenceShort(ponto.competence))}
          series={[
            {
              id: "patrimonio",
              label: "Patrimônio em contas",
              color: chartColor("accent"),
              values: history.map((ponto) => ponto.balanceCents),
              fill: true,
            },
          ]}
          format={(valor) => money(valor)}
          zeroLine
        />
      </ChartFrame>
    </Panel>
  );
}

/**
 * Contas de uso corrente.
 *
 * Tabela porque o usuário compara: qual conta tem mais, qual está drenando, o
 * que sobra em cada uma no fim do mês.
 */
function UsoCorrente({ accounts }: { accounts: readonly AccountView[] }) {
  return (
    <section>
      <SectionTitle
        title="Uso corrente"
        hint="Dinheiro para gastar. A coluna de previsto vem em tom recuado — ela ainda não aconteceu."
      />
      <DataTable
        caption="Saldo, movimento do mês e previsão de cada conta de uso corrente"
        columns={[
          { key: "conta", header: "Conta" },
          { key: "entradas", header: "Entradas", align: "right", hideBelow: "lg" },
          { key: "saidas", header: "Saídas", align: "right", hideBelow: "lg" },
          { key: "previsto", header: "Previsto no fim do mês", align: "right", hideBelow: "sm" },
          { key: "saldo", header: "Saldo hoje", align: "right" },
        ]}
      >
        {accounts.map((conta) => (
          <Tr key={conta.id}>
            <Td>
              <Identidade conta={conta} />
            </Td>
            <Td align="right" hideBelow="lg">
              {conta.inflowCents > 0 ? (
                <Amount cents={conta.inflowCents} tone="positive" size="body-sm" />
              ) : (
                <span className="text-body-sm text-ink-subtle">—</span>
              )}
            </Td>
            <Td align="right" hideBelow="lg">
              {conta.outflowCents > 0 ? (
                <Amount cents={conta.outflowCents} size="body-sm" />
              ) : (
                <span className="text-body-sm text-ink-subtle">—</span>
              )}
            </Td>
            <Td align="right" hideBelow="sm">
              <Previsto conta={conta} />
            </Td>
            <Td align="right">
              <Amount
                cents={conta.balanceCents}
                currency={conta.currency}
                tone={conta.balanceCents < 0 ? "negative" : "neutral"}
              />
            </Td>
          </Tr>
        ))}
      </DataTable>
    </section>
  );
}

/**
 * Reservas e investimentos.
 *
 * Colunas diferentes de propósito: aqui ninguém pergunta "quanto entrou este
 * mês", e sim "quanto falta para a meta" e "quanto isto rende".
 */
function Reserva({ accounts }: { accounts: readonly AccountView[] }) {
  const total = accounts
    .filter((conta) => conta.currency === "BRL" && conta.includeInTotals)
    .reduce((soma, conta) => soma + conta.balanceCents, 0);

  return (
    <section>
      <SectionTitle
        title="Reserva e investimento"
        hint={`${money(total)} guardados. É patrimônio — não entra no livre para gastar.`}
      />
      <DataTable
        caption="Saldo, rendimento estimado e meta de cada reserva"
        columns={[
          { key: "conta", header: "Conta" },
          { key: "rendimento", header: "Rendimento estimado", align: "right", hideBelow: "md" },
          { key: "meta", header: "Meta", width: "34%", hideBelow: "sm" },
          { key: "saldo", header: "Saldo hoje", align: "right" },
        ]}
      >
        {accounts.map((conta) => (
          <Tr key={conta.id}>
            <Td>
              <Identidade conta={conta} />
            </Td>
            <Td align="right" hideBelow="md">
              {conta.expectedYieldCents > 0 ? (
                <span className="tabular text-body-sm text-ink-muted">
                  {money(conta.expectedYieldCents)}
                  <span className="ml-1.5 text-caption text-ink-subtle">/mês</span>
                </span>
              ) : (
                <span className="text-body-sm text-ink-subtle">—</span>
              )}
            </Td>
            <Td hideBelow="sm">
              {conta.goalCents && conta.goalPercent !== null ? (
                <span className="block">
                  <Meter
                    value={conta.balanceCents}
                    total={conta.goalCents}
                    tone="positive"
                    size="sm"
                    label={`Meta de ${conta.name}`}
                  />
                  <span className="tabular mt-1.5 block text-caption text-ink-subtle">
                    {percent(conta.goalPercent)} de {money(conta.goalCents)}
                  </span>
                </span>
              ) : (
                <span className="text-body-sm text-ink-subtle">sem meta</span>
              )}
            </Td>
            <Td align="right">
              <Amount
                cents={conta.balanceCents}
                currency={conta.currency}
                tone={conta.balanceCents < 0 ? "negative" : "neutral"}
              />
            </Td>
          </Tr>
        ))}
      </DataTable>
    </section>
  );
}

/** Nome, natureza e instituição de uma conta, do jeito que a tabela precisa. */
function Identidade({ conta }: { conta: AccountView }) {
  const tipo = TIPO[conta.kind];

  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: conta.color }}
        aria-hidden
      />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-body text-ink">{conta.name}</span>
          {conta.includeInTotals ? null : <Badge tone="neutral">fora dos totais</Badge>}
          {conta.currency === "BRL" ? null : <Badge tone="info">{conta.currency}</Badge>}
        </span>
        <span className="mt-0.5 block truncate text-caption text-ink-subtle">
          {tipo?.label ?? conta.kind}
          {conta.institution && conta.institution !== "manual" ? ` · ${conta.institution}` : ""}
        </span>
      </span>
    </span>
  );
}

/**
 * Saldo previsto.
 *
 * Em tom recuado e nunca com o mesmo peso do saldo de hoje: previsto que se
 * parece com confirmado é o erro que faz alguém gastar o que ainda não tem.
 */
function Previsto({ conta }: { conta: AccountView }) {
  if (conta.projectedCents === conta.balanceCents) {
    return <span className="text-body-sm text-ink-subtle">—</span>;
  }

  return (
    <span className="tabular text-body-sm text-ink-muted">
      {money(conta.projectedCents, { currency: conta.currency })}
    </span>
  );
}
