"use client";

/**
 * Quadro de tarefas.
 *
 * Cinco colunas porque são cinco as situações que o domínio reconhece, e a
 * mais importante delas é **travado**: uma tarefa parada esperando resposta de
 * terceiro não é "a fazer", e tratá-la como tal faz o quadro mentir sobre a
 * capacidade da semana.
 *
 * Move-se por botão, não por arrastar. Arrastar é agradável no computador e
 * hostil no celular — e este quadro é consultado no celular, entre uma reunião
 * e outra, que é justamente quando se marca algo como travado.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import { dateShort } from "../../../ui/format.ts";
import { ChevronLeft, ChevronRight } from "../../../ui/icons.tsx";
import { Badge, join, Notice, type Tone } from "../../../ui/primitives.tsx";
import type { BoardTask } from "../../../../server/services/work.ts";
import type { LocalDate } from "../../../../core/time/local-date.ts";

export const COLUNAS = [
  { id: "todo", label: "A fazer" },
  { id: "doing", label: "Fazendo" },
  { id: "blocked", label: "Travado" },
  { id: "review", label: "Revisão" },
  { id: "done", label: "Feito" },
] as const;

type Situacao = (typeof COLUNAS)[number]["id"];

const NATUREZA: Record<string, { label: string; tone: Tone }> = {
  feature: { label: "Funcionalidade", tone: "accent" },
  support: { label: "Suporte", tone: "info" },
  improvement: { label: "Melhoria", tone: "neutral" },
  chore: { label: "Manutenção", tone: "neutral" },
  bug: { label: "Correção", tone: "negative" },
};

const PRIORIDADE: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

export function Board({ tasks }: { tasks: readonly BoardTask[] }) {
  const router = useRouter();
  const [emTransito, setEmTransito] = useState<readonly string[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  async function mover(taskId: string, status: Situacao) {
    setEmTransito((atual) => [...atual, taskId]);
    setErro(null);

    const resposta = await fetch(`/api/v1/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });

    setEmTransito((atual) => atual.filter((id) => id !== taskId));

    if (!resposta.ok) {
      const corpo = (await resposta.json().catch(() => ({}))) as { error?: { message?: string } };
      setErro(corpo.error?.message ?? "Não foi possível mover a tarefa.");
      return;
    }

    router.refresh();
  }

  return (
    <div>
      {erro ? <Notice tone="negative">{erro}</Notice> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {COLUNAS.map((coluna, indice) => {
          const daColuna = tasks
            .filter((tarefa) => tarefa.status === coluna.id)
            .sort((esquerda, direita) => {
              // Atrasada primeiro, depois prioridade: a coluna responde "o que
              // eu pego agora", e o que já venceu vem antes do que é urgente.
              if (esquerda.isLate !== direita.isLate) return esquerda.isLate ? -1 : 1;
              return (PRIORIDADE[esquerda.priority] ?? 9) - (PRIORIDADE[direita.priority] ?? 9);
            });

          return (
            <section key={coluna.id} className="min-w-0">
              <h2 className="mb-2 flex items-baseline justify-between gap-2 border-b border-line pb-1.5">
                <span className="text-caption font-semibold uppercase tracking-wide text-ink-muted">
                  {coluna.label}
                </span>
                <span className="tabular text-caption text-ink-subtle">{daColuna.length}</span>
              </h2>

              <ul className="space-y-2">
                {daColuna.map((tarefa) => {
                  const tipo = NATUREZA[tarefa.kind] ?? { label: tarefa.kind, tone: "neutral" as Tone };
                  const salvando = emTransito.includes(tarefa.id);
                  const anterior = COLUNAS[indice - 1];
                  const proxima = COLUNAS[indice + 1];

                  return (
                    <li
                      key={tarefa.id}
                      className={join(
                        "rounded-md border border-line bg-surface p-2.5 transition-opacity",
                        salvando ? "opacity-50" : "",
                      )}
                    >
                      <p className="flex items-start gap-1.5">
                        <span
                          className="mt-1.5 size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: tarefa.projectColor ?? "var(--color-line-strong)" }}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 text-body-sm text-ink">{tarefa.title}</span>
                      </p>

                      <p className="mt-1 truncate pl-3.5 text-caption text-ink-subtle">
                        {tarefa.projectName}
                        {tarefa.clientName ? ` · ${tarefa.clientName}` : ""}
                      </p>

                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-3.5">
                        <Badge tone={tipo.tone}>{tipo.label}</Badge>
                        {tarefa.priority === "urgent" ? <Badge tone="negative">urgente</Badge> : null}
                        {tarefa.isLate ? (
                          <Badge tone="negative">venceu {dateShort(tarefa.dueOn as LocalDate)}</Badge>
                        ) : tarefa.dueOn ? (
                          <span className="text-caption text-ink-subtle">
                            {dateShort(tarefa.dueOn as LocalDate)}
                          </span>
                        ) : null}
                        {!tarefa.billable ? <Badge tone="neutral">não cobrável</Badge> : null}
                      </div>

                      <div className="mt-2 flex justify-between gap-1 pl-3.5">
                        {anterior ? (
                          <button
                            type="button"
                            disabled={salvando}
                            onClick={() => mover(tarefa.id, anterior.id)}
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
                            onClick={() => mover(tarefa.id, proxima.id)}
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
                    vazia
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
