import { redirect } from "next/navigation";

import { listAccounts, listCards, listCategories } from "../../../server/repositories/catalog.ts";
import { findBatch, listBatches } from "../../../server/services/imports.ts";
import { currentUser } from "../../auth-context.ts";
import { DataTable, Td, Tr } from "../../ui/data-display.tsx";
import { competenceShort } from "../../ui/format.ts";
import { ShieldCheck, Upload } from "../../ui/icons.tsx";
import { Page, PageHeader, Stack } from "../../ui/page-frame.tsx";
import { Badge, Empty, Notice, Panel, PanelHeader, type Tone } from "../../ui/primitives.tsx";
import { ReviewPanel } from "./review-panel.tsx";
import { UploadForm } from "./upload-form.tsx";

export const dynamic = "force-dynamic";

const SITUACAO: Record<string, { texto: string; tom: Tone }> = {
  review: { texto: "Em revisão", tom: "caution" },
  committed: { texto: "Confirmado", tom: "positive" },
  discarded: { texto: "Descartado", tom: "neutral" },
};

const ETAPAS = ["Escolher arquivo", "Analisar", "Revisar", "Confirmar"] as const;

/**
 * Importação.
 *
 * As quatro etapas ficam visíveis o tempo todo, com a atual destacada. Quem
 * está prestes a jogar um extrato inteiro dentro do próprio controle
 * financeiro precisa ver, antes de enviar, que existe uma etapa de revisão
 * entre o arquivo e o lançamento.
 */
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
  const revisando = Boolean(aberto && aberto.batch.status === "review");
  const etapaAtual = revisando ? 2 : 0;

  return (
    <Page>
      <PageHeader
        title="Importações"
        description="Envie um extrato em OFX ou CSV. Nada vira lançamento antes de você revisar."
      />

      <Stack gap="lg">
        <ol className="grid gap-px overflow-hidden rounded-panel border border-line bg-line sm:grid-cols-4">
          {ETAPAS.map((etapa, indice) => {
            const concluida = indice < etapaAtual;
            const atual = indice === etapaAtual;
            return (
              <li
                key={etapa}
                aria-current={atual ? "step" : undefined}
                className={`flex items-center gap-2.5 p-3.5 ${atual ? "bg-accent-wash" : "bg-surface"}`}
              >
                <span
                  className={`tabular flex size-6 shrink-0 items-center justify-center rounded-full text-caption font-semibold ${
                    concluida
                      ? "bg-positive-wash text-positive"
                      : atual
                        ? "bg-accent text-accent-ink"
                        : "bg-surface-inset text-ink-subtle"
                  }`}
                >
                  {indice + 1}
                </span>
                <span
                  className={`text-body-sm ${atual ? "font-medium text-ink" : concluida ? "text-ink-muted" : "text-ink-subtle"}`}
                >
                  {etapa}
                </span>
              </li>
            );
          })}
        </ol>

        {!revisando ? (
          <Notice tone="info" icon={ShieldCheck}>
            O arquivo é lido no seu navegador e vira uma fila de revisão. Nenhum lançamento é gravado antes de
            você conferir linha a linha.
          </Notice>
        ) : null}

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

        <Panel>
          <PanelHeader
            title="Importações anteriores"
            icon={Upload}
            hint={batches.length ? `${batches.length} no histórico` : undefined}
          />
          {batches.length ? (
            <DataTable
              caption="Histórico de importações"
              columns={[
                { key: "arquivo", header: "Arquivo" },
                { key: "destino", header: "Destino", hideBelow: "md" },
                { key: "situacao", header: "Situação", hideBelow: "sm" },
                { key: "resultado", header: "Resultado", align: "right" },
              ]}
            >
              {batches.map((batch) => {
                const situacao = SITUACAO[batch.status] ?? SITUACAO.discarded;
                return (
                  <Tr key={batch.id}>
                    <Td>
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-body">{batch.filename}</span>
                        <Badge>{batch.format.toUpperCase()}</Badge>
                      </span>
                      <span className="mt-0.5 block text-caption text-ink-subtle">
                        {new Date(batch.createdAt).toLocaleDateString("pt-BR")}
                      </span>
                    </Td>
                    <Td hideBelow="md" className="truncate text-body-sm text-ink-muted">
                      {batch.targetName}
                      {batch.competence ? ` · fatura ${competenceShort(batch.competence)}` : ""}
                    </Td>
                    <Td hideBelow="sm">
                      <Badge tone={situacao.tom}>{situacao.texto}</Badge>
                    </Td>
                    <Td align="right" className="whitespace-nowrap text-caption text-ink-subtle">
                      <span className="tabular text-ink">{batch.counts.found}</span> encontradas ·{" "}
                      <span className="tabular text-positive">{batch.counts.fresh}</span> novas ·{" "}
                      <span className="tabular">{batch.counts.duplicates}</span> duplicadas
                    </Td>
                  </Tr>
                );
              })}
            </DataTable>
          ) : (
            <Empty icon={Upload} title="Nenhuma importação ainda" compact />
          )}
        </Panel>
      </Stack>
    </Page>
  );
}
