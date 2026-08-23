/**
 * Agenda dos próximos 30 dias.
 *
 * Responde "o que vem por aí" sem obrigar o usuário a abrir o extrato e
 * comparar datas de cabeça.
 */

import type { Dashboard } from "../../../server/services/dashboard.ts";
import { Card, Empty, Row, SectionHeading } from "../primitives.tsx";
import { dateShort, money, relativeDay } from "../format.ts";

export function UpcomingPanel({
  items,
  today,
}: {
  items: Dashboard["upcoming"];
  today: Dashboard["today"];
}) {
  // Entradas e saídas somadas separadamente: um líquido só esconde os dois
  // números que interessam, e um líquido negativo virava "R$ 0,00 a sair".
  const aSair = items
    .filter((item) => item.kind === "expense")
    .reduce((soma, item) => soma + item.amountCents, 0);
  const aEntrar = items
    .filter((item) => item.kind === "income")
    .reduce((soma, item) => soma + item.amountCents, 0);

  return (
    <Card>
      <SectionHeading
        title="Próximos 30 dias"
        hint={
          items.length
            ? [aSair > 0 ? `${money(aSair)} a sair` : null, aEntrar > 0 ? `${money(aEntrar)} a entrar` : null]
                .filter(Boolean)
                .join(" · ")
            : undefined
        }
      />
      {items.length ? (
        <ul>
          {items.map((item) => (
            <Row
              key={`${item.transactionId}-${item.dueOn}`}
              title={item.description}
              subtitle={`${dateShort(item.dueOn)} · ${relativeDay(item.dueOn, today)}`}
              value={money(item.amountCents)}
              valueTone={item.kind === "income" ? "positive" : "neutral"}
            />
          ))}
        </ul>
      ) : (
        <Empty
          title="Nada previsto para os próximos dias"
          hint="Cadastre recorrências para o Fluxo projetar salário, contas fixas e assinaturas."
        />
      )}
    </Card>
  );
}
