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
 * A conta fecha visivelmente: saldo disponível mais entradas previstas, menos
 * faturas e compromissos conhecidos do ciclo. Assim o usuário confere o valor
 * com os próprios lançamentos, sem um ajuste implícito escondido no painel.
 */

import { daysBetween } from "../../../core/time/local-date.ts";
import type { Dashboard } from "../../../server/services/dashboard.ts";
import { Breakdown } from "../data-display.tsx";
import { date, money } from "../format.ts";
import { CircleAlert, TrendingUp } from "../icons.tsx";
import { Label, Meter } from "../primitives.tsx";

export function FreeToSpend({
  data,
  benefit,
  today,
}: {
  data: Dashboard["freeToSpend"];
  benefit: Dashboard["benefitFreeToSpend"];
  today: Dashboard["today"];
}) {
  const negativo = data.amountCents < 0;
  const vale = benefit?.amountCents ?? 0;
  // Apenas detalha o total existente; não altera a projeção financeira.
  const livreDoSalario = data.amountCents - vale;

  const totalDoCiclo = Math.max(1, daysBetween(data.windowStart, data.windowEnd) + 1);
  const decorridos = Math.min(totalDoCiclo, Math.max(0, daysBetween(data.windowStart, today) + 1));
  const restantes = Math.max(0, totalDoCiclo - decorridos);

  // Quanto sobra por dia até o ciclo virar. É o que transforma um saldo em
  // decisão: "posso gastar isto hoje" em vez de "tenho isto".
  const porDia = restantes > 0 && !negativo ? Math.floor(data.amountCents / restantes) : null;

  return (
    <section
      className={`reveal @container relative overflow-hidden rounded-panel border p-5 ${
        negativo ? "border-negative/30 bg-negative-wash" : "border-line-strong bg-surface"
      }`}
    >
      {/* Brilho de canto: dá peso à superfície sem virar gradiente chapado. */}
      <span
        aria-hidden
        className={`pointer-events-none absolute -right-24 -top-32 size-72 rounded-full blur-3xl ${
          negativo ? "bg-negative/10" : "bg-accent/10"
        }`}
      />

      <div className="relative">
        <div className={`min-w-0 flex-1 border-l-2 pl-4 ${negativo ? "border-negative" : "border-accent"}`}>
          <Label>Livre para gastar</Label>

          <p
            className={`tabular mt-2 break-words text-display ${negativo ? "text-negative" : "text-ink"}`}
            style={{ fontSize: "clamp(1.75rem, 11cqi, var(--text-display))" }}
          >
            {money(data.amountCents)}
          </p>

          {/* O vale já integra a conta do ciclo e aparece detalhado para não
              esconder a parcela que só pode ser usada em alimentação. */}
          <p className="mt-2 flex flex-wrap items-baseline gap-x-2 text-body-sm text-ink-muted">
            <span className="tabular font-medium text-ink">{money(vale)}</span>
            <span>em V.A no fim do ciclo</span>
          </p>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-body-sm text-ink-muted">
            <span className={`tabular font-medium ${livreDoSalario < 0 ? "text-negative" : "text-ink"}`}>{money(livreDoSalario)}</span>
            <span>livre do salário</span>
          </p>

          <p className="mt-3 flex items-start gap-2 text-body-sm text-ink-muted">
            {negativo ? (
              <CircleAlert size={15} strokeWidth={1.5} className="mt-0.5 shrink-0 text-negative" aria-hidden />
            ) : (
              <TrendingUp size={15} strokeWidth={1.5} className="mt-0.5 shrink-0 text-accent" aria-hidden />
            )}
            <span className="max-w-measure">
              {negativo
                ? "Os compromissos conhecidos do ciclo passam do saldo e das entradas previstas."
                : "É a sobra do ciclo depois das faturas, recorrências e saídas já previstas."}
            </span>
          </p>

          <div className="mt-3">
            <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-caption text-ink-subtle">
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

        <details className="mt-4 border-t border-line pt-3">
          <summary className="cursor-pointer rounded text-body-sm font-medium text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">Conferir conta do ciclo</summary>
          <div className="mt-3">
            <Breakdown
              parts={[
                { label: "Saldo hoje", cents: data.liquidBalanceCents, sign: "+" },
                { label: "A receber", cents: data.pendingIncomeCents, sign: "+" },
                { label: "Faturas em aberto", cents: data.openInvoicesCents, sign: "−" },
                { label: "Contas previstas", cents: data.otherCommitmentsCents, sign: "−" },
              ]}
            />
            <p className="mt-3 border-t border-line pt-3 text-caption text-ink-subtle">
              Saldo disponível + entradas previstas − faturas em aberto − contas
              previstas. Categorias marcadas para não pesar ficam fora da conta.
            </p>
          </div>
        </details>
      </div>
    </section>
  );
}
