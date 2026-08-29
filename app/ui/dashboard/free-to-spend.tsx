/**
 * "Livre para gastar" — o número que o Fluxo existe para responder.
 *
 * É a única superfície da aplicação com tratamento próprio, e isso é
 * deliberado: se ela usasse o mesmo painel do resto, seria a nona caixa igual
 * numa tela de nove caixas. Hierarquia se constrói tirando destaque de tudo o
 * mais, não somando enfeite a este.
 *
 * Vem sempre acompanhada da conta que o produziu. Um número financeiro sem a
 * origem obriga o usuário a confiar cegamente; com a decomposição ao lado, ele
 * confere.
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

      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between lg:gap-10">
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
                ? "Os compromissos deste ciclo passam do que você tem. Antecipar gasto novo agora aperta o mês."
                : "É o que sobra depois de honrar tudo que já está assumido neste ciclo."}
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
          <Label className="mb-3">Como chegamos aqui</Label>
          <Breakdown
            parts={[
              { label: "Saldo hoje", cents: data.liquidBalanceCents, sign: "+" },
              { label: "A receber no ciclo", cents: data.pendingIncomeCents, sign: "+" },
              { label: "Faturas em aberto", cents: data.openInvoicesCents, sign: "−" },
              { label: "Contas previstas", cents: data.otherCommitmentsCents, sign: "−" },
            ]}
            result={{
              label: "Livre para gastar",
              cents: data.amountCents,
              tone: negativo ? "negative" : "neutral",
            }}
          />
        </div>
      </div>
    </section>
  );
}
