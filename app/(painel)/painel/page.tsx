import { buildDashboard } from "../../../server/services/dashboard.ts";
import { currentUser } from "../../auth-context.ts";
import { ArrowDownRight, ArrowRight, ArrowUpRight, CalendarClock } from "../../ui/icons.tsx";
import { money } from "../../ui/format.ts";
import { MetricTile, PanelHeading, StatusDot } from "../../ui/mesa.tsx";
import Link from "next/link";

/** Depende da identidade da requisição: nunca pode ser servida de cache. */
export const dynamic = "force-dynamic";

/**
 * Painel.
 *
 * A tela é a do Mesa, elemento por elemento: o palco do valor, a atividade dos
 * últimos meses, a distribuição por categoria, três indicadores e os
 * lançamentos recentes.
 *
 * **Nenhum número é calculado aqui.** Tudo vem de `buildDashboard`, que é a
 * mesma conta que o aplicativo do celular consome — a folga medida no dia mais
 * apertado, as entradas e saídas da competência, o comprometido. A tela só
 * escolhe onde cada um aparece.
 *
 * Uma decisão de leitura que o desenho permite e que vale registrar: no gráfico
 * de atividade, o **trilho** de cada mês é a entrada e o **preenchimento** é a
 * saída. Assim uma barra cheia significa "gastei tudo que entrou", e uma barra
 * pela metade significa folga — que é exatamente o que o título promete
 * ("entradas e saídas") sem precisar de duas barras por mês.
 */
export default async function Painel() {
  const user = await currentUser();
  // O desvio de quem não tem sessão acontece em `proxy.ts`, como resposta
  // HTTP, e o layout mostra o aviso. Lançar aqui viraria exceção na
  // renderização — que o Vite transmite como erro para todas as abas.
  if (!user) return null;

  const dashboard = await buildDashboard(user.id);

  const livre = dashboard.freeToSpend.amountCents;
  const negativo = livre < 0;
  const [inteiro, centavos] = partirValor(livre);

  /*
   * A legenda mostra **variação**, não um segundo valor absoluto.
   *
   * O desenho põe ali "+12,4% projeção": é a direção para onde o saldo vai,
   * comparada com o que existe hoje. Repetir um valor em reais ao lado do
   * número gigante não acrescenta nada — e foi o que a primeira versão desta
   * tela fez, mostrando a folga duas vezes.
   */
  const projetado =
    dashboard.cashflow.at(-1)?.projectedBalanceCents ?? dashboard.position.currentBalanceCents;
  const hoje = dashboard.position.currentBalanceCents;
  const variacao = hoje !== 0 ? ((projetado - hoje) / Math.abs(hoje)) * 100 : null;
  const reserva = dashboard.position.investmentsCents;

  const meses = dashboard.cashflow.slice(-7);
  const categorias = dashboard.categorySpend.slice(0, 4);
  const recentes = dashboard.recentTransactions.slice(0, 4);

  return (
    <div className="content-area">
      {/* ---------------------------------------------------------------- */}
      {/* O palco: uma pergunta, um número.                                 */}
      {/* ---------------------------------------------------------------- */}
      <section className="money-stage">
        <div className="status-pill">
          <span
            className={negativo ? "size-1.5 rounded-full bg-negative" : "size-1.5 rounded-full bg-positive"}
            style={{ boxShadow: "0 0 10px currentColor" }}
            aria-hidden
          />
          {negativo ? "Comprometido além do saldo" : "Disponível para uso"}
        </div>

        <div className="mt-5 flex items-baseline justify-center">
          <span className="mr-3 text-xl font-light text-ink-subtle">R$</span>
          <p className="money-value tabular">{inteiro}</p>
          <span className="ml-1 text-xl font-light text-ink-subtle">,{centavos}</span>
        </div>

        <div className="money-legend">
          <span>
            <b className="tabular">
              {variacao === null
                ? money(projetado)
                : `${variacao >= 0 ? "+" : "−"}${Math.abs(variacao).toFixed(1).replace(".", ",")}%`}
            </b>
            <small>projeção</small>
          </span>
          <i aria-hidden />
          <span>
            <b className="tabular">{money(reserva)}</b>
            <small>reserva</small>
          </span>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-12">
        {/* -------------------------------------------------------------- */}
        {/* Atividade: trilho é o que entrou, preenchimento é o que saiu.   */}
        {/* -------------------------------------------------------------- */}
        <section className="glass-panel p-6 xl:col-span-8">
          <PanelHeading
            titulo="Atividade financeira"
            apoio={`Entradas e saídas dos últimos ${meses.length} meses`}
          />
          <div className="flex h-48 items-end gap-3 pt-4">
            {meses.map((mes) => {
              const proporcao =
                mes.inflowCents > 0 ? Math.min(100, (mes.outflowCents / mes.inflowCents) * 100) : 0;
              return (
                <div key={mes.competence} className="group flex h-full flex-1 flex-col justify-end gap-3">
                  <div
                    className="relative h-full overflow-hidden rounded-xl bg-surface-inset"
                    title={`${money(mes.outflowCents)} de saída para ${money(mes.inflowCents)} de entrada`}
                  >
                    <div
                      className="absolute inset-x-0 bottom-0 rounded-xl bg-accent/70 transition-all duration-500 group-hover:bg-accent"
                      style={{ height: `${Math.max(proporcao, 2)}%` }}
                    />
                  </div>
                  <span className="text-center text-[10px] text-ink-subtle">
                    {nomeDoMes(mes.competence)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* -------------------------------------------------------------- */}
        {/* Distribuição por categoria.                                      */}
        {/* -------------------------------------------------------------- */}
        <section className="glass-panel p-6 xl:col-span-4">
          <PanelHeading titulo="Distribuição" apoio="Despesas por categoria" />
          {categorias.length ? (
            <div className="space-y-5">
              {categorias.map((categoria, indice) => (
                <div key={categoria.categoryId ?? categoria.name}>
                  <div className="mb-2 flex justify-between text-caption">
                    <span className="text-ink">{categoria.name}</span>
                    <span className="tabular text-ink-subtle">{money(categoria.amountCents)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-inset">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(categoria.percent, 2)}%`,
                        background: `var(--color-viz-${indice + 1})`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-body-sm text-ink-subtle">
              Nenhum gasto nesta competência ainda.
            </p>
          )}
        </section>

        {/* -------------------------------------------------------------- */}
        {/* Três indicadores.                                               */}
        {/* -------------------------------------------------------------- */}
        <div className="grid gap-5 md:grid-cols-3 xl:col-span-12">
          <MetricTile
            tom="positive"
            icone={<ArrowUpRight className="size-4" aria-hidden />}
            rotulo="Receita no mês"
            valor={money(dashboard.monthFlow.incomeCents)}
            apoio="Entradas confirmadas na competência"
          />
          <MetricTile
            tom="negative"
            icone={<ArrowDownRight className="size-4" aria-hidden />}
            rotulo="Saídas no mês"
            valor={money(dashboard.monthFlow.expenseCents)}
            apoio={proporcaoDaRenda(dashboard.monthFlow.expenseCents, dashboard.monthFlow.incomeCents)}
          />
          <MetricTile
            tom="caution"
            icone={<CalendarClock className="size-4" aria-hidden />}
            rotulo="Renda comprometida"
            valor={money(dashboard.position.committedCents)}
            apoio="Faturas em aberto e contas previstas"
          />
        </div>

        {/* -------------------------------------------------------------- */}
        {/* Lançamentos recentes.                                           */}
        {/* -------------------------------------------------------------- */}
        <section className="glass-panel p-6 xl:col-span-12">
          <PanelHeading
            titulo="Lançamentos recentes"
            apoio="Últimas movimentações confirmadas"
            acao={
              <Link
                href="/lancamentos"
                className="inline-flex h-8 items-center gap-2 rounded-md px-3 text-caption text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink"
              >
                Ver todos
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            }
          />
          {recentes.length ? (
            <div className="divide-y divide-line">
              {recentes.map((lancamento) => {
                const entrada = lancamento.kind === "income";
                return (
                  <div
                    key={lancamento.id}
                    className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-3.5"
                  >
                    <StatusDot tom={entrada ? "positive" : "negative"} />
                    <div className="min-w-0">
                      <p className="truncate text-body-sm font-medium text-ink">
                        {lancamento.description}
                      </p>
                      <p className="truncate text-caption text-ink-subtle">
                        {quando(lancamento.occurredOn, dashboard.today)}
                      </p>
                    </div>
                    <p className="tabular text-body-sm font-medium text-ink">
                      {entrada ? "+ " : "− "}
                      {money(Math.abs(lancamento.amountCents))}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-body-sm text-ink-subtle">
              Nenhum lançamento ainda. Use o botão “Novo” para registrar o primeiro.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

/**
 * Parte o valor no separador decimal.
 *
 * O desenho põe o "R$" pequeno e claro à esquerda e o número grande ao lado.
 * Os centavos ficam menores porque não mudam decisão nenhuma — quem olha este
 * número quer saber se dá para gastar, não o troco.
 */
function partirValor(centavos: number): [string, string] {
  const formatado = money(Math.abs(centavos)).replace(/^R\$\s*/, "");
  const corte = formatado.lastIndexOf(",");
  if (corte === -1) return [formatado, "00"];
  return [formatado.slice(0, corte), formatado.slice(corte + 1)];
}

function proporcaoDaRenda(saidas: number, entradas: number): string {
  if (entradas <= 0) return "Sem entrada registrada na competência";
  return `${Math.round((saidas / entradas) * 100)}% da renda do mês`;
}

function nomeDoMes(competencia: string): string {
  const [ano, mes] = competencia.split("-").map(Number);
  const nome = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(ano, mes - 1, 1)),
  );
  const limpo = nome.replace(".", "");
  return limpo.charAt(0).toUpperCase() + limpo.slice(1);
}

function quando(data: string, hoje: string): string {
  if (data === hoje) return "Hoje";
  const formatada = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${data}T12:00:00Z`));
  return formatada.replace(".", "");
}
