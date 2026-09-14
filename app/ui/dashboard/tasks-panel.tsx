/**
 * As pendências, no painel inicial.
 *
 * O quadro morava em `/projetos/quadro` e a lista de cada projeto na página
 * dele — os dois a dois cliques de distância de quem abre o Fluxo de manhã.
 * A pergunta "o que eu faço hoje" é a primeira do dia e estava sem resposta na
 * primeira tela.
 *
 * É o mesmo quadro do Quadro, e não uma segunda lista parecida: o cartão, a
 * ordem e o arrasto vêm do mesmo componente. Duas implementações da mesma
 * coisa divergem sempre, e a versão do painel é a que ficaria para trás.
 *
 * A diferença é o que cada um pergunta. O Quadro mostra tudo, inclusive o que
 * já foi feito; aqui só entra o que **falta**, e "Feito" vira a área para onde
 * se arrasta o que acabou. O subtítulo conta o prazo — atrasadas, hoje, esta
 * semana — porque é por prazo que se decide o dia, não por situação.
 */

import Link from "next/link";

import { type LocalDate, addDays } from "../../../core/time/local-date.ts";
import { ChevronRight, ListTodo } from "../icons.tsx";
import { Empty, Panel, PanelHeader } from "../primitives.tsx";
import { TaskBoard, type TarefaDoQuadro } from "../work/task-board.tsx";

/** Quantos dias "esta semana" cobre. Sete, contados de hoje. */
const SEMANA = 7;

function resumo(tasks: readonly TarefaDoQuadro[], today: LocalDate): string {
  const limite = addDays(today, SEMANA);
  const atrasadas = tasks.filter((tarefa) => tarefa.isLate).length;
  const hoje = tasks.filter((tarefa) => tarefa.dueOn === today).length;
  const semana = tasks.filter(
    (tarefa) => tarefa.dueOn !== null && tarefa.dueOn > today && tarefa.dueOn <= limite,
  ).length;

  const partes: string[] = [];
  if (atrasadas) partes.push(`${atrasadas} atrasada${atrasadas === 1 ? "" : "s"}`);
  if (hoje) partes.push(`${hoje} para hoje`);
  if (semana) partes.push(`${semana} nesta semana`);

  // Sem prazo nenhum, o número que resta dizendo alguma coisa é o total. Dizer
  // "0 atrasadas" seria contar uma ausência como se fosse notícia.
  if (!partes.length) return `${tasks.length} em aberto, nenhuma com prazo nos próximos ${SEMANA} dias`;
  return partes.join(" · ");
}

export function TasksPanel({
  tasks,
  today,
}: {
  tasks: readonly TarefaDoQuadro[];
  today: LocalDate;
}) {
  return (
    <Panel>
      <PanelHeader
        title="Pendências"
        icon={ListTodo}
        hint={tasks.length ? resumo(tasks, today) : undefined}
        action={
          <Link
            href="/projetos/quadro"
            className="inline-flex items-center gap-0.5 text-caption text-accent hover:underline"
          >
            Abrir o quadro <ChevronRight className="size-3.5" />
          </Link>
        }
      />

      {tasks.length ? (
        <TaskBoard tasks={tasks} dense doneIsDropZone />
      ) : (
        <Empty
          icon={ListTodo}
          title="Nada pendente"
          hint="As tarefas criadas dentro de cada projeto aparecem aqui, divididas pelas situações do trabalho."
        />
      )}
    </Panel>
  );
}
