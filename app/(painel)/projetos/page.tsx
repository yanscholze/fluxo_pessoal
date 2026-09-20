import Link from "next/link";

import { PROJECT_STATUS_LABEL, isOpenStatus } from "../../../core/domain/work/status.ts";
import { buildBoard, buildWorkOverview } from "../../../server/services/work.ts";
import { currentUser } from "../../auth-context.ts";
import { money } from "../../ui/format.ts";
import { ArrowRight, BriefcaseBusiness } from "../../ui/icons.tsx";
import { PanelHeading } from "../../ui/mesa.tsx";
import { Empty } from "../../ui/primitives.tsx";
import { TaskBoard } from "../../ui/work/task-board.tsx";
import { NewProject } from "./new-project.tsx";

export const dynamic = "force-dynamic";

/**
 * Projetos.
 *
 * O quadro de pendências abre a tela, e não os projetos: a pergunta de quem
 * abre esta página é "o que eu faço agora", e a lista de projetos responde
 * "como estão as coisas" — que é a segunda pergunta.
 *
 * O quadro é o mesmo componente que o painel inicial usa, com as cinco
 * situações e o arrasto entre elas.
 */
export default async function Projetos() {
  const user = await currentUser();
  // O desvio de quem não tem sessão acontece em `proxy.ts`, como resposta
  // HTTP, e o layout mostra o aviso. Lançar aqui viraria exceção na
  // renderização — que o Vite transmite como erro para todas as abas.
  if (!user) return null;

  const [view, quadro] = await Promise.all([buildWorkOverview(user.id), buildBoard(user.id)]);

  const peso: Record<string, number> = {
    atrasado: 0,
    perto: 1,
    "no-prazo": 2,
    "sem-prazo": 3,
    entregue: 4,
  };
  const ordenados = [...view.projects].sort(
    (esquerda, direita) =>
      (peso[esquerda.health.deadline.status] ?? 9) - (peso[direita.health.deadline.status] ?? 9),
  );
  const emAndamento = ordenados.filter((projeto) => isOpenStatus(projeto.status));

  return (
    <div className="content-area">
      <section className="glass-panel mb-5 p-6">
        <PanelHeading
          titulo="Quadro de pendências"
          apoio="Arraste os cartões entre as etapas"
          acao={<NewProject />}
        />
        {quadro.tasks.length ? (
          <TaskBoard tasks={quadro.tasks} dense />
        ) : (
          <Empty
            title="Nenhuma tarefa nos projetos abertos"
            hint="As pendências criadas dentro de cada projeto aparecem aqui."
          />
        )}
      </section>

      {emAndamento.length ? (
        <div className="grid gap-5 md:grid-cols-3">
          {emAndamento.map((projeto) => (
            <section key={projeto.id} className="glass-panel p-6">
              <BriefcaseBusiness className="mb-10 size-5" style={{ color: projeto.color }} aria-hidden />
              <p className="metric-label">
                {PROJECT_STATUS_LABEL[projeto.status] ?? projeto.status}
              </p>
              <h3 className="mt-2 truncate text-lg font-medium text-ink">{projeto.name}</h3>
              <p className="tabular mt-3 text-body-sm text-ink-subtle">
                {money(projeto.health.finance.contracted)}
                {projeto.clientName ? ` · ${projeto.clientName}` : ""}
              </p>
              <Link
                href={`/projetos/${projeto.id}`}
                className="mt-6 inline-flex h-8 items-center gap-2 rounded-md px-3 text-caption font-medium text-accent transition-colors hover:bg-accent-wash"
              >
                Abrir projeto
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </section>
          ))}
        </div>
      ) : (
        <section className="glass-panel p-6">
          <Empty
            icon={BriefcaseBusiness}
            title="Nenhum projeto em andamento"
            hint="Crie um projeto para acompanhar prazo, esforço e cobrança."
          />
          <div className="mt-4">
            <NewProject />
          </div>
        </section>
      )}
    </div>
  );
}
