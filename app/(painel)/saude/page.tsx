import { redirect } from "next/navigation";

import { buildHealthView } from "../../../server/services/health.ts";
import { currentUser } from "../../auth-context.ts";
import { Badge, Card, Empty, Figure, Label, Meter, SectionHeading } from "../../ui/primitives.tsx";
import { date, decimal, money, percent, relativeDay } from "../../ui/format.ts";

export const dynamic = "force-dynamic";

const TOM: Record<"bom" | "atencao" | "critico", { badge: "positive" | "caution" | "negative"; texto: string }> = {
  bom: { badge: "positive", texto: "ok" },
  atencao: { badge: "caution", texto: "atenção" },
  critico: { badge: "negative", texto: "crítico" },
};

const ROTULO_EVENTO: Record<string, string> = {
  recorrencia: "Recorrência",
  fatura: "Fatura",
  parcela: "Parcela",
  previsto: "Previsto",
};

export default async function Saude() {
  const user = await currentUser();
  if (!user) redirect("/entrar");

  const view = await buildHealthView(user.id);
  const criticos = view.signals.filter((sinal) => sinal.status === "critico").length;

  return (
    <main className="mx-auto w-full max-w-[76rem] px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-[1.625rem] font-semibold tracking-[-0.02em] text-ink">Saúde financeira</h1>
        <p className="mt-1 text-[0.875rem] text-ink-muted">
          {criticos > 0
            ? `${criticos} ${criticos === 1 ? "ponto pede" : "pontos pedem"} atenção agora.`
            : "Diagnóstico a partir dos seus números, não de regra genérica."}
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card as="article">
          <Label>Livre para gastar</Label>
          <Figure
            value={money(view.freeToSpendCents)}
            size="sm"
            tone={view.freeToSpendCents < 0 ? "negative" : "neutral"}
            className="mt-1.5"
          />
        </Card>
        <Card as="article">
          <Label>Taxa de poupança</Label>
          <Figure
            value={percent(view.savingsRatePercent)}
            size="sm"
            tone={view.savingsRatePercent < 0 ? "negative" : view.savingsRatePercent >= 20 ? "positive" : "neutral"}
            className="mt-1.5"
          />
          <p className="mt-2 text-[0.75rem] text-ink-subtle">
            De {money(view.commitment.monthlyIncomeCents)} que entraram no mês
          </p>
        </Card>
        <Card as="article">
          <Label>Renda comprometida</Label>
          <Figure
            value={percent(view.commitment.percent)}
            size="sm"
            tone={view.commitment.percent > 75 ? "negative" : view.commitment.percent > 50 ? "caution" : "neutral"}
            className="mt-1.5"
          />
          <p className="mt-2 text-[0.75rem] text-ink-subtle">{money(view.commitment.committedCents)} com destino</p>
        </Card>
        <Card as="article">
          <Label>Patrimônio</Label>
          <Figure
            value={money(view.netWorthCents)}
            size="sm"
            tone={view.netWorthCents < 0 ? "negative" : "neutral"}
            className="mt-1.5"
          />
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <SectionHeading title="Diagnóstico" />
            <ul className="space-y-3">
              {view.signals.map((sinal) => {
                const tom = TOM[sinal.status];
                return (
                  <li key={sinal.key} className="flex items-start justify-between gap-4 border-b border-line pb-3 last:border-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-[0.875rem] font-medium text-ink">
                        {sinal.title}
                        <Badge tone={tom.badge}>{tom.texto}</Badge>
                      </p>
                      <p className="mt-0.5 text-[0.8125rem] text-ink-muted">{sinal.detail}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card>
            <SectionHeading title="Reserva de emergência" hint={`Alvo: 6 meses de gasto essencial`} />
            {view.reserve.monthlyEssentialCents > 0 ? (
              <>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="tabular text-figure-sm text-ink">{money(view.reserve.currentCents)}</p>
                    <p className="mt-1 text-[0.75rem] text-ink-subtle">
                      de {money(view.reserve.targetCents)} · cobre {decimal(view.reserve.monthsCovered)} meses
                    </p>
                  </div>
                  <p className="tabular text-[1.125rem] font-semibold text-ink">{percent(view.reserve.percent)}</p>
                </div>
                <div className="mt-3">
                  <Meter
                    value={view.reserve.currentCents}
                    total={view.reserve.targetCents}
                    tone={view.reserve.monthsCovered >= 6 ? "positive" : view.reserve.monthsCovered >= 3 ? "caution" : "negative"}
                    label="Reserva de emergência"
                  />
                </div>
                <p className="mt-2 text-[0.75rem] text-ink-subtle">
                  Gasto essencial médio: {money(view.reserve.monthlyEssentialCents)} por mês
                </p>
              </>
            ) : (
              <Empty
                title="Nenhuma categoria marcada como essencial"
                hint="Marque moradia, alimentação e transporte como essenciais para o Fluxo calcular o alvo da reserva."
              />
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <SectionHeading title="Dívidas" />
            <dl className="space-y-2">
              <Linha rotulo="Fatura de cartão" valor={money(view.debts.cardDebtCents)} />
              <Linha
                rotulo="Parcelas a vencer"
                valor={money(view.debts.openInstallmentsCents)}
              />
              <Linha
                rotulo="Faturas em atraso"
                valor={String(view.debts.overdueInvoices)}
                tom={view.debts.overdueInvoices > 0 ? "text-negative" : undefined}
              />
            </dl>
          </Card>

          <Card>
            <SectionHeading title="Próximos 30 dias" />
            {view.agenda.length ? (
              <ul>
                {view.agenda.map((evento, indice) => (
                  <li
                    key={`${evento.date}-${evento.description}-${indice}`}
                    className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[0.8125rem] text-ink">{evento.description}</p>
                      <p className="text-[0.6875rem] text-ink-subtle">
                        {date(evento.date)} · {relativeDay(evento.date, view.today)} ·{" "}
                        {ROTULO_EVENTO[evento.kind] ?? evento.kind}
                      </p>
                    </div>
                    <p
                      className={`tabular shrink-0 text-[0.8125rem] font-medium ${
                        evento.direction === "in" ? "text-positive" : "text-ink"
                      }`}
                    >
                      {evento.direction === "in" ? "+" : "−"} {money(evento.amountCents)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty title="Nada previsto nos próximos 30 dias" />
            )}
          </Card>
        </div>
      </div>
    </main>
  );
}

function Linha({ rotulo, valor, tom }: { rotulo: string; valor: string; tom?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[0.8125rem] text-ink-muted">{rotulo}</dt>
      <dd className={`tabular text-[0.875rem] ${tom ?? "text-ink"}`}>{valor}</dd>
    </div>
  );
}
