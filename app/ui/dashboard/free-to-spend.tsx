/**
 * "Livre para gastar" — o número que o Fluxo existe para responder.
 *
 * É a única superfície da aplicação com tratamento próprio, e isso é
 * deliberado: se ela usasse o mesmo painel do resto, seria a nona caixa igual
 * numa tela de nove caixas. Hierarquia se constrói tirando destaque de tudo o
 * mais, não somando enfeite a este.
 *
 * Vem sempre acompanhada do que a produziu. Um número financeiro sem a origem
 * obriga o usuário a confiar cegamente; com as parcelas ao lado, ele confere.
 *
 * A folga é o **menor saldo projetado** do horizonte, não a soma das parcelas:
 * a ordem dos vencimentos muda a resposta. Por isso as parcelas aparecem como
 * o que pesa no período, e não como uma conta que termina no resultado — somar
 * a coluna e não bater no total seria pior do que não mostrar nada.
 */

import { daysBetween } from "../../../core/time/local-date.ts";
import type { Dashboard } from "../../../server/services/dashboard.ts";
import { Breakdown } from "../data-display.tsx";
import { date, money } from "../format.ts";
import { CircleAlert, TrendingUp } from "../icons.tsx";
import { Label, Meter } from "../primitives.tsx";

export function FreeToSpend({
  data,
  today,
}: {
  data: Dashboard["freeToSpend"];
  today: Dashboard["today"];
}) {
  const negativo = data.amountCents < 0;

  const totalDoCiclo = Math.max(1, daysBetween(data.windowStart, data.windowEnd) + 1);
  const decorridos = Math.min(totalDoCiclo, Math.max(0, daysBetween(data.windowStart, today) + 1));
  const restantes = Math.max(0, totalDoCiclo - decorridos);

  // Quanto sobra por dia até o ciclo virar. É o que transforma um saldo em
  // decisão: "posso gastar isto hoje" em vez de "tenho isto".
  const porDia = restantes > 0 && !negativo ? Math.floor(data.amountCents / restantes) : null;

  return (
    <section
      className={`reveal relative overflow-hidden rounded-panel border p-5 sm:p-6 ${
        negativo ? "border-negative/30 bg-negative-wash" : "border-accent-edge bg-accent-wash"
      }`}
    >
      {/* Brilho de canto: dá peso à superfície sem virar gradiente chapado. */}
      <span
        aria-hidden
        className={`pointer-events-none absolute -right-24 -top-32 size-72 rounded-full blur-3xl ${
          negativo ? "bg-negative/10" : "bg-accent/10"
        }`}
      />

      <div className="relative flex flex-col gap-6 @2xl:flex-row @2xl:items-start @2xl:justify-between @2xl:gap-10">
        <div className="min-w-0 flex-1">
          <Label>Livre para gastar</Label>

          <p className={`tabular mt-2 text-display ${negativo ? "text-negative" : "text-ink"}`}>
            {money(data.amountCents)}
          </p>

          <p className="mt-3 flex items-start gap-2 text-body-sm text-ink-muted">
            {negativo ? (
              <CircleAlert size={15} strokeWidth={1.5} className="mt-0.5 shrink-0 text-negative" aria-hidden />
            ) : (
              <TrendingUp size={15} strokeWidth={1.5} className="mt-0.5 shrink-0 text-accent" aria-hidden />
            )}
            <span className="max-w-measure">
              {negativo
                ? `Os compromissos assumidos passam do que você tem. Em ${date(data.lowestOn)} o saldo fica negativo mesmo sem nenhum gasto novo.`
                : `É quanto pode sair hoje sem furar nenhum compromisso até ${date(data.horizonEnd)}. O ponto mais apertado é ${date(data.lowestOn)}.`}
            </span>
          </p>

          <div className="mt-5 max-w-md">
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-caption text-ink-subtle">
              <span>
                Ciclo de {date(data.windowStart)} a {date(data.windowEnd)}
              </span>
              <span className="tabular">
                {restantes === 0 ? "último dia" : `faltam ${restantes} dia${restantes > 1 ? "s" : ""}`}
              </span>
            </div>
            <Meter
              value={decorridos}
              total={totalDoCiclo}
              tone={negativo ? "negative" : "accent"}
              size="sm"
              label="Avanço do ciclo"
            />
            {porDia !== null ? (
              <p className="mt-2 text-caption text-ink-subtle">
                <span className="tabular font-medium text-ink">{money(porDia)}</span> por dia até o fim do ciclo
              </p>
            ) : null}
          </div>
        </div>

        <div className="w-full shrink-0 rounded-md border border-line bg-surface p-4 lg:w-72">
          <Label className="mb-3">O que pesa até {date(data.horizonEnd)}</Label>
          <Breakdown
            parts={[
              { label: "Saldo hoje", cents: data.liquidBalanceCents, sign: "+" },
              { label: "A receber", cents: data.pendingIncomeCents, sign: "+" },
              { label: "Faturas em aberto", cents: data.openInvoicesCents, sign: "−" },
              { label: "Contas previstas", cents: data.otherCommitmentsCents, sign: "−" },
            ]}
          />
          <p className="mt-3 border-t border-line pt-3 text-caption text-ink-subtle">
            A folga não é a soma dessas linhas: é o saldo no dia mais apertado do
            período, porque dinheiro que entra depois de uma conta vencer não
            paga essa conta.
          </p>
        </div>
      </div>
    </section>
  );
}
