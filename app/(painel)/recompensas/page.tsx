import { redirect } from "next/navigation";

import { buildRewardsView } from "../../../server/services/rewards.ts";
import { currentUser } from "../../auth-context.ts";
import { Badge, Card, Empty, Figure, Label, Meter, SectionHeading } from "../../ui/primitives.tsx";
import { competenceShort, date, decimal, money, percent } from "../../ui/format.ts";
import { RedeemForm } from "./redeem-form.tsx";

export const dynamic = "force-dynamic";

/** Pontos são guardados em milésimos; a tela mostra a unidade. */
function pontos(milli: number): string {
  return decimal(milli / 1000, milli % 1000 === 0 ? 0 : 2);
}

function cotacao(micros: number): string {
  return (micros / 1_000_000).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function Recompensas() {
  const user = await currentUser();
  if (!user) redirect("/entrar");

  const view = await buildRewardsView(user.id);

  return (
    <main className="mx-auto w-full max-w-[76rem] px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-[1.625rem] font-semibold tracking-[-0.02em] text-ink">Recompensas</h1>
        <p className="mt-1 text-[0.875rem] text-ink-muted">
          Pontos e cashback acumulados. Só fatura fechada rende saldo resgatável.
        </p>
      </header>

      {view.cards.length ? (
        <div className="space-y-5">
          {view.cards.map((cartao) => {
            const temPontos = cartao.config.mode === "points" || cartao.config.mode === "both";
            const temCashback = cartao.config.mode === "cashback" || cartao.config.mode === "both";

            return (
              <Card key={cartao.cardId} as="article">
                <header className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-[1rem] font-semibold text-ink">{cartao.cardName}</h2>
                    <p className="mt-0.5 text-[0.75rem] text-ink-subtle">
                      {temPontos
                        ? `${decimal(cartao.config.pointsPerDollarMilli / 1000, 2)} ponto por dólar`
                        : ""}
                      {temPontos && temCashback ? " · " : ""}
                      {temCashback ? `${percent(cartao.config.cashbackBasisPoints / 100, 2)} de cashback` : ""}
                    </p>
                  </div>
                  <RedeemForm
                    cardId={cartao.cardId}
                    cardName={cartao.cardName}
                    pointsMilli={cartao.balance.pointsMilli}
                    cashbackCents={cartao.balance.cashbackCents}
                    accounts={view.accounts}
                    hasPoints={temPontos}
                    hasCashback={temCashback}
                  />
                </header>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {temPontos ? (
                    <div className="rounded-[--radius-control] border border-line bg-surface-sunken p-4">
                      <Label>Pontos disponíveis</Label>
                      <Figure value={pontos(cartao.balance.pointsMilli)} size="sm" className="mt-1.5" />
                      {cartao.balance.pendingPointsMilli > 0 ? (
                        <p className="mt-1.5 text-[0.75rem] text-ink-subtle">
                          + {pontos(cartao.balance.pendingPointsMilli)} na fatura aberta, ainda não creditados
                        </p>
                      ) : null}
                      {cartao.config.pointsGoal > 0 ? (
                        <div className="mt-3">
                          <Meter
                            value={cartao.balance.pointsMilli / 1000}
                            total={cartao.config.pointsGoal}
                            tone="accent"
                            label="Meta de pontos"
                          />
                          <p className="mt-1.5 text-[0.75rem] text-ink-subtle">
                            {percent(cartao.balance.goalPercent)} da meta de{" "}
                            {decimal(cartao.config.pointsGoal, 0)} pontos
                          </p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {temCashback ? (
                    <div className="rounded-[--radius-control] border border-line bg-surface-sunken p-4">
                      <Label>Cashback disponível</Label>
                      <Figure
                        value={money(cartao.balance.cashbackCents)}
                        size="sm"
                        tone="positive"
                        className="mt-1.5"
                      />
                      {cartao.balance.pendingCashbackCents > 0 ? (
                        <p className="mt-1.5 text-[0.75rem] text-ink-subtle">
                          + {money(cartao.balance.pendingCashbackCents)} na fatura aberta
                        </p>
                      ) : null}
                      {cartao.balance.redeemedCashbackCents > 0 ? (
                        <p className="mt-1.5 text-[0.75rem] text-ink-subtle">
                          {money(cartao.balance.redeemedCashbackCents)} já resgatados
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {cartao.currentRateMicros ? (
                  <p className="mt-3 text-[0.75rem] text-ink-subtle">
                    Cotação usada: 1 USD = {cotacao(cartao.currentRateMicros)}
                    {cartao.rateSource ? ` · ${cartao.rateSource}` : ""}
                    {cartao.rateStale ? " · não é do dia" : ""}
                  </p>
                ) : (
                  <p className="mt-3 rounded-[--radius-control] bg-caution-wash px-3 py-2 text-[0.75rem] text-caution">
                    Sem cotação do dólar não dá para calcular pontos. Cadastre uma cotação manual no cartão.
                  </p>
                )}

                {cartao.entries.length ? (
                  <details className="mt-4">
                    <summary className="cursor-pointer text-[0.8125rem] text-ink-muted">
                      Compras que renderam
                    </summary>
                    <ul className="mt-2 border-t border-line">
                      {cartao.entries.map((entrada) => (
                        <li
                          key={entrada.transactionId}
                          className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-0"
                        >
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 truncate text-[0.8125rem] text-ink">
                              {entrada.description}
                              {!entrada.settled ? <Badge tone="caution">fatura aberta</Badge> : null}
                            </p>
                            <p className="text-[0.6875rem] text-ink-subtle">
                              {date(entrada.occurredOn)} · {money(entrada.amountCents)} ·{" "}
                              {competenceShort(entrada.competence)}
                              {entrada.usdRateMicros > 0 ? ` · dólar a ${cotacao(entrada.usdRateMicros)}` : ""}
                            </p>
                          </div>
                          <p className="tabular shrink-0 text-right text-[0.8125rem]">
                            {entrada.pointsMilli > 0 ? (
                              <span className="block text-ink">{pontos(entrada.pointsMilli)} pts</span>
                            ) : null}
                            {entrada.cashbackCents > 0 ? (
                              <span className="block text-positive">{money(entrada.cashbackCents)}</span>
                            ) : null}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}

                {cartao.redemptions.length ? (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-[0.8125rem] text-ink-muted">
                      Resgates ({cartao.redemptions.length})
                    </summary>
                    <ul className="mt-2 border-t border-line">
                      {cartao.redemptions.map((resgate) => (
                        <li
                          key={resgate.id}
                          className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-0"
                        >
                          <span className="text-[0.8125rem] text-ink">
                            {resgate.kind === "points" ? "Pontos" : "Cashback"}
                            {resgate.note ? <span className="text-ink-subtle"> · {resgate.note}</span> : null}
                          </span>
                          <span className="text-right">
                            <span className="tabular block text-[0.8125rem] text-ink">
                              {resgate.kind === "points"
                                ? `${pontos(resgate.amount)} pts`
                                : money(resgate.amount)}
                            </span>
                            <span className="block text-[0.6875rem] text-ink-subtle">
                              {date(resgate.redeemedOn)}
                            </span>
                          </span>
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
            title="Nenhum cartão com recompensa"
            hint="Configure pontos por dólar ou cashback no cadastro do cartão para acompanhar aqui."
          />
        </Card>
      )}
    </main>
  );
}
