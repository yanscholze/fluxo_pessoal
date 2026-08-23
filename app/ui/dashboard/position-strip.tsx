/**
 * A faixa que separa os quatro conceitos que nunca podem se misturar:
 * saldo atual, comprometido, patrimônio e o resultado do mês.
 */

import type { Dashboard } from "../../../server/services/dashboard.ts";
import { Card, Figure, Label } from "../primitives.tsx";
import { money } from "../format.ts";

export function PositionStrip({
  position,
  monthFlow,
}: {
  position: Dashboard["position"];
  monthFlow: Dashboard["monthFlow"];
}) {
  const itens = [
    {
      rotulo: "Saldo hoje",
      valor: money(position.currentBalanceCents),
      nota: "Dinheiro que existe agora nas contas de uso corrente",
      tom: "neutral" as const,
    },
    {
      rotulo: "Comprometido",
      valor: money(position.committedCents),
      nota: "Faturas em aberto e contas previstas do ciclo",
      tom: position.committedCents > 0 ? ("caution" as const) : ("neutral" as const),
    },
    {
      rotulo: "Patrimônio",
      valor: money(position.netWorthCents),
      nota: `Ativos ${money(position.totalAssetsCents)} − dívidas ${money(position.cardDebtCents)}`,
      tom: position.netWorthCents < 0 ? ("negative" as const) : ("neutral" as const),
    },
    {
      rotulo: "Resultado do mês",
      valor: money(monthFlow.netCents, { signed: true }),
      nota: `Entradas ${money(monthFlow.incomeCents)} · saídas ${money(monthFlow.expenseCents)}`,
      tom: monthFlow.netCents < 0 ? ("negative" as const) : ("positive" as const),
    },
  ];

  return (
    <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {itens.map((item) => (
        <Card key={item.rotulo} as="article" className="flex flex-col">
          <Label>{item.rotulo}</Label>
          <Figure value={item.valor} size="sm" tone={item.tom} className="mt-1.5" />
          <p className="mt-2 text-[0.75rem] leading-snug text-ink-subtle">{item.nota}</p>
        </Card>
      ))}
    </div>
  );
}
