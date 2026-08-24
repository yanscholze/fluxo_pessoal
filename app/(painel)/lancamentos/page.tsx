import { redirect } from "next/navigation";

import { parseCompetence, shift } from "../../../core/time/competence.ts";
import { buildStatement } from "../../../server/services/statement.ts";
import { currentUser } from "../../auth-context.ts";
import { Card, Figure, Label } from "../../ui/primitives.tsx";
import { competenceLong, money } from "../../ui/format.ts";
import { Composer } from "./composer.tsx";
import { CompetenceNav } from "./competence-nav.tsx";
import { StatementList } from "./statement-list.tsx";

export const dynamic = "force-dynamic";

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
    <main className="mx-auto w-full max-w-[76rem] px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-label uppercase text-ink-subtle">{competenceLong(statement.competence)}</p>
          <h1 className="mt-1 text-[1.625rem] font-semibold tracking-[-0.02em] text-ink">Lançamentos</h1>
        </div>

        <div className="flex items-center gap-3">
          <CompetenceNav
            anterior={shift(statement.competence, -1)}
            proxima={shift(statement.competence, 1)}
          />
          <Composer options={statement.options} competence={statement.competence} />
        </div>
      </header>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card as="article">
          <Label>Entradas</Label>
          <Figure value={money(statement.incomeCents)} size="sm" tone="positive" className="mt-1.5" />
        </Card>
        <Card as="article">
          <Label>Saídas</Label>
          <Figure value={money(statement.expenseCents)} size="sm" className="mt-1.5" />
        </Card>
        <Card as="article">
          <Label>Resultado</Label>
          <Figure
            value={money(saldo, { signed: true })}
            size="sm"
            tone={saldo < 0 ? "negative" : "positive"}
            className="mt-1.5"
          />
        </Card>
      </div>

      <StatementList rows={statement.rows} />
    </main>
  );
}
