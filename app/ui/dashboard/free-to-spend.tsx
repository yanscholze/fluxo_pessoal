/**
 * "Livre para gastar" — o número que o Fluxo existe para responder.
 *
 * Fica sozinho no topo, grande, e vem acompanhado da conta que o produziu.
 * Um número financeiro sem a origem obriga o usuário a confiar cegamente; com
 * a decomposição ao lado, ele confere.
 */

import type { Dashboard } from "../../../server/services/dashboard.ts";
import { Card, Figure, Label } from "../primitives.tsx";
import { date, money } from "../format.ts";

type Parcela = {
  readonly rotulo: string;
  readonly valor: number;
  readonly sinal: "+" | "−";
};

export function FreeToSpend({
  data,
  today,
}: {
  data: Dashboard["freeToSpend"];
  today: Dashboard["today"];
}) {
  const negativo = data.amountCents < 0;

  const parcelas: Parcela[] = [
    { rotulo: "Saldo hoje", valor: data.liquidBalanceCents, sinal: "+" },
    { rotulo: "A receber no ciclo", valor: data.pendingIncomeCents, sinal: "+" },
    { rotulo: "Faturas em aberto", valor: data.openInvoicesCents, sinal: "−" },
    { rotulo: "Contas previstas", valor: data.otherCommitmentsCents, sinal: "−" },
  ];

  return (
    <Card className="border-accent/25 bg-linear-to-br from-accent-wash to-transparent">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Label>Livre para gastar</Label>
          <Figure value={money(data.amountCents)} tone={negativo ? "negative" : "neutral"} className="mt-2" />
          <p className="mt-2 max-w-[34rem] text-[0.8125rem] text-ink-muted">
            {negativo
              ? "Os compromissos deste ciclo passam do que você tem. Antecipar gasto novo agora aperta o mês."
              : "É o que sobra depois de honrar tudo que já está assumido neste ciclo."}
          </p>
          <p className="mt-1 text-[0.75rem] text-ink-subtle">
            Ciclo de {date(data.windowStart)} a {date(data.windowEnd)} · hoje é {date(today)}
          </p>
        </div>

        <dl className="w-full shrink-0 space-y-1.5 sm:w-64">
          {parcelas.map((parcela) => (
            <div key={parcela.rotulo} className="flex items-baseline justify-between gap-3">
              <dt className="text-[0.8125rem] text-ink-muted">{parcela.rotulo}</dt>
              <dd
                className={`tabular text-[0.8125rem] font-medium ${
                  parcela.valor === 0 ? "text-ink-subtle" : parcela.sinal === "+" ? "text-ink" : "text-negative"
                }`}
              >
                {parcela.valor === 0 ? "—" : `${parcela.sinal} ${money(parcela.valor)}`}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </Card>
  );
}
