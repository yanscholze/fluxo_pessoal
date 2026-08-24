import { redirect } from "next/navigation";

import { listAccounts, listCards, listCategories } from "../../../server/repositories/catalog.ts";
import { findBatch, listBatches } from "../../../server/services/imports.ts";
import { currentUser } from "../../auth-context.ts";
import { Badge, Card, Empty, SectionHeading } from "../../ui/primitives.tsx";
import { competenceShort } from "../../ui/format.ts";
import { ReviewPanel } from "./review-panel.tsx";
import { UploadForm } from "./upload-form.tsx";

export const dynamic = "force-dynamic";

const ROTULO_STATUS: Record<string, { texto: string; tom: "positive" | "caution" | "neutral" }> = {
  review: { texto: "Em revisão", tom: "caution" },
  committed: { texto: "Confirmado", tom: "positive" },
  discarded: { texto: "Descartado", tom: "neutral" },
};

export default async function Importar({
  searchParams,
}: {
  searchParams: Promise<{ lote?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/entrar");

  const params = await searchParams;
  const [batches, accounts, cards, categories] = await Promise.all([
    listBatches(user.id),
    listAccounts(user.id),
    listCards(user.id),
    listCategories(user.id),
  ]);

  const emRevisao = params.lote ?? batches.find((batch) => batch.status === "review")?.id;
  const aberto = emRevisao ? await findBatch(user.id, emRevisao) : null;

  return (
    <main className="mx-auto w-full max-w-[76rem] px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-[1.625rem] font-semibold tracking-[-0.02em] text-ink">Importar</h1>
        <p className="mt-1 text-[0.875rem] text-ink-muted">
          Envie um extrato em OFX ou CSV. Nada vira lançamento antes de você revisar.
        </p>
      </header>

      {aberto && aberto.batch.status === "review" ? (
        <ReviewPanel
          batch={aberto.batch}
          items={aberto.items}
          categories={categories.map((category) => ({
            id: category.id,
            name: category.name,
            kind: category.kind,
          }))}
        />
      ) : (
        <UploadForm
          accounts={accounts.map((account) => ({ id: account.id, name: account.name }))}
          cards={cards
            .filter((card) => card.kind === "credit")
            .map((card) => ({ id: card.id, name: card.name }))}
        />
      )}

      <section className="mt-6">
        <Card>
          <SectionHeading title="Importações anteriores" />
          {batches.length ? (
            <ul>
              {batches.map((batch) => {
                const rotulo = ROTULO_STATUS[batch.status];
                return (
                  <li
                    key={batch.id}
                    className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-3 last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 truncate text-[0.875rem] text-ink">
                        {batch.filename}
                        <Badge tone={rotulo.tom}>{rotulo.texto}</Badge>
                        <Badge>{batch.format.toUpperCase()}</Badge>
                      </p>
                      <p className="truncate text-[0.75rem] text-ink-subtle">
                        {batch.targetName}
                        {batch.competence ? ` · fatura ${competenceShort(batch.competence)}` : ""} ·{" "}
                        {new Date(batch.createdAt).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <p className="shrink-0 text-[0.75rem] text-ink-subtle">
                      {batch.counts.found} encontradas · {batch.counts.fresh} novas ·{" "}
                      {batch.counts.duplicates} duplicadas · {batch.counts.discarded} descartadas
                    </p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty title="Nenhuma importação ainda" />
          )}
        </Card>
      </section>
    </main>
  );
}
