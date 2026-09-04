"use client";

/**
 * As sessões de trabalho do projeto.
 *
 * Cada linha é um lançamento individual, e é editável. Lançar hora errada é a
 * regra, não a exceção: registra-se no fim do dia, de memória, e no dia
 * seguinte se percebe que foram três horas e não duas. Sem correção, o jeito
 * de consertar seria apagar e relançar — e o relatório de um projeto entregue
 * nunca fecharia com o que aconteceu.
 *
 * A categoria aparece em toda linha, com a cor fixa que ela tem no gráfico.
 * É o que permite ver de relance que a semana inteira foi correção de bug sem
 * abrir relatório nenhum.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ACTIVITY_COLOR, ACTIVITY_LABEL, type Activity } from "../../../../core/domain/work/activity.ts";
import { toHours, type Milli } from "../../../../core/domain/work/hours.ts";
import type { LocalDate } from "../../../../core/time/local-date.ts";
import { dateShort, decimal } from "../../../ui/format.ts";
import { Clock, Pencil, Trash2 } from "../../../ui/icons.tsx";
import { Badge, Empty, Notice, Panel, PanelHeader } from "../../../ui/primitives.tsx";
import { type Sessao, TimeEntryForm } from "./log-time.tsx";

/** Quantas sessões a tela do projeto mostra antes de mandar ao relatório. */
const VISIVEIS = 10;

export function SessionsPanel({
  projectId,
  sessions,
  tasks,
}: {
  projectId: string;
  sessions: readonly Sessao[];
  tasks: readonly { id: string; title: string }[];
}) {
  const router = useRouter();
  const [editando, setEditando] = useState<Sessao | null>(null);
  const [apagando, setApagando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function apagar(entryId: string) {
    setApagando(entryId);
    setErro(null);

    const resposta = await fetch(`/api/v1/time/${entryId}`, { method: "DELETE" });

    setApagando(null);

    if (!resposta.ok) {
      setErro("Não foi possível apagar a sessão.");
      return;
    }
    router.refresh();
  }

  const visiveis = sessions.slice(0, VISIVEIS);

  return (
    <Panel>
      <PanelHeader
        title="Horas registradas"
        icon={Clock}
        hint={
          sessions.length
            ? `${sessions.length} ${sessions.length === 1 ? "sessão" : "sessões"}`
            : undefined
        }
      />

      {erro ? <Notice tone="negative">{erro}</Notice> : null}

      {visiveis.length ? (
        <>
          <ul className="divide-y divide-line">
            {visiveis.map((sessao) => {
              const categoria = sessao.activity as Activity;

              return (
                <li key={sessao.id} className="flex items-center gap-2.5 py-2.5">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: ACTIVITY_COLOR[categoria] ?? "var(--color-line-strong)" }}
                    aria-hidden
                  />

                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-body-sm text-ink">{sessao.description}</span>
                      {!sessao.billable ? <Badge tone="neutral">não cobrável</Badge> : null}
                    </p>
                    <p className="truncate text-caption text-ink-subtle">
                      {dateShort(sessao.workedOn as LocalDate)} ·{" "}
                      {ACTIVITY_LABEL[categoria] ?? categoria}
                    </p>
                  </div>

                  <span className="tabular shrink-0 text-body-sm text-ink">
                    {decimal(toHours(sessao.durationMilli as Milli), 2)} h
                  </span>

                  <button
                    type="button"
                    onClick={() => setEditando(sessao)}
                    aria-label={`Corrigir ${sessao.description}`}
                    className="shrink-0 rounded-md p-1.5 text-ink-subtle transition-colors hover:bg-surface-sunken hover:text-ink"
                  >
                    <Pencil className="size-4" />
                  </button>

                  <button
                    type="button"
                    disabled={apagando === sessao.id}
                    onClick={() => apagar(sessao.id)}
                    aria-label={`Apagar ${sessao.description}`}
                    className="shrink-0 rounded-md p-1.5 text-ink-subtle transition-colors hover:bg-surface-sunken hover:text-negative disabled:opacity-50"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>

          {sessions.length > VISIVEIS ? (
            <p className="mt-3 text-caption text-ink-subtle">
              Mais {sessions.length - VISIVEIS}{" "}
              {sessions.length - VISIVEIS === 1 ? "sessão" : "sessões"} no relatório de horas.
            </p>
          ) : null}
        </>
      ) : (
        <Empty
          icon={Clock}
          title="Nenhuma hora registrada"
          hint="Registre o tempo para comparar com o estimado e saber quanto a hora rendeu de verdade."
          compact
        />
      )}

      {editando ? (
        <TimeEntryForm
          // A chave força um formulário novo a cada sessão escolhida: sem ela,
          // o estado inicial ficaria preso na primeira que foi aberta.
          key={editando.id}
          open
          onClose={() => setEditando(null)}
          projectId={projectId}
          tasks={tasks}
          sessao={editando}
        />
      ) : null}
    </Panel>
  );
}
