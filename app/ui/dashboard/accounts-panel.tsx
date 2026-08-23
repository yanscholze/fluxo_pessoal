/**
 * Contas e seus saldos.
 *
 * O saldo mostrado é sempre o de hoje — dinheiro que existe. O que ainda vai
 * entrar aparece na projeção, nunca somado aqui.
 */

import type { Dashboard } from "../../../server/services/dashboard.ts";
import { Card, Empty, Row, SectionHeading } from "../primitives.tsx";
import { money } from "../format.ts";

const NOME_DO_TIPO: Record<string, string> = {
  checking: "Conta corrente",
  savings: "Poupança",
  cash: "Dinheiro",
  benefit: "Benefício",
  investment: "Investimento",
};

export function AccountsPanel({ accounts }: { accounts: Dashboard["accounts"] }) {
  const total = accounts
    .filter((account) => account.includeInTotals && account.currency === "BRL")
    .reduce((soma, account) => soma + account.balanceCents, 0);

  return (
    <Card>
      <SectionHeading title="Contas" hint={accounts.length ? `${money(total)} somados` : undefined} />
      {accounts.length ? (
        <ul>
          {accounts.map((account) => (
            <Row
              key={account.id}
              title={account.name}
              subtitle={NOME_DO_TIPO[account.kind] ?? account.institution}
              value={money(account.balanceCents, { currency: account.currency })}
              valueTone={account.balanceCents < 0 ? "negative" : "neutral"}
              meta={account.includeInTotals ? undefined : "fora dos totais"}
            />
          ))}
        </ul>
      ) : (
        <Empty title="Nenhuma conta cadastrada" hint="Cadastre suas contas para o Fluxo calcular seu saldo." />
      )}
    </Card>
  );
}
