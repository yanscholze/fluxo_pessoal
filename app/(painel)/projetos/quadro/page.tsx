import { buildBoard } from "../../../../server/services/work.ts";
import { currentUser } from "../../../auth-context.ts";
import { MetricStrip } from "../../../ui/data-display.tsx";
import { CircleAlert, Clock, Layers, Pause } from "../../../ui/icons.tsx";
import { Page, PageHeader, Stack } from "../../../ui/page-frame.tsx";
import { Empty, Panel } from "../../../ui/primitives.tsx";
import { WorkNav } from "../work-nav.tsx";
import { Board } from "./board.tsx";

export const dynamic = "force-dynamic";

/**
 * Quadro de tarefas de todos os projetos abertos.
 *
 * A pergunta desta tela não é "o que falta neste projeto" — para isso existe a
 * página do projeto — e sim "o que está travado, em qualquer lugar". Por isso
 * as tarefas de todos os projetos dividem as mesmas cinco colunas, e cada
 * cartão carrega de qual projeto veio.
 */
export default async function Quadro() {
  const user = await currentUser();
  // O desvio de quem não tem sessão acontece em `proxy.ts`, como resposta
  // HTTP, e o layout mostra o aviso. Lançar aqui viraria exceção na
  // renderização — que o Vite transmite como erro para todas as abas.
  if (!user) return null;

  const view = await buildBoard(user.id);

  const abertas = view.tasks.filter((tarefa) => tarefa.status !== "done");
  const travadas = view.tasks.filter((tarefa) => tarefa.status === "blocked");
  const atrasadas = view.tasks.filter((tarefa) => tarefa.isLate);
  const fazendo = view.tasks.filter((tarefa) => tarefa.status === "doing");

  return (
    <Page>
      <PageHeader
        title="Quadro"
        description="As tarefas de todos os projetos abertos, nas cinco situações que o trabalho realmente tem."
      >
        <WorkNav />
      </PageHeader>

      <Stack gap="lg">
        <MetricStrip
          metrics={[
            {
              label: "Em aberto",
              value: String(abertas.length),
              icon: Layers,
              hint: `${view.projects.length} projeto${view.projects.length === 1 ? "" : "s"} ativo${view.projects.length === 1 ? "" : "s"}`,
            },
            {
              label: "Fazendo agora",
              value: String(fazendo.length),
              icon: Clock,
              tone: fazendo.length > 3 ? "caution" : "neutral",
              hint: fazendo.length > 3 ? "Frentes demais ao mesmo tempo" : "Uma frente de cada vez",
            },
            {
              label: "Travadas",
              value: String(travadas.length),
              icon: Pause,
              tone: travadas.length ? "caution" : "neutral",
              hint: travadas.length ? "Esperando alguém que não é você" : "Nada esperando terceiros",
            },
            {
              label: "Atrasadas",
              value: String(atrasadas.length),
              icon: CircleAlert,
              tone: atrasadas.length ? "negative" : "positive",
              hint: atrasadas.length ? "Prazo já passou" : "Nenhum prazo estourado",
            },
          ]}
        />

        {view.tasks.length ? (
          <Board tasks={view.tasks} />
        ) : (
          <Panel>
            <Empty
              icon={Layers}
              title="Nenhuma tarefa nos projetos abertos"
              hint="As pendências criadas dentro de cada projeto aparecem aqui, divididas pelas cinco situações."
            />
          </Panel>
        )}
      </Stack>
    </Page>
  );
}
