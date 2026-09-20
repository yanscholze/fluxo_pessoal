import { parseCompetence, shift } from "../../../core/time/competence.ts";
import { buildStatement } from "../../../server/services/statement.ts";
import { currentUser } from "../../auth-context.ts";
import { Donut, MetricTile, PanelHeading } from "../../ui/mesa.tsx";
import { competenceLong, money } from "../../ui/format.ts";
import { ArrowDownRight, ArrowUpRight, ReceiptText } from "../../ui/icons.tsx";
import { Composer } from "./composer.tsx";
import { CompetenceNav } from "./competence-nav.tsx";
import { StatementList } from "./statement-list.tsx";

export const dynamic = "force-dynamic";

/**
 * Extrato da competência, no desenho do Mesa.
 *
 * Três indicadores em cima, a rosca de categorias à esquerda e a lista à
 * direita. O recorte é sempre um mês — por isso a navegação entre competências
 * fica no cabeçalho da lista, ao lado do filtro: ela não é um filtro
 * secundário, é o que define tudo que está abaixo.
 *
 * Os números vêm de `buildStatement`, inclusive o agrupamento por categoria e
 * a maior saída. A tela não soma centavo nenhum.
 */
export default async function Lancamentos({
  searchParams,
}: {
  searchParams: Promise<{ competencia?: string; novo?: string; cartao?: string }>;
}) {
  const user = await currentUser();
  // O desvio de quem não tem sessão acontece em `proxy.ts`, como resposta
  // HTTP, e o layout mostra o aviso. Lançar aqui viraria exceção na
  // renderização — que o Vite transmite como erro para todas as abas.
  if (!user) return null;

  const params = await searchParams;
  const cardId = params.cartao?.trim() || undefined;
  const statement = await buildStatement(user.id, {
    competence: parseCompetence(params.competencia) ?? undefined,
    cardId,
  });
  const selectedCard = cardId ? statement.options.cards.find((card) => card.id === cardId) : undefined;

  const maiorCategoria = statement.categorySpend[0];
  const fatia = maiorCategoria ? Math.round(maiorCategoria.percent) : 0;

  return (
    <div className="content-area">
      <div className="grid gap-5 xl:grid-cols-12">
        <div className="xl:col-span-4">
          <MetricTile
            tom="negative"
            icone={<ArrowDownRight className="size-4" aria-hidden />}
            rotulo="Saídas do mês"
            valor={money(statement.expenseCents)}
            apoio={
              maiorCategoria
                ? `${maiorCategoria.name} é a maior categoria`
                : "Nenhuma saída nesta competência"
            }
          />
        </div>
        <div className="xl:col-span-4">
          <MetricTile
            tom="positive"
            icone={<ArrowUpRight className="size-4" aria-hidden />}
            rotulo="Entradas do mês"
            valor={money(statement.incomeCents)}
            apoio={
              statement.incomeCount === 1
                ? "1 recebimento"
                : `${statement.incomeCount} recebimentos`
            }
          />
        </div>
        <div className="xl:col-span-4">
          <MetricTile
            tom="caution"
            icone={<ReceiptText className="size-4" aria-hidden />}
            rotulo="Maior saída"
            valor={statement.largestExpense ? money(statement.largestExpense.amountCents) : "—"}
            apoio={
              statement.largestExpense
                ? [statement.largestExpense.description, statement.largestExpense.categoryName]
                    .filter(Boolean)
                    .join(" · ")
                : "Sem saídas registradas"
            }
          />
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* A rosca: quanto a maior categoria ocupa do mês.                   */}
        {/* ---------------------------------------------------------------- */}
        <section className="glass-panel p-6 xl:col-span-5">
          <PanelHeading
            titulo="Saídas por categoria"
            apoio={`Distribuição de ${competenceLong(statement.competence).toLowerCase()}`}
          />
          {statement.categorySpend.length ? (
            <>
              <Donut percent={fatia} />
              <div className="mt-6 space-y-3">
                {statement.categorySpend.slice(0, 5).map((categoria) => (
                  <div key={categoria.name} className="flex justify-between text-caption">
                    <span className="min-w-0 truncate text-ink">{categoria.name}</span>
                    <span className="tabular shrink-0 text-ink-subtle">
                      {money(categoria.amountCents)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-body-sm text-ink-subtle">
              Nenhuma saída nesta competência para distribuir.
            </p>
          )}
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* A lista, com a navegação de mês e o filtro no cabeçalho.          */}
        {/* ---------------------------------------------------------------- */}
        <section className="glass-panel p-6 xl:col-span-7">
          <PanelHeading
            titulo={selectedCard ? `Lançamentos · ${selectedCard.name}` : "Todos os lançamentos"}
            apoio={
              selectedCard
                ? "Compras, estornos e pagamentos ligados somente a esta fatura"
                : "Tudo que entrou e saiu na competência, incluindo o previsto"
            }
            acao={
              <div className="flex shrink-0 items-center gap-2">
                <CompetenceNav
                  anterior={shift(statement.competence, -1)}
                  proxima={shift(statement.competence, 1)}
                  cardId={selectedCard?.id}
                />
                <Composer
                  options={statement.options}
                  competence={statement.competence}
                  defaultOpen={params.novo === "1"}
                />
              </div>
            }
          />
          <StatementList rows={statement.rows} options={statement.options} />
        </section>
      </div>
    </div>
  );
}
