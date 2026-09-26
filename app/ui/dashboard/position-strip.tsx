/**
 * A faixa que separa os quatro conceitos que nunca podem se misturar:
 * saldo atual, comprometido, patrimônio e o resultado do mês.
 *
 * Uma superfície dividida, e não quatro painéis soltos. Quatro caixas iguais
 * lado a lado dizem ao olho "quatro coisas separadas"; uma faixa dividida diz
 * "quatro ângulos da mesma posição" — que é o que eles são.
 */

import type { Dashboard } from "../../../server/services/dashboard.ts";
import { MetricStrip } from "../data-display.tsx";
import { money } from "../format.ts";
import { Landmark, PiggyBank, TrendingDown, TrendingUp } from "../icons.tsx";

export function PositionStrip({
  position,
  monthFlow,
  className,
}: {
  position: Dashboard["position"];
  monthFlow: Dashboard["monthFlow"];
  className?: string;
}) {
  return (
    <MetricStrip
      className={className}
      metrics={[
        {
          label: "Saldo Total",
          value: money(position.currentBalanceCents),
          tone: position.currentBalanceCents < 0 ? "negative" : "neutral",
          hint: "Dinheiro disponível nas contas",
          icon: Landmark,
        },
        {
          label: "Receitas",
          value: money(monthFlow.incomeCents),
          tone: "positive",
          hint: "Entradas confirmadas no mês",
          icon: TrendingUp,
        },
        {
          label: "Despesas",
          value: money(monthFlow.expenseCents),
          tone: "negative",
          hint: "Saídas confirmadas no mês",
          icon: TrendingDown,
        },
        {
          label: "Investimentos",
          value: money(position.investmentsCents),
          tone: "accent",
          hint: "Aplicações e reservas investidas",
          icon: PiggyBank,
        },
      ]}
    />
  );
}
