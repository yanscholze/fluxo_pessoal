/**
 * A face do cartão, do desenho do Mesa.
 *
 * Proporção 1,586 — a de um cartão de verdade —, gradiente de 145° indo do
 * acento para a superfície e sombra roxa de 70px espalhada por baixo. É o
 * elemento mais caprichado do protótipo, e o que mais denuncia quando é
 * reproduzido pela metade.
 *
 * **O Fluxo não guarda validade de cartão.** O desenho reserva aquele canto
 * para ela, e preencher com uma data plausível seria inventar dado — o tipo de
 * mentira que parece certa. O espaço recebe o que é verdade e é útil no mesmo
 * lugar: o dia em que a fatura fecha.
 */

import type { LocalDate } from "../../../core/time/local-date.ts";
import { dateShort } from "../../ui/format.ts";
import { CreditCard } from "../../ui/icons.tsx";

export function MesaCardFace({
  nome,
  last4,
  titular,
  fechaEm,
  cor,
}: {
  nome: string;
  last4: string;
  titular: string;
  fechaEm: LocalDate | null;
  cor: string;
}) {
  return (
    <div
      className="credit-card"
      style={{
        // A cor do cartão entra no gradiente no lugar do acento: dois cartões
        // lado a lado com o mesmo roxo seriam indistinguíveis de relance.
        background: `linear-gradient(145deg, color-mix(in oklab, ${cor} 45%, var(--color-surface)), var(--color-surface) 68%)`,
        borderColor: `color-mix(in oklab, ${cor} 40%, transparent)`,
        boxShadow: `0 30px 70px -28px color-mix(in oklab, ${cor} 40%, transparent)`,
      }}
    >
      <div className="flex justify-between">
        <CreditCard className="size-5 text-ink" aria-hidden />
        <span className="text-caption text-ink">{nome}</span>
      </div>

      <p className="tabular mt-auto text-xl tracking-[0.18em] text-ink">
        •••• •••• •••• {last4 || "••••"}
      </p>

      <div className="mt-5 flex justify-between text-caption text-ink-muted">
        <span className="truncate uppercase">{titular}</span>
        <span className="shrink-0">{fechaEm ? `fecha ${dateShort(fechaEm)}` : "—"}</span>
      </div>
    </div>
  );
}
