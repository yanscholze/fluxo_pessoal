import { buildNetWorthView } from "../../../server/services/networth.ts";
import { currentUser } from "../../auth-context.ts";
import { LineChart } from "../../ui/charts.tsx";
import { Amount, Delta, KeyValue, ListRow, MetricStrip } from "../../ui/data-display.tsx";
import { competenceShort, money, percent } from "../../ui/format.ts";
import { CreditCard, Landmark, TrendingUp, Wallet } from "../../ui/icons.tsx";
import { Page, PageHeader, SectionTitle, Stack } from "../../ui/page-frame.tsx";
import { Empty, Meter, Notice, Panel, PanelHeader } from "../../ui/primitives.tsx";

export const dynamic = "force-dynamic";

/**
 * Patrimônio.
 *
 * O número existia espalhado — um item na faixa do painel, um total na tela de
 * contas — e em nenhum lugar era a pergunta. Aqui ele é: **quanto eu tenho de
 * verdade**, descontando o que devo, e para que lado isso vem andando.
 *
 * A ordem responde nesta sequência: o número, do que ele é feito, onde o
 * dinheiro está, o que pesa contra, e a linha do tempo. A evolução vem por
 * último de propósito — é a única parte que não muda uma decisão de hoje.
 */
export default async function Patrimonio() {
  const user = await currentUser();
  // O desvio de quem não tem sessão acontece em `proxy.ts`, como resposta
  // HTTP, e o layout mostra o aviso. Lançar aqui viraria exceção na
  // renderização — que o Vite transmite como erro para todas as abas.
  if (!user) return null;

  const view = await buildNetWorthView(user.id);
  const negativo = view.netWorthCents < 0;

  return (
    <Page>
      <PageHeader
        eyebrow="Posição consolidada"
        title="Patrimônio"
        description="O que você tem, menos o que deve. Contas, reservas e investimentos de um lado; faturas do outro."
      />

      <Stack gap="lg">
        <MetricStrip
          metrics={[
            {
              label: "Patrimônio líquido",
              value: money(view.netWorthCents),
              tone: negativo ? "negative" : "positive",
              hint: "Ativos menos dívidas",
              delta: { percent: view.changePercent, suffix: "em 12 meses" },
            },
            {
              label: "Ativos",
              value: money(view.assetsCents),
              hint: "Somando contas, reservas e investimentos",
              icon: Wallet,
            },
            {
              label: "Dívidas",
              value: money(view.liabilitiesCents),
              tone: view.liabilitiesCents > 0 ? "negative" : "neutral",
              hint: "Faturas de cartão em aberto",
              icon: CreditCard,
            },
            {
              label: "Guardado",
              value: money(view.investedCents),
              hint:
                view.assetsCents > 0
                  ? `${percent((view.investedCents / view.assetsCents) * 100)} dos ativos`
                  : "Sem ativos ainda",
              icon: TrendingUp,
            },
          ]}
        />

        {view.foreign.length ? (
          <Notice tone="info">
            {view.foreign
              .map((saldo) => `${saldo.currency} ${(saldo.balanceCents / 100).toFixed(2)}`)
              .join(" · ")}{" "}
            em moeda estrangeira ficam fora do total — somá-los como reais inventaria patrimônio
            conforme o câmbio.
          </Notice>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
          <Panel>
            <PanelHeader
              title="Onde o dinheiro está"
              hint={`${view.holdings.length} conta${view.holdings.length === 1 ? "" : "s"}`}
            />
            {view.holdings.length ? (
              <ul className="mt-1 space-y-3">
                {view.holdings.map((holding) => (
                  <li key={holding.id}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: holding.color }}
                          aria-hidden
                        />
                        <span className="truncate text-body text-ink">{holding.name}</span>
                        <span className="shrink-0 text-caption text-ink-subtle">
                          {holding.institution}
                        </span>
                      </span>
                      <Amount cents={holding.balanceCents} />
                    </div>
                    <div className="mt-1.5">
                      <Meter
                        value={Math.max(0, holding.balanceCents)}
                        total={Math.max(1, view.assetsCents)}
                        size="sm"
                        label={`${holding.name}: ${percent(holding.sharePercent)} dos ativos`}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty
                icon={Landmark}
                title="Nenhuma conta no total"
                hint="Cadastre uma conta para o patrimônio começar a ser somado."
              />
            )}
          </Panel>

          <Panel>
            <PanelHeader title="O que pesa contra" hint="Dívida de cartão" />
            {view.liabilities.length ? (
              <div className="mt-1">
                {view.liabilities.map((passivo) => (
                  <ListRow
                    key={passivo.id}
                    icon={CreditCard}
                    title={passivo.name}
                    subtitle="Fatura em aberto, incluindo parcelas futuras"
                    value={money(passivo.amountCents)}
                    valueTone="negative"
                  />
                ))}
              </div>
            ) : (
              <Empty
                icon={CreditCard}
                title="Sem dívida de cartão"
                hint="Nenhuma fatura em aberto neste momento."
              />
            )}

            <div className="mt-4 border-t border-line pt-4">
              <KeyValue
                columns={1}
                entries={[
                  { label: "Uso corrente", value: money(view.liquidCents) },
                  { label: "Guardado", value: money(view.investedCents) },
                  { label: "Dívidas", value: `− ${money(view.liabilitiesCents)}` },
                ]}
              />
            </div>
          </Panel>
        </div>

        <section>
          <SectionTitle
            title="Evolução"
            hint={
              view.changePercent !== null ? (
                <span className="flex items-center gap-1.5">
                  <Delta percent={view.changePercent} />
                  <span className="text-caption text-ink-subtle">
                    {view.changeCents >= 0 ? "+" : "−"} {money(Math.abs(view.changeCents))} no período
                  </span>
                </span>
              ) : undefined
            }
          />
          <Panel>
            <LineChart
              labels={view.history.map((ponto) => competenceShort(ponto.competence))}
              series={[
                {
                  id: "liquido",
                  label: "Patrimônio",
                  values: view.history.map((ponto) => ponto.netCents),
                  fill: true,
                },
                {
                  id: "ativos",
                  label: "Ativos",
                  values: view.history.map((ponto) => ponto.assetsCents),
                },
              ]}
              format={money}
              zeroLine
            />
          </Panel>
        </section>
      </Stack>
    </Page>
  );
}
