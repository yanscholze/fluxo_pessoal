import type { CardRewardsView, RewardsView } from "../../../server/services/rewards.ts";
import { DataTable, Td, Tr } from "../../ui/data-display.tsx";
import { competenceShort, date, decimal, money, percent } from "../../ui/format.ts";
import { Coins, Gift } from "../../ui/icons.tsx";
import { SectionTitle } from "../../ui/page-frame.tsx";
import { Badge, Empty, Label, Meter, Notice, Panel } from "../../ui/primitives.tsx";
import { RedeemForm } from "../recompensas/redeem-form.tsx";

/** Pontos são guardados em milésimos; a tela mostra a unidade. */
function pontos(milli: number): string {
  return decimal(milli / 1000, milli % 1000 === 0 ? 0 : 2);
}

function cotacao(micros: number): string {
  return (micros / 1_000_000).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function CardRewardsPanel({
  card: cartao,
  accounts,
}: {
  card: CardRewardsView;
  accounts: RewardsView["accounts"];
}) {
  const temPontos = cartao.config.mode === "points" || cartao.config.mode === "both";
  const temCashback = cartao.config.mode === "cashback" || cartao.config.mode === "both";

  return (
    <Panel as="article">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-heading text-ink">
            <Gift size={15} strokeWidth={1.5} className="shrink-0 text-ink-subtle" aria-hidden />
            Recompensas do {cartao.cardName}
          </h2>
          <p className="mt-0.5 text-caption text-ink-subtle">
            {temPontos
              ? `${decimal(cartao.config.pointsPerDollarMilli / 1000, 2)} ponto por dólar`
              : ""}
            {temPontos && temCashback ? " · " : ""}
            {temCashback ? `${percent(cartao.config.cashbackBasisPoints / 100, 2)} de cashback` : ""}
          </p>
        </div>

        <RedeemForm
          key={cartao.cardId}
          cardId={cartao.cardId}
          cardName={cartao.cardName}
          pointsMilli={cartao.balance.pointsMilli}
          cashbackCents={cartao.balance.cashbackCents}
          accounts={accounts}
          hasPoints={temPontos}
          hasCashback={temCashback}
        />
      </header>

      <p className="mt-3 text-body-sm text-ink-muted">
        O saldo fica disponível quando a fatura fecha. Compras atuais e parcelas futuras aparecem como pendentes.
      </p>

      <div className={`mt-4 grid gap-4 ${temPontos && temCashback ? "sm:grid-cols-2" : ""}`}>
        {temPontos ? (
          <div className="rounded-md border border-line bg-surface-sunken p-4">
            <Label>Pontos disponíveis</Label>
            <p className="tabular mt-1 text-figure text-ink">{pontos(cartao.balance.pointsMilli)}</p>
            {cartao.balance.pendingPointsMilli > 0 ? (
              <p className="mt-1 text-caption text-ink-subtle">
                + {pontos(cartao.balance.pendingPointsMilli)} em faturas atuais e futuras, ainda não creditados
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
                <p className="mt-1.5 text-caption text-ink-subtle">
                  {percent(cartao.balance.goalPercent)} da meta de{" "}
                  {decimal(cartao.config.pointsGoal, 0)} pontos
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        {temCashback ? (
          <div className="rounded-md border border-line bg-surface-sunken p-4">
            <Label>Cashback disponível</Label>
            <p className="tabular mt-1 text-figure text-positive">
              {money(cartao.balance.cashbackCents)}
            </p>
            {cartao.balance.pendingCashbackCents > 0 ? (
              <p className="mt-1 text-caption text-ink-subtle">
                + {money(cartao.balance.pendingCashbackCents)} em faturas atuais e futuras
              </p>
            ) : null}
            {cartao.balance.redeemedCashbackCents > 0 ? (
              <p className="mt-1 text-caption text-ink-subtle">
                {money(cartao.balance.redeemedCashbackCents)} já resgatados
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {temPontos ? <div className="mt-4">
        {cartao.currentRateMicros ? (
          <p className="text-caption text-ink-subtle">
            Cotação usada: 1 USD = <span className="tabular">{cotacao(cartao.currentRateMicros)}</span>
            {cartao.rateSource ? ` · ${cartao.rateSource}` : ""}
            {cartao.rateStale ? " · não é do dia" : ""}
          </p>
        ) : (
          <Notice tone="caution" icon={Coins}>
            Sem cotação do dólar não dá para calcular pontos. Cadastre uma cotação manual no cartão.
          </Notice>
        )}
      </div> : null}

      {cartao.entries.length ? (
        <div className="mt-5">
          <SectionTitle title="Compras que renderam" />
          <DataTable
            caption={`Compras do ${cartao.cardName} que geraram recompensa`}
            columns={[
              { key: "descricao", header: "Compra", flexible: true },
              { key: "competencia", header: "Fatura", hideBelow: "sm" },
              { key: "data", header: "Data", align: "right", hideBelow: "sm", width: "5.5rem" },
              { key: "valor", header: "Valor", align: "right", width: "7rem" },
              { key: "rendeu", header: "Rendeu", align: "right", width: "8rem" },
            ]}
          >
            {cartao.entries.map((entrada) => (
              <Tr key={entrada.transactionId}>
                <Td truncate>
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-body">{entrada.description}</span>
                    {!entrada.settled ? <Badge tone="caution">pendente</Badge> : null}
                  </span>
                </Td>
                <Td hideBelow="sm" className="text-body-sm text-ink-muted">
                  {competenceShort(entrada.competence)}
                </Td>
                <Td align="right" hideBelow="sm" className="tabular text-caption text-ink-subtle">
                  {date(entrada.occurredOn)}
                </Td>
                <Td align="right" className="tabular text-body-sm text-ink">
                  {money(entrada.amountCents)}
                </Td>
                <Td align="right">
                  {entrada.pointsMilli > 0 ? (
                    <span className="tabular block text-body-sm font-medium text-ink">
                      {pontos(entrada.pointsMilli)} pts
                    </span>
                  ) : null}
                  {entrada.cashbackCents > 0 ? (
                    <span className="tabular block text-body-sm font-medium text-positive">
                      {money(entrada.cashbackCents)}
                    </span>
                  ) : null}
                </Td>
              </Tr>
            ))}
          </DataTable>
        </div>
      ) : (
        <div className="mt-5">
          <Empty icon={Gift} title="Suas recompensas começam aqui" hint="As compras deste cartão aparecerão com os pontos e o cashback que renderam." />
        </div>
      )}

      {cartao.redemptions.length ? (
        <div className="mt-5">
          <SectionTitle title="Resgates" hint={`${cartao.redemptions.length} no histórico`} />
          <DataTable
            caption={`Resgates do ${cartao.cardName}`}
            columns={[
              { key: "tipo", header: "Tipo" },
              { key: "nota", header: "Observação", hideBelow: "sm" },
              { key: "data", header: "Data", align: "right", width: "6.5rem" },
              { key: "valor", header: "Resgatado", align: "right", width: "8rem" },
            ]}
          >
            {cartao.redemptions.map((resgate) => (
              <Tr key={resgate.id}>
                <Td className="text-body-sm">
                  {resgate.kind === "points" ? "Pontos" : "Cashback"}
                </Td>
                <Td hideBelow="sm" className="truncate text-body-sm text-ink-muted">
                  {resgate.note ?? "—"}
                </Td>
                <Td align="right" className="tabular text-caption text-ink-subtle">
                  {date(resgate.redeemedOn)}
                </Td>
                <Td align="right" className="tabular text-body-sm font-medium text-ink">
                  {resgate.kind === "points" ? `${pontos(resgate.amount)} pts` : money(resgate.amount)}
                </Td>
              </Tr>
            ))}
          </DataTable>
        </div>
      ) : null}
    </Panel>
  );
}
