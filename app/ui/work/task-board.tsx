"use client";

/**
 * O quadro de pendências.
 *
 * Cinco colunas porque são cinco as situações que o domínio reconhece, e a
 * mais importante delas é **travado**: uma tarefa parada esperando resposta de
 * terceiro não é "a fazer", e tratá-la como tal faz o quadro mentir sobre a
 * capacidade da semana.
 *
 * Move-se de dois jeitos, e os dois precisam existir:
 *
 * **Arrastando** o cartão até a coluna. É o gesto que a pessoa já espera de um
 * quadro, e o que dá a sensação de mexer no trabalho em vez de preencher um
 * formulário sobre ele.
 *
 * **Pelos botões** de avançar e voltar. Arrastar é do mouse: não existe para
 * quem navega por teclado, não é anunciado por leitor de tela e é hostil no
 * telefone, onde o dedo que arrasta é o mesmo que rola a página. Os botões são
 * o caminho que funciona em todos esses casos — não são redundância.
 *
 * O cartão muda de coluna **antes** da resposta do servidor. Sem isso, soltar
 * o cartão o devolve para o lugar de origem por meio segundo e a impressão é
 * de que o arrasto falhou; quando o servidor recusa, o cartão volta sozinho e
 * o erro aparece escrito.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { LocalDate } from "../../../core/time/local-date.ts";
import { dateShort } from "../format.ts";
import { ChevronLeft, ChevronRight, GripVertical } from "../icons.tsx";
import { Badge, Notice, join, type Tone } from "../primitives.tsx";

export const COLUNAS = [
  { id: "todo", label: "A fazer" },
  { id: "doing", label: "Fazendo" },
  { id: "blocked", label: "Travado" },
  { id: "review", label: "Revisão" },
  { id: "done", label: "Feito" },
] as const;

export type Situacao = (typeof COLUNAS)[number]["id"];

/**
 * Uma tarefa, do jeito que o quadro precisa dela.
 *
 * É a mesma forma que o Quadro e o painel recebem do servidor — as duas telas
 * desenham o mesmo cartão, e dois formatos para o mesmo objeto garantiriam que
 * um dia elas divergissem.
 */
export type TarefaDoQuadro = {
  readonly id: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly projectColor: string | null;
  readonly clientName: string | null;
  readonly title: string;
  readonly kind: string;
  readonly priority: string;
  readonly status: string;
  readonly dueOn: string | null;
  readonly billable: boolean;
  readonly isLate: boolean;
};

const NATUREZA: Record<string, { label: string; tone: Tone }> = {
  feature: { label: "Funcionalidade", tone: "accent" },
  support: { label: "Suporte", tone: "info" },
  improvement: { label: "Melhoria", tone: "neutral" },
  chore: { label: "Manutenção", tone: "neutral" },
  bug: { label: "Correção", tone: "negative" },
};

const PRIORIDADE: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

/** O tipo que viaja no arrasto. Sem ele o quadro aceitaria qualquer coisa solta. */
const MIME = "application/x-fluxo-tarefa";

/**
 * A ordem dentro da coluna.
 *
 * Atrasada primeiro, depois o prazo mais próximo, depois a prioridade. A coluna
 * responde "o que eu pego agora", e o que já venceu vem antes do que é urgente
 * mas ainda tem data.
 */
function ordenar(esquerda: TarefaDoQuadro, direita: TarefaDoQuadro): number {
  if (esquerda.isLate !== direita.isLate) return esquerda.isLate ? -1 : 1;
  if (esquerda.dueOn !== direita.dueOn) {
    if (esquerda.dueOn === null) return 1;
    if (direita.dueOn === null) return -1;
    return esquerda.dueOn < direita.dueOn ? -1 : 1;
  }
  return (PRIORIDADE[esquerda.priority] ?? 9) - (PRIORIDADE[direita.priority] ?? 9);
}

export function TaskBoard({
  tasks,
  /** Compacto: o quadro dentro do painel, onde a coluna tem metade da largura. */
  dense = false,
  /** Mostra de qual projeto veio o cartão. Desnecessário na página do projeto. */
  showProject = true,
  /**
   * "Feito" vira só área de soltura.
   *
   * É o caso do painel, que recebe apenas o que falta fazer. Ali a coluna
   * "Feito" estaria eternamente vazia e diria uma mentira — "você não concluiu
   * nada" — quando na verdade o concluído é que não foi pedido. Como área de
   * soltura ela continua servindo para o gesto que mais importa: arrastar para
   * lá é como se termina uma tarefa.
   */
  doneIsDropZone = false,
}: {
  tasks: readonly TarefaDoQuadro[];
  dense?: boolean;
  showProject?: boolean;
  doneIsDropZone?: boolean;
}) {
  const router = useRouter();
  const [emTransito, setEmTransito] = useState<readonly string[]>([]);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<Situacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  /** O que já foi movido aqui e o servidor ainda não confirmou. */
  const [movidas, setMovidas] = useState<Record<string, Situacao>>({});

  /*
   * A sobreposição some quando o servidor concorda com ela.
   *
   * Mantê-la para sempre faria o quadro ignorar qualquer mudança vinda de
   * fora — outra aba, o celular — porque a posição local venceria a do
   * servidor até a página ser recarregada.
   *
   * O ajuste acontece **durante a renderização**, e não num efeito. É o
   * padrão que o React recomenda para estado que deriva de propriedade: num
   * efeito, o quadro chegaria a pintar uma vez com a posição velha e só
   * depois se corrigiria — um piscar do cartão entre duas colunas.
   */
  const [ultimas, setUltimas] = useState(tasks);
  if (ultimas !== tasks) {
    setUltimas(tasks);
    setMovidas((atual) => {
      const restantes = Object.entries(atual).filter(([id, situacao]) => {
        const tarefa = tasks.find((item) => item.id === id);
        // A tarefa sumiu da lista — é o caso do painel, que só recebe as que
        // faltam: concluir uma tira ela dos dados, e a sobreposição já cumpriu
        // o seu papel.
        if (!tarefa) return false;
        return tarefa.status !== situacao;
      });
      return restantes.length === Object.keys(atual).length ? atual : Object.fromEntries(restantes);
    });
  }

  const situacaoDe = (tarefa: TarefaDoQuadro): string => movidas[tarefa.id] ?? tarefa.status;

  async function mover(tarefa: TarefaDoQuadro, status: Situacao) {
    if (situacaoDe(tarefa) === status) return;

    setMovidas((atual) => ({ ...atual, [tarefa.id]: status }));
    setEmTransito((atual) => [...atual, tarefa.id]);
    setErro(null);

    const resposta = await fetch(`/api/v1/tasks/${tarefa.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });

    setEmTransito((atual) => atual.filter((id) => id !== tarefa.id));

    if (!resposta.ok) {
      // Volta para onde estava: deixar o cartão na coluna nova depois de o
      // servidor recusar mostraria um quadro que não existe em lugar nenhum.
      setMovidas((atual) => {
        const resto = { ...atual };
        delete resto[tarefa.id];
        return resto;
      });
      const corpo = (await resposta.json().catch(() => ({}))) as { error?: { message?: string } };
      setErro(corpo.error?.message ?? "Não foi possível mover a tarefa.");
      return;
    }

    router.refresh();
  }

  return (
    <div>
      {erro ? (
        <div className="mb-3">
          <Notice tone="negative">{erro}</Notice>
        </div>
      ) : null}

      <div
        className={join(
          "grid gap-3",
          dense ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" : "gap-4 md:grid-cols-2 xl:grid-cols-5",
        )}
      >
        {COLUNAS.map((coluna, indice) => {
          const daColuna = tasks.filter((tarefa) => situacaoDe(tarefa) === coluna.id).sort(ordenar);
          const recebendo = alvo === coluna.id && arrastando !== null;
          const soltarParaConcluir = doneIsDropZone && coluna.id === "done";

          return (
            <section
              key={coluna.id}
              onDragOver={(evento) => {
                // Sem o `preventDefault` o navegador recusa a soltura e o
                // cursor mostra o sinal de proibido sobre a coluna inteira.
                if (!evento.dataTransfer.types.includes(MIME)) return;
                evento.preventDefault();
                evento.dataTransfer.dropEffect = "move";
                setAlvo(coluna.id);
              }}
              onDragLeave={(evento) => {
                // Só apaga o destaque quando o ponteiro sai da coluna de
                // verdade: passar por cima de um cartão dispara `dragleave` na
                // seção, e sem esta guarda a coluna pisca a cada cartão.
                if (evento.currentTarget.contains(evento.relatedTarget as Node | null)) return;
                setAlvo((atual) => (atual === coluna.id ? null : atual));
              }}
              onDrop={(evento) => {
                const id = evento.dataTransfer.getData(MIME);
                setAlvo(null);
                setArrastando(null);
                const tarefa = tasks.find((item) => item.id === id);
                if (tarefa) void mover(tarefa, coluna.id);
              }}
              className={join(
                "min-w-0 rounded-nested border border-dashed p-1.5 transition-colors",
                recebendo ? "border-accent bg-accent-wash" : "border-transparent",
              )}
            >
              <h3 className="mb-2 flex items-baseline justify-between gap-2 border-b border-line pb-1.5">
                <span className="text-caption font-semibold uppercase tracking-wide text-ink-muted">
                  {coluna.label}
                </span>
                {soltarParaConcluir ? null : (
                  <span className="tabular text-caption text-ink-subtle">{daColuna.length}</span>
                )}
              </h3>

              {soltarParaConcluir ? (
                <p
                  className={join(
                    "rounded-md border border-dashed px-2.5 py-4 text-center text-caption transition-colors",
                    recebendo ? "border-accent text-accent" : "border-line text-ink-subtle",
                  )}
                >
                  {recebendo ? "solte para concluir" : "arraste para cá para concluir"}
                </p>
              ) : null}

              <ul className={join("space-y-2", soltarParaConcluir ? "hidden" : "")}>
                {daColuna.map((tarefa) => {
                  const tipo = NATUREZA[tarefa.kind] ?? { label: tarefa.kind, tone: "neutral" as Tone };
                  const salvando = emTransito.includes(tarefa.id);
                  const anterior = COLUNAS[indice - 1];
                  const proxima = COLUNAS[indice + 1];

                  return (
                    <li
                      key={tarefa.id}
                      draggable
                      onDragStart={(evento) => {
                        evento.dataTransfer.setData(MIME, tarefa.id);
                        evento.dataTransfer.effectAllowed = "move";
                        setArrastando(tarefa.id);
                      }}
                      onDragEnd={() => {
                        setArrastando(null);
                        setAlvo(null);
                      }}
                      className={join(
                        "group cursor-grab rounded-md border border-line bg-surface p-2.5 transition-opacity active:cursor-grabbing",
                        salvando || arrastando === tarefa.id ? "opacity-50" : "",
                      )}
                    >
                      <p className="flex items-start gap-1.5">
                        <span
                          className="mt-1.5 size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: tarefa.projectColor ?? "var(--color-line-strong)" }}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 text-body-sm text-ink">{tarefa.title}</span>
                        <GripVertical
                          size={14}
                          strokeWidth={1.5}
                          aria-hidden
                          className="mt-0.5 shrink-0 text-ink-subtle opacity-0 transition-opacity group-hover:opacity-100"
                        />
                      </p>

                      {showProject ? (
                        <p className="mt-1 truncate pl-3.5 text-caption text-ink-subtle" title={tarefa.projectName}>
                          {tarefa.projectName}
                          {tarefa.clientName ? ` · ${tarefa.clientName}` : ""}
                        </p>
                      ) : null}

                      {/*
                       * Sem o recuo das outras linhas, e com a pílula pequena.
                       *
                       * A coluna do quadro tem cerca de 150 px, e o miolo do
                       * cartão, menos de 130. "FUNCIONALIDADE" na pílula normal
                       * mede mais que isso sozinha: o recuo de alinhamento e a
                       * pílula que não encolhe eram o que empurrava o texto para
                       * fora da borda. Aqui a largura toda do cartão é pouca, e
                       * alinhar a pílula sob o título custa caro demais.
                       */}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        <Badge tone={tipo.tone} size="sm">{tipo.label}</Badge>
                        {tarefa.priority === "urgent" ? (
                          <Badge tone="negative" size="sm">urgente</Badge>
                        ) : null}
                        {tarefa.isLate && tarefa.dueOn ? (
                          <Badge tone="negative" size="sm">
                            venceu {dateShort(tarefa.dueOn as LocalDate)}
                          </Badge>
                        ) : tarefa.dueOn ? (
                          <span className="text-caption text-ink-subtle">
                            {dateShort(tarefa.dueOn as LocalDate)}
                          </span>
                        ) : null}
                        {!tarefa.billable ? (
                          <Badge tone="neutral" size="sm">não cobrável</Badge>
                        ) : null}
                      </div>

                      {/*
                       * `flex-wrap` porque "Fazendo" e "Revisão" juntos não
                       * cabem na largura de uma coluna de quadro. Sem a quebra,
                       * o segundo botão sai pela borda; com ela, cada um ocupa
                       * a sua linha e continua legível. Encolher com reticência
                       * seria pior: "Revis…" não diz para onde o cartão vai.
                       */}
                      <div className="mt-2 flex flex-wrap justify-between gap-1">
                        {anterior ? (
                          <button
                            type="button"
                            disabled={salvando}
                            onClick={() => void mover(tarefa, anterior.id)}
                            aria-label={`Mover ${tarefa.title} para ${anterior.label}`}
                            className="inline-flex items-center gap-0.5 rounded-md border border-line px-1.5 py-1 text-caption text-ink-muted hover:bg-surface-sunken disabled:opacity-50"
                          >
                            <ChevronLeft className="size-3.5" />
                            {anterior.label}
                          </button>
                        ) : (
                          <span />
                        )}

                        {proxima ? (
                          <button
                            type="button"
                            disabled={salvando}
                            onClick={() => void mover(tarefa, proxima.id)}
                            aria-label={`Mover ${tarefa.title} para ${proxima.label}`}
                            className="inline-flex items-center gap-0.5 rounded-md border border-line px-1.5 py-1 text-caption text-ink-muted hover:bg-surface-sunken disabled:opacity-50"
                          >
                            {proxima.label}
                            <ChevronRight className="size-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}

                {daColuna.length === 0 ? (
                  <li className="rounded-md border border-dashed border-line px-2.5 py-4 text-center text-caption text-ink-subtle">
                    {recebendo ? "solte aqui" : "vazia"}
                  </li>
                ) : null}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
