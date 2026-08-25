/**
 * Contas e seus saldos.
 *
 * O saldo mostrado é sempre o de hoje — dinheiro que existe. O que ainda vai
 * entrar aparece na projeção, nunca somado aqui.
 */

import type { Dashboard } from "../../../server/services/dashboard.ts";
import { ListRow } from "../data-display.tsx";
import { money } from "../format.ts";
import { Banknote, Landmark, type LucideIcon, PiggyBank, TrendingUp, Wallet } from "../icons.tsx";
import { Badge, Empty, Panel, PanelHeader } from "../primitives.tsx";

const TIPO: Record<string, { label: string; icon: LucideIcon }> = {
  checking: { label: "Conta corrente", icon: Landmark },
  savings: { label: "Poupança", icon: PiggyBank },
  cash: { label: "Dinheiro", icon: Banknote },
  benefit: { label: "Benefício", icon: Wallet },
  investment: { label: "Investimento", icon: TrendingUp },
};

export function AccountsPanel({ accounts }: { accounts: Dashboard["accounts"] }) {
  const total = accounts
    .filter((account) => account.includeInTotals && account.currency === "BRL")
    .reduce((soma, account) => soma + account.balanceCents, 0);

  return (
    <Panel>
      <PanelHeader
        title="Contas"
        icon={Landmark}
        hint={accounts.length ? `${money(total)} somados` : undefined}
        action={
          <a href="/contas" className="text-body-sm font-medium text-accent hover:underline">
            Gerenciar
          </a>
        }
      />

      {accounts.length ? (
        <ul>
          {accounts.map((account) => {
            const tipo = TIPO[account.kind];
            return (
              <ListRow
                key={account.id}
                icon={tipo?.icon ?? Landmark}
                title={account.name}
                subtitle={tipo?.label ?? account.institution}
                value={money(account.balanceCents, { currency: account.currency })}
                valueTone={account.balanceCents < 0 ? "negative" : "neutral"}
                badge={account.includeInTotals ? undefined : <Badge tone="neutral">fora dos totais</Badge>}
              />
            );
          })}
        </ul>
      ) : (
        <Empty
          icon={Landmark}
          title="Nenhuma conta cadastrada"
          hint="Cadastre suas contas para o Fluxo calcular seu saldo."
          compact
        />
      )}
    </Panel>
  );
}
