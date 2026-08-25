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
import { Coins, Landmark, PiggyBank, TrendingUp } from "../icons.tsx";

export function PositionStrip({
  position,
  monthFlow,
}: {
  position: Dashboard["position"];
  monthFlow: Dashboard["monthFlow"];
}) {
  return (
    <MetricStrip
      metrics={[
        {
          label: "Saldo hoje",
          value: money(position.currentBalanceCents),
          tone: position.currentBalanceCents < 0 ? "negative" : "neutral",
          hint: "Dinheiro que existe agora nas contas de uso corrente",
          icon: Landmark,
        },
        {
          label: "Comprometido",
          value: money(position.committedCents),
          tone: position.committedCents > 0 ? "caution" : "neutral",
          hint: "Faturas em aberto e contas previstas do ciclo",
          icon: Coins,
        },
        {
          label: "Patrimônio",
          value: money(position.netWorthCents),
          tone: position.netWorthCents < 0 ? "negative" : "neutral",
          hint: `Ativos ${money(position.totalAssetsCents)} − dívidas ${money(position.cardDebtCents)}`,
          icon: PiggyBank,
        },
        {
          label: "Resultado do mês",
          value: money(monthFlow.netCents, { signed: true }),
          tone: monthFlow.netCents < 0 ? "negative" : "positive",
          hint: `Entradas ${money(monthFlow.incomeCents)} · saídas ${money(monthFlow.expenseCents)}`,
          icon: TrendingUp,
        },
      ]}
    />
  );
}
