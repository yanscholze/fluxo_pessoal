import { redirect } from "next/navigation";

import { buildCapturesView } from "../../../server/services/captures.ts";
import { currentUser } from "../../auth-context.ts";
import { Badge, Card, Empty, SectionHeading } from "../../ui/primitives.tsx";
import { dateShort, money } from "../../ui/format.ts";
import { CaptureQueue } from "./capture-queue.tsx";
import { SourceRules } from "./source-rules.tsx";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { texto: string; tom: "positive" | "neutral" | "negative" }> = {
  confirmado: { texto: "Confirmado", tom: "positive" },
  ignorado: { texto: "Ignorado", tom: "neutral" },
  duplicado: { texto: "Duplicado", tom: "negative" },
};

export default async function Automaticos() {
  const user = await currentUser();
  if (!user) redirect("/entrar");

  const view = await buildCapturesView(user.id);

  return (
    <main className="mx-auto w-full max-w-[76rem] px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-[1.625rem] font-semibold tracking-[-0.02em] text-ink">Automáticos</h1>
        <p className="mt-1 text-[0.875rem] text-ink-muted">
          O aplicativo lê as notificações do banco e sugere lançamentos. Nada entra na sua conta sem você
          confirmar.
        </p>
      </header>

      <Card>
        <SectionHeading
          title="Aguardando revisão"
          hint={
            view.pending.length
              ? `${view.pending.length} ${view.pending.length === 1 ? "sugestão" : "sugestões"}`
              : undefined
          }
        />
        {view.pending.length ? (
          <CaptureQueue items={view.pending} options={view.options} />
        ) : (
          <Empty
            title="Nenhuma sugestão pendente"
            hint="Conecte o aplicativo Android e permita a leitura de notificações para as compras aparecerem aqui."
          />
        )}
      </Card>

      <Card className="mt-5">
        <SectionHeading
          title="Apps"
          hint="Bancos conhecidos já são lidos; qualquer outro só entra se você permitir"
        />
        <SourceRules sources={view.sources} options={view.options} />
      </Card>

      {view.recent.length ? (
        <Card className="mt-5">
          <SectionHeading title="Já resolvidas" />
          <ul>
            {view.recent.map((item) => {
              const rotulo = STATUS[item.status];
              return (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate text-[0.875rem] text-ink">
                      {item.description}
                      <Badge tone={rotulo.tom}>{rotulo.texto}</Badge>
                    </p>
                    <p className="truncate text-[0.75rem] text-ink-subtle">
                      {dateShort(item.occurredOn)} · {item.sourceLabel ?? item.sourceApp}
                    </p>
                  </div>
                  <p
                    className={`tabular shrink-0 text-[0.875rem] ${
                      item.kind === "income" ? "text-positive" : "text-ink"
                    }`}
                  >
                    {item.kind === "income" ? "+" : "−"} {money(item.amountCents)}
                  </p>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}
    </main>
  );
}
