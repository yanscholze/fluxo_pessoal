/**
 * Andamento dos projetos, no painel inicial.
 *
 * Só os abertos. Projeto encerrado é histórico, e histórico não é painel: ele
 * ocuparia a linha que deveria mostrar o que está pegando fogo hoje.
 *
 * Cada linha diz três coisas ao mesmo tempo — fase, prazo e quanto do dinheiro
 * já entrou — porque uma sozinha engana. Um projeto no prazo com zero recebido
 * é um problema; um atrasado já pago é outro, e os dois pedem ações opostas.
 *
 * A ordem é a mesma da tela de projetos: atrasado primeiro, depois o que vence
 * perto. Duas ordens diferentes para a mesma lista fazem desconfiar das duas.
 */

import Link from "next/link";

import { toHours } from "../../../core/domain/work/hours.ts";
import { PROJECT_STATUS_LABEL } from "../../../core/domain/work/status.ts";
import type { OpenProject } from "../../../server/services/dashboard.ts";
import { decimal, money, percent } from "../format.ts";
import { Briefcase, ChevronRight, Clock } from "../icons.tsx";
import { Badge, Empty, Meter, Panel, PanelHeader, type Tone } from "../primitives.tsx";

const PRAZO: Record<string, { texto: (dias: number | null) => string; tom: Tone }> = {
  atrasado: {
    texto: (dias) => `${Math.abs(dias ?? 0)} ${Math.abs(dias ?? 0) === 1 ? "dia" : "dias"} de atraso`,
    tom: "negative",
  },
  perto: {
    texto: (dias) => (dias === 0 ? "vence hoje" : `vence em ${dias} ${dias === 1 ? "dia" : "dias"}`),
    tom: "caution",
  },
  "no-prazo": {
    texto: (dias) => `${dias} dias de prazo`,
    tom: "positive",
  },
  entregue: { texto: () => "entregue", tom: "positive" },
  "sem-prazo": { texto: () => "sem prazo", tom: "neutral" },
};

export function ProjectsPanel({ projects }: { projects: readonly OpenProject[] }) {
  const atrasados = projects.filter((projeto) => projeto.deadlineStatus === "atrasado").length;

  return (
    <Panel>
      <PanelHeader
        title="Projetos em aberto"
        icon={Briefcase}
        hint={
          atrasados
            ? `${atrasados} com prazo vencido`
            : projects.length
              ? `${projects.length} em andamento`
              : undefined
        }
        action={
          <Link
            href="/projetos"
            className="inline-flex items-center gap-0.5 text-caption text-accent hover:underline"
          >
            Ver todos <ChevronRight className="size-3.5" />
          </Link>
        }
      />

      {projects.length ? (
        <ul className="divide-y divide-line">
          {projects.map((projeto) => {
            const prazo = PRAZO[projeto.deadlineStatus] ?? PRAZO["sem-prazo"];

            return (
              <li key={projeto.id}>
                <Link
                  href={`/projetos/${projeto.id}`}
                  className="-mx-2 block rounded-md px-2 py-2.5 transition-colors hover:bg-surface-inset"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: projeto.color }}
                        aria-hidden
                      />
                      <span className="truncate text-body text-ink">{projeto.name}</span>
                      <Badge tone="neutral">{PROJECT_STATUS_LABEL[projeto.status]}</Badge>
                    </span>

                    <Badge tone={prazo.tom}>{prazo.texto(projeto.daysLeft)}</Badge>
                  </div>

                  <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 text-caption text-ink-subtle">
                    <span className="truncate">
                      {projeto.clientName ?? "sem cliente"}
                      {projeto.workedMilli > 0 ? (
                        <>
                          {" · "}
                          <Clock className="inline size-3 align-[-1px]" aria-hidden />{" "}
                          {decimal(toHours(projeto.workedMilli), 1)} h
                        </>
                      ) : null}
                      {projeto.openTasks > 0
                        ? ` · ${projeto.openTasks} pendência${projeto.openTasks === 1 ? "" : "s"}`
                        : ""}
                    </span>

                    <span className="tabular shrink-0">
                      {projeto.contractedCents > 0
                        ? `${money(projeto.receivedCents)} de ${money(projeto.contractedCents)}`
                        : "sem contrato"}
                    </span>
                  </div>

                  {projeto.contractedCents > 0 ? (
                    <div className="mt-1.5">
                      <Meter
                        value={projeto.receivedCents}
                        total={projeto.contractedCents}
                        size="sm"
                        tone="positive"
                        label={`${projeto.name}: ${percent(projeto.percentReceived)} recebido`}
                      />
                    </div>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty
          icon={Briefcase}
          title="Nenhum projeto em aberto"
          hint="Os projetos em andamento aparecem aqui com prazo e quanto já entrou."
          compact
        />
      )}
    </Panel>
  );
}
