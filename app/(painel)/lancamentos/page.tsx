import { redirect } from "next/navigation";

import { parseCompetence, shift } from "../../../core/time/competence.ts";
import { buildStatement } from "../../../server/services/statement.ts";
import { currentUser } from "../../auth-context.ts";
import { MetricStrip } from "../../ui/data-display.tsx";
import { competenceLong, money } from "../../ui/format.ts";
import { ArrowDownRight, ArrowUpRight, Receipt, Scale } from "../../ui/icons.tsx";
import { Page, PageHeader, Stack } from "../../ui/page-frame.tsx";
import { Composer } from "./composer.tsx";
import { CompetenceNav } from "./competence-nav.tsx";
import { StatementList } from "./statement-list.tsx";

export const dynamic = "force-dynamic";

/**
 * Extrato da competência.
 *
 * A pergunta é "o que entrou e saiu neste mês, e no que deu". Os três números
 * do topo respondem o "no que deu"; a tabela responde o "o quê". Navegar entre
 * competências fica junto do título porque o mês é o recorte de tudo o que
 * está abaixo — não é um filtro secundário.
 */
export default async function Lancamentos({
  searchParams,
}: {
  searchParams: Promise<{ competencia?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/entrar");

  const params = await searchParams;
  const statement = await buildStatement(user.id, {
    competence: parseCompetence(params.competencia) ?? undefined,
  });

  const saldo = statement.incomeCents - statement.expenseCents;

  return (
    <Page>
      <PageHeader
        eyebrow={competenceLong(statement.competence)}
        title="Lançamentos"
        description="Tudo que entrou e saiu na competência, incluindo o que está previsto."
        actions={
          <>
            <CompetenceNav
              anterior={shift(statement.competence, -1)}
              proxima={shift(statement.competence, 1)}
            />
            <Composer options={statement.options} competence={statement.competence} />
          </>
        }
      />

      <Stack gap="lg">
        <MetricStrip
          metrics={[
            {
              label: "Entradas",
              value: money(statement.incomeCents),
              tone: "positive",
              icon: ArrowUpRight,
              hint: "Receitas confirmadas e previstas do mês",
            },
            {
              label: "Saídas",
              value: money(statement.expenseCents),
              icon: ArrowDownRight,
              hint: "Despesas do mês, sem contar transferências",
            },
            {
              label: "Resultado",
              value: money(saldo, { signed: true }),
              tone: saldo < 0 ? "negative" : "positive",
              icon: Scale,
              hint: saldo < 0 ? "Saiu mais do que entrou nesta competência" : "Sobrou depois de tudo",
            },
            {
              label: "Lançamentos",
              value: String(statement.rows.length),
              icon: Receipt,
              hint: "Registros na competência",
            },
          ]}
        />

        <StatementList rows={statement.rows} />
      </Stack>
    </Page>
  );
}
