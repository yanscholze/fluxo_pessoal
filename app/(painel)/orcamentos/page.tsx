/**
 * Orçamentos.
 *
 * A tela responde uma pergunta só: **quanto ainda posso gastar**. Por isso o
 * total disponível abre sozinho, em tamanho que não deixa dúvida, e o resto
 * recua para o papel de contexto — a projeção, que avisa antes de estourar, e a
 * lista por categoria, que diz onde a folga está acabando.
 *
 * A lista é tabela e não cartão: aqui o usuário compara linhas ("qual está mais
 * perto do teto?"), e coluna alinhada é o que torna essa varredura possível.
 * Categorias sem teto ficam depois, sem moldura — são um resto, não uma seção
 * de mesmo peso.
 */

import { competenceOf, next, parseCompetence, previous } from "../../../core/time/competence.ts";
import { listCategories } from "../../../server/repositories/catalog.ts";
import { type BudgetView, buildBudgetsView } from "../../../server/services/budgets.ts";
import { currentUser } from "../../auth-context.ts";
import { LinkButton } from "../../ui/controls.tsx";
import { DataTable, ListRow, Td, Tr } from "../../ui/data-display.tsx";
import { competenceLong, competenceShort, money, percent } from "../../ui/format.ts";
import { ChevronLeft, ChevronRight, CircleAlert, CircleCheck, Gauge, Target } from "../../ui/icons.tsx";
import { Page, PageHeader, SectionTitle, Stack, Toolbar } from "../../ui/page-frame.tsx";
import { Badge, Figure, Label, Meter, Panel, type Tone, join } from "../../ui/primitives.tsx";
import { Empty } from "../../ui/primitives.tsx";
import { BudgetForm } from "./budget-form.tsx";

export const dynamic = "force-dynamic";

/** Saudável, atenção, excedido. Veste o medidor — nunca o valor. */
function tomDoUso(item: { spent: number; amount: number; willExceed: boolean }): Tone {
  if (item.spent > item.amount) return "negative";
  if (item.willExceed) return "caution";
  return "accent";
}

export default async function Orcamentos({
  searchParams,
}: {
  searchParams: Promise<{ competencia?: string }>;
}) {
  const user = await currentUser();
  // O desvio de quem não tem sessão acontece em `proxy.ts`, como resposta
  // HTTP, e o layout mostra o aviso. Lançar aqui viraria exceção na
  // renderização — que o Vite transmite como erro para todas as abas.
  if (!user) return null;

  const params = await searchParams;
  const [view, categories] = await Promise.all([
    buildBudgetsView(user.id, parseCompetence(params.competencia) ?? undefined),
    listCategories(user.id),
  ]);

  const { totals } = view;
  const temOrcamento = view.budgets.length > 0;

  // Soma das projeções que o domínio já calculou por categoria. Não é regra
  // nova: é o mesmo número por linha, somado para virar a frase do topo.
  const projecao = view.budgets.reduce((soma, item) => soma + item.projected, 0);
  const excedente = projecao - totals.amount;

  // Todas as linhas compartilham o mesmo recorte de dias da competência, então
  // qualquer uma serve para dizer em que ponto do mês estamos.
  const diaAtual = view.budgets[0]?.daysElapsed ?? 0;
  const diasDoMes = view.budgets[0]?.daysInMonth ?? 0;

  const anterior = previous(view.competence);
  const proxima = next(view.competence);
  const competenciaDeHoje = competenceOf(view.today);

  const semFolga = totals.available === 0;

  return (
    <Page>
      <PageHeader
        eyebrow={competenceLong(view.competence)}
        title="Orçamentos"
        description="Um teto por categoria, e o aviso antes de passar dele."
        actions={
          <BudgetForm
            categories={categories
              .filter((category) => category.kind === "expense")
              .map((category) => ({ id: category.id, name: category.name }))}
          />
        }
      >
        <Toolbar>
          <LinkButton href={`/orcamentos?competencia=${anterior}`} size="sm" icon={ChevronLeft} rel="prev">
            {competenceShort(anterior)}
          </LinkButton>
          <LinkButton href={`/orcamentos?competencia=${proxima}`} size="sm" rel="next">
            {competenceShort(proxima)}
            <ChevronRight size={15} strokeWidth={1.5} aria-hidden />
          </LinkButton>
          {view.competence === competenciaDeHoje ? null : (
            <LinkButton href="/orcamentos" size="sm" variant="ghost">
              Voltar para {competenceShort(competenciaDeHoje)}
            </LinkButton>
          )}
        </Toolbar>
      </PageHeader>

      <Stack gap="lg">
        {temOrcamento ? (
          <Panel padding="lg">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between lg:gap-10">
              <div className="min-w-0 flex-1">
                <Label>Ainda dá para gastar</Label>
                <Figure
                  value={money(totals.available)}
                  size="xl"
                  tone={semFolga ? "negative" : "neutral"}
                  className="mt-2"
                />

                <p className="mt-3 flex max-w-md items-start gap-2 text-body-sm text-ink-muted">
                  {semFolga ? (
                    <CircleAlert
                      size={15}
                      strokeWidth={1.5}
                      className="mt-0.5 shrink-0 text-negative"
                      aria-hidden
                    />
                  ) : (
                    <Gauge size={15} strokeWidth={1.5} className="mt-0.5 shrink-0 text-accent" aria-hidden />
                  )}
                  <span>
                    {semFolga
                      ? "Os tetos desta competência já foram consumidos. Gasto novo nessas categorias passa do combinado."
                      : "É o que sobra dos tetos desta competência depois de tudo que já foi gasto."}
                  </span>
                </p>

                <div className="mt-5 max-w-md">
                  <div className="mb-1.5 flex items-baseline justify-between gap-3 text-caption text-ink-subtle">
                    <span className="tabular">
                      {money(totals.spent)} de {money(totals.amount)}
                    </span>
                    <span className="tabular">{percent(totals.percentUsed)} do total</span>
                  </div>
                  <Meter
                    value={totals.spent}
                    total={totals.amount}
                    tone={tomDoUso({ spent: totals.spent, amount: totals.amount, willExceed: projecao > totals.amount })}
                    size="sm"
                    label="Uso do orçamento total"
                  />
                  {diasDoMes > 0 ? (
                    <p className="mt-2 text-caption text-ink-subtle">
                      <span className="tabular">
                        Dia {diaAtual} de {diasDoMes}
                      </span>{" "}
                      da competência
                    </p>
                  ) : null}
                </div>
              </div>

              {/* Projeção fica numa superfície própria: é previsão, e previsão
                  não pode dividir o mesmo peso visual do que já aconteceu. */}
              <div className="w-full shrink-0 rounded-md border border-line bg-surface-sunken p-4 lg:w-72">
                <Label className="mb-2">No ritmo atual, o mês fecha em</Label>
                <p
                  className={join(
                    "tabular text-figure-sm",
                    excedente > 0 ? "text-caution" : "text-ink",
                  )}
                >
                  {money(projecao)}
                </p>
                <p className="mt-1 text-caption text-ink-subtle">
                  {excedente > 0 ? (
                    <>
                      <span className="tabular text-caution">{money(excedente)}</span> acima do total orçado
                    </>
                  ) : (
                    <>
                      <span className="tabular text-ink">{money(Math.abs(excedente))}</span> abaixo do total
                      orçado
                    </>
                  )}
                </p>

                <dl className="mt-4 space-y-2 border-t border-line pt-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-body-sm text-ink-muted">Estourados</dt>
                    <dd
                      className={join(
                        "tabular text-body-sm font-medium",
                        totals.exceededCount > 0 ? "text-negative" : "text-ink-subtle",
                      )}
                    >
                      {totals.exceededCount}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-body-sm text-ink-muted">Em risco</dt>
                    <dd
                      className={join(
                        "tabular text-body-sm font-medium",
                        totals.atRiskCount > 0 ? "text-caution" : "text-ink-subtle",
                      )}
                    >
                      {totals.atRiskCount}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </Panel>
        ) : (
          <Empty
            icon={Target}
            title="Nenhum orçamento definido"
            hint="Defina um teto por categoria para o Fluxo avisar antes de estourar, não depois."
          />
        )}

        {temOrcamento ? (
          <section>
            <SectionTitle
              title="Por categoria"
              hint="Quem está mais perto de estourar aparece primeiro"
              action={
                totals.exceededCount > 0 || totals.atRiskCount > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {totals.exceededCount > 0 ? (
                      <Badge tone="negative" icon={CircleAlert}>
                        {totals.exceededCount} estourado{totals.exceededCount > 1 ? "s" : ""}
                      </Badge>
                    ) : null}
                    {totals.atRiskCount > 0 ? (
                      <Badge tone="caution">
                        {totals.atRiskCount} em risco
                      </Badge>
                    ) : null}
                  </div>
                ) : (
                  <Badge tone="positive" icon={CircleCheck}>
                    tudo dentro do teto
                  </Badge>
                )
              }
            />

            <DataTable
              caption="Orçamentos da competência, por categoria"
              columns={[
                { key: "categoria", header: "Categoria" },
                { key: "uso", header: "Uso", width: "20%", hideBelow: "md" },
                { key: "gasto", header: "Gasto", align: "right", hideBelow: "sm" },
                { key: "teto", header: "Teto", align: "right", hideBelow: "sm" },
                { key: "ritmo", header: "No ritmo", align: "right", hideBelow: "lg" },
                { key: "disponivel", header: "Disponível", align: "right" },
              ]}
            >
              {view.budgets.map((item) => (
                <LinhaDeOrcamento key={item.budgetId} item={item} />
              ))}
            </DataTable>
          </section>
        ) : null}

        {view.uncovered.length ? (
          <section>
            <SectionTitle
              title="Categorias sem orçamento"
              hint="Já tiveram gasto nesta competência e não têm teto definido"
            />
            <ul>
              {view.uncovered.map((item) => (
                <ListRow
                  key={item.categoryId}
                  title={item.name}
                  accentColor={item.color}
                  value={money(item.spentCents)}
                  meta="gasto no mês"
                />
              ))}
            </ul>
          </section>
        ) : null}
      </Stack>
    </Page>
  );
}

function LinhaDeOrcamento({ item }: { item: BudgetView }) {
  const estourou = item.spent > item.amount;
  const tom = tomDoUso(item);
  const excedente = item.spent - item.amount;

  const medidor = (
    <Meter value={item.spent} total={item.amount} tone={tom} size="sm" label={`Uso de ${item.categoryName}`} />
  );

  return (
    <Tr>
      <Td>
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            className="mt-1.5 size-2 shrink-0 rounded-full"
            style={{ backgroundColor: item.categoryColor }}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate text-body text-ink">{item.categoryName}</span>
              {estourou ? <Badge tone="negative">estourou</Badge> : null}
              {!estourou && item.willExceed ? <Badge tone="caution">em risco</Badge> : null}
            </div>

            {/* Abaixo de `md` as colunas de contexto somem; o medidor e a conta
                voltam aqui, para a linha não ficar só com um nome e um valor. */}
            <div className="mt-2 md:hidden">
              {medidor}
              <p className="tabular mt-1 text-caption text-ink-subtle">
                {money(item.spent)} de {money(item.amount)} · {percent(item.percentUsed)}
              </p>
            </div>
          </div>
        </div>
      </Td>

      <Td hideBelow="md">
        {medidor}
        <p className="tabular mt-1.5 text-caption text-ink-subtle">{percent(item.percentUsed)} do teto</p>
      </Td>

      <Td align="right" hideBelow="sm" className="tabular whitespace-nowrap">
        {money(item.spent)}
      </Td>

      <Td align="right" hideBelow="sm" className="tabular whitespace-nowrap text-ink-muted">
        {money(item.amount)}
      </Td>

      {/* Projeção é previsão: fica recuada até virar problema. */}
      <Td align="right" hideBelow="lg">
        <span
          className={join(
            "tabular whitespace-nowrap text-body-sm",
            estourou ? "text-negative" : item.willExceed ? "text-caution" : "text-ink-muted",
          )}
        >
          {money(item.projected)}
        </span>
      </Td>

      <Td align="right">
        <span
          className={join(
            "tabular block whitespace-nowrap text-body font-medium",
            estourou ? "text-negative" : "text-ink",
          )}
        >
          {money(item.available)}
        </span>
        {estourou ? (
          <span className="tabular mt-0.5 block whitespace-nowrap text-caption text-negative">
            {money(excedente)} acima
          </span>
        ) : null}
      </Td>
    </Tr>
  );
}
