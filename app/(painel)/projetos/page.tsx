import { buildWorkOverview } from "../../../server/services/work.ts";
import { type Milli, toHours } from "../../../core/domain/work/hours.ts";
import { currentUser } from "../../auth-context.ts";
import { Amount, MetricStrip } from "../../ui/data-display.tsx";
import { dateShort, decimal, money } from "../../ui/format.ts";
import { Briefcase, CircleAlert, Clock, Wallet } from "../../ui/icons.tsx";
import { Page, PageHeader, SectionTitle, Stack } from "../../ui/page-frame.tsx";
import { Badge, Empty, Meter, Panel, type Tone } from "../../ui/primitives.tsx";
import { NewProject } from "./new-project.tsx";
import { WorkNav } from "./work-nav.tsx";

export const dynamic = "force-dynamic";

const SITUACAO: Record<string, { label: string; tone: Tone }> = {
  lead: { label: "Prospecção", tone: "neutral" },
  proposal: { label: "Proposta", tone: "info" },
  active: { label: "Em desenvolvimento", tone: "accent" },
  waiting_client: { label: "Aguardando cliente", tone: "caution" },
  paused: { label: "Pausado", tone: "neutral" },
  delivered: { label: "Entregue", tone: "positive" },
  support: { label: "Suporte", tone: "info" },
  done: { label: "Concluído", tone: "positive" },
  cancelled: { label: "Cancelado", tone: "negative" },
};

const PRAZO: Record<string, { label: string; tone: Tone }> = {
  atrasado: { label: "atrasado", tone: "negative" },
  perto: { label: "vence em breve", tone: "caution" },
  "no-prazo": { label: "no prazo", tone: "positive" },
  entregue: { label: "entregue", tone: "positive" },
  "sem-prazo": { label: "sem prazo", tone: "neutral" },
};

/**
 * Projetos.
 *
 * A ordem da lista não é alfabética nem por data: é por **quem precisa de
 * atenção**. Atrasado primeiro, depois o que vence perto, depois o resto. Uma
 * lista ordenada por nome obriga a varrer tudo para descobrir o que está
 * pegando fogo — que é a única pergunta que se faz ao abrir esta tela.
 */
export default async function Projetos() {
  const user = await currentUser();
  // O desvio de quem não tem sessão acontece em `proxy.ts`, como resposta
  // HTTP, e o layout mostra o aviso. Lançar aqui viraria exceção na
  // renderização — que o Vite transmite como erro para todas as abas.
  if (!user) return null;

  const view = await buildWorkOverview(user.id);
  const peso: Record<string, number> = { atrasado: 0, perto: 1, "no-prazo": 2, "sem-prazo": 3, entregue: 4 };

  const ordenados = [...view.projects].sort(
    (esquerda, direita) =>
      (peso[esquerda.health.deadline.status] ?? 9) - (peso[direita.health.deadline.status] ?? 9),
  );

  const emAndamento = ordenados.filter((projeto) =>
    ["active", "waiting_client", "support", "proposal", "lead"].includes(projeto.status),
  );
  const encerrados = ordenados.filter((projeto) => !emAndamento.includes(projeto));

  return (
    <Page>
      <PageHeader
        eyebrow="Trabalho"
        title="Projetos"
        description="Prazo, esforço e cobrança de cada projeto, e o que já entrou de dinheiro."
        actions={<NewProject />}
      >
        <WorkNav />
      </PageHeader>

      <Stack gap="lg">
        <MetricStrip
          metrics={[
            {
              label: "Em andamento",
              value: String(view.totals.activeProjects),
              hint: view.totals.lateProjects
                ? `${view.totals.lateProjects} com prazo estourado`
                : "Nenhum atrasado",
              tone: view.totals.lateProjects ? "negative" : "neutral",
              icon: Briefcase,
            },
            {
              label: "A receber",
              value: money(view.totals.pendingCents),
              hint: "Parcelas agendadas que ainda vão vencer",
              icon: Wallet,
            },
            {
              label: "Vencido",
              value: money(view.totals.overdueCents),
              tone: view.totals.overdueCents > 0 ? "negative" : "neutral",
              hint: "Cobrança que passou do prazo",
              icon: CircleAlert,
            },
            {
              label: "Horas na semana",
              value: `${decimal(toHours(view.totals.weekMilli as Milli), 1)} h`,
              hint: "Últimos sete dias",
              icon: Clock,
            },
          ]}
        />

        <section>
          <SectionTitle title="Em andamento" hint="Ordenados por urgência do prazo" />
          {emAndamento.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {emAndamento.map((projeto) => (
                <CartaoDeProjeto key={projeto.id} projeto={projeto} />
              ))}
            </div>
          ) : (
            <Panel>
              <Empty
                icon={Briefcase}
                title="Nenhum projeto em andamento"
                hint="Cadastre um projeto para acompanhar prazo, horas e cobrança."
              />
            </Panel>
          )}
        </section>

        {encerrados.length ? (
          <section>
            <SectionTitle title="Encerrados" hint={`${encerrados.length} no histórico`} />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {encerrados.map((projeto) => (
                <CartaoDeProjeto key={projeto.id} projeto={projeto} />
              ))}
            </div>
          </section>
        ) : null}
      </Stack>
    </Page>
  );
}

type Projeto = Awaited<ReturnType<typeof buildWorkOverview>>["projects"][number];

function CartaoDeProjeto({ projeto }: { projeto: Projeto }) {
  const situacao = SITUACAO[projeto.status] ?? { label: projeto.status, tone: "neutral" as Tone };
  const prazo = PRAZO[projeto.health.deadline.status] ?? { label: "", tone: "neutral" as Tone };
  const { finance, effort, deadline } = projeto.health;

  return (
    /**
     * O cartão inteiro é o alvo, não só o nome.
     *
     * O link cobre a superfície por um pseudo-elemento esticado: o cartão
     * continua sendo um `article` com medidores e distintivos dentro — que não
     * podem virar conteúdo de âncora —, e mesmo assim qualquer ponto dele leva
     * ao projeto. Um `onClick` na `div` daria o mesmo clique e nenhuma das
     * outras coisas que um link é: abrir em nova aba, copiar endereço, receber
     * foco na ordem certa, ser anunciado como link.
     */
    <Panel
      as="article"
      className="group relative flex flex-col gap-3 transition-colors hover:border-line-strong focus-within:border-accent-edge"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-body font-medium text-ink transition-colors group-hover:text-accent">
            <a
              href={`/projetos/${projeto.id}`}
              className="outline-none before:absolute before:inset-0 before:rounded-panel before:content-['']"
            >
              {projeto.name}
            </a>
          </h3>
          <p className="mt-0.5 truncate text-caption text-ink-subtle">
            {projeto.clientName ?? "Projeto próprio"}
          </p>
        </div>
        <span
          className="mt-1 size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: projeto.color }}
          aria-hidden
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={situacao.tone}>{situacao.label}</Badge>
        {deadline.status !== "sem-prazo" ? <Badge tone={prazo.tone}>{prazo.label}</Badge> : null}
        {effort.overrun ? <Badge tone="caution">acima do estimado</Badge> : null}
      </div>

      {finance.contracted > 0 ? (
        <div>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-caption text-ink-subtle">
            <span>Recebido</span>
            <span className="tabular">
              {money(finance.received)} de {money(finance.contracted)}
            </span>
          </div>
          <Meter
            value={finance.received}
            total={Math.max(1, finance.contracted)}
            size="sm"
            tone={finance.overdue > 0 ? "negative" : "positive"}
            label={`Recebido: ${money(finance.received)} de ${money(finance.contracted)}`}
          />
        </div>
      ) : null}

      {effort.estimated > 0 ? (
        <div>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-caption text-ink-subtle">
            <span>Horas</span>
            <span className="tabular">
              {decimal(toHours(effort.worked), 1)} de {decimal(toHours(effort.estimated), 1)} h
            </span>
          </div>
          <Meter
            value={effort.worked}
            total={Math.max(1, effort.estimated)}
            size="sm"
            tone={effort.overrun ? "negative" : "accent"}
            label={`Horas: ${decimal(toHours(effort.worked), 1)} de ${decimal(toHours(effort.estimated), 1)}`}
          />
        </div>
      ) : null}

      <div className="mt-auto flex items-baseline justify-between gap-2 border-t border-line pt-2.5">
        <span className="text-caption text-ink-subtle">
          {deadline.dueOn ? `Prazo ${dateShort(deadline.dueOn)}` : "Sem prazo"}
          {projeto.openTasks ? ` · ${projeto.openTasks} pendente${projeto.openTasks > 1 ? "s" : ""}` : ""}
        </span>
        {finance.overdue > 0 ? <Amount cents={-finance.overdue} /> : null}
      </div>
    </Panel>
  );
}
