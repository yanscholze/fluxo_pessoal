/**
 * Agenda dos próximos 30 dias.
 *
 * Responde "o que vem por aí" sem obrigar o usuário a abrir o extrato e
 * comparar datas de cabeça. A régua vertical faz a distância entre dois
 * eventos ser lida como tempo.
 */

import type { Dashboard } from "../../../server/services/dashboard.ts";
import { Timeline, type TimelineItem } from "../data-display.tsx";
import { dateShort, money, relativeDay } from "../format.ts";
import { ArrowDownRight, ArrowUpRight, Calendar } from "../icons.tsx";
import { Empty, Panel, PanelHeader } from "../primitives.tsx";

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

  const eventos: TimelineItem[] = items.map((item) => {
    const entrada = item.kind === "income";
    return {
      id: `${item.transactionId}-${item.dueOn}`,
      when: `${dateShort(item.dueOn)} · ${relativeDay(item.dueOn, today)}`,
      title: item.description,
      value: money(item.amountCents),
      valueTone: entrada ? "positive" : "neutral",
      tone: entrada ? "positive" : "negative",
      icon: entrada ? ArrowUpRight : ArrowDownRight,
      isNow: item.dueOn === today,
    };
  });

  return (
    <Panel>
      <PanelHeader
        title="Próximos 30 dias"
        icon={Calendar}
        hint={
          items.length
            ? [aSair > 0 ? `${money(aSair)} a sair` : null, aEntrar > 0 ? `${money(aEntrar)} a entrar` : null]
                .filter(Boolean)
                .join(" · ")
            : undefined
        }
      />
      {eventos.length ? (
        <Timeline items={eventos} />
      ) : (
        <Empty
          icon={Calendar}
          title="Nada previsto para os próximos dias"
          hint="Cadastre recorrências para o Fluxo projetar salário, contas fixas e assinaturas."
          compact
        />
      )}
    </Panel>
  );
}
