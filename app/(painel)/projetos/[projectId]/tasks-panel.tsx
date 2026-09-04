"use client";

/**
 * Pendências do projeto.
 *
 * A lista é ordenada por prioridade e não por data de criação: quem abre esta
 * seção está perguntando "o que eu faço agora", e a resposta é a tarefa mais
 * urgente, não a mais antiga.
 *
 * Concluir é um clique na própria linha. Um menu de situações com cinco opções
 * seria mais completo e mais lento — e "feito" é 90% do que se marca. As outras
 * situações continuam existindo na API para quando a tela de quadro existir.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Checkbox, Field, Input, Select } from "../../../ui/controls.tsx";
import { Dialog } from "../../../ui/dialog.tsx";
import { dateShort } from "../../../ui/format.ts";
import { CircleAlert, Plus } from "../../../ui/icons.tsx";
import { Badge, Empty, Notice, Panel, PanelHeader, join, type Tone } from "../../../ui/primitives.tsx";
import type { LocalDate } from "../../../../core/time/local-date.ts";

const NATUREZA: Record<string, { label: string; tone: Tone }> = {
  feature: { label: "Funcionalidade", tone: "accent" },
  support: { label: "Suporte", tone: "info" },
  improvement: { label: "Melhoria", tone: "neutral" },
  chore: { label: "Manutenção", tone: "neutral" },
  bug: { label: "Correção", tone: "negative" },
};

const PRIORIDADE: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

export type TaskView = {
  readonly id: string;
  readonly title: string;
  readonly details: string | null;
  readonly kind: string;
  readonly priority: string;
  readonly status: string;
  readonly dueOn: string | null;
  readonly billable: boolean;
};

export function TasksPanel({ projectId, tasks }: { projectId: string; tasks: readonly TaskView[] }) {
  const router = useRouter();
  const [novaAberta, setNovaAberta] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /** Ids em trânsito, para a linha não parecer travada enquanto salva. */
  const [emTransito, setEmTransito] = useState<readonly string[]>([]);

  const [titulo, setTitulo] = useState("");
  const [natureza, setNatureza] = useState("feature");
  const [prioridade, setPrioridade] = useState("normal");
  const [prazo, setPrazo] = useState("");
  const [cobravel, setCobravel] = useState(true);

  const abertas = [...tasks]
    .filter((tarefa) => tarefa.status !== "done")
    .sort((esquerda, direita) => (PRIORIDADE[esquerda.priority] ?? 9) - (PRIORIDADE[direita.priority] ?? 9));

  const concluidas = tasks.filter((tarefa) => tarefa.status === "done");

  async function concluir(taskId: string) {
    setEmTransito((atual) => [...atual, taskId]);

    const resposta = await fetch(`/api/v1/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });

    setEmTransito((atual) => atual.filter((id) => id !== taskId));
    if (resposta.ok) router.refresh();
  }

  async function criar() {
    setEnviando(true);
    setErro(null);

    const resposta = await fetch(`/api/v1/projects/${projectId}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: titulo,
        kind: natureza,
        priority: prioridade,
        billable: String(cobravel),
        ...(prazo ? { dueOn: prazo } : {}),
      }),
    });

    setEnviando(false);

    if (!resposta.ok) {
      const dados = (await resposta.json().catch(() => ({}))) as { error?: { message?: string } };
      setErro(dados.error?.message ?? "Não foi possível criar a pendência.");
      return;
    }

    setNovaAberta(false);
    setTitulo("");
    setPrazo("");
    router.refresh();
  }

  return (
    <Panel>
      <PanelHeader
        title="Pendências"
        hint={`${abertas.length} em aberto${concluidas.length ? ` · ${concluidas.length} concluída${concluidas.length > 1 ? "s" : ""}` : ""}`}
        action={
          <Button size="sm" icon={Plus} onClick={() => setNovaAberta(true)}>
            Nova
          </Button>
        }
      />

      {abertas.length ? (
        <ul className="mt-1 divide-y divide-line">
          {abertas.map((tarefa) => {
            const tipo = NATUREZA[tarefa.kind] ?? { label: tarefa.kind, tone: "neutral" as Tone };
            const salvando = emTransito.includes(tarefa.id);

            return (
              <li key={tarefa.id} className="flex items-start gap-3 py-2.5">
                <button
                  type="button"
                  onClick={() => concluir(tarefa.id)}
                  disabled={salvando}
                  aria-label={`Concluir ${tarefa.title}`}
                  className={join(
                    "mt-0.5 size-4 shrink-0 rounded-xs border transition-colors",
                    salvando
                      ? "border-accent bg-accent-wash"
                      : "border-line-strong hover:border-accent hover:bg-accent-wash",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-body text-ink">{tarefa.title}</span>
                    <Badge tone={tipo.tone}>{tipo.label}</Badge>
                    {tarefa.priority === "urgent" ? <Badge tone="negative">urgente</Badge> : null}
                    {!tarefa.billable ? <Badge tone="neutral">não cobrável</Badge> : null}
                  </div>
                  {tarefa.details ? (
                    <p className="mt-0.5 text-caption text-ink-subtle">{tarefa.details}</p>
                  ) : null}
                </div>
                {tarefa.dueOn ? (
                  <span className="shrink-0 text-caption text-ink-subtle">
                    {dateShort(tarefa.dueOn as LocalDate)}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty icon={CircleAlert} title="Nada pendente" hint="Nenhuma tarefa em aberto neste projeto." />
      )}

      <Dialog
        open={novaAberta}
        onClose={() => setNovaAberta(false)}
        title="Nova pendência"
        description="Suporte nasce não cobrável — consertar o que deveria funcionar normalmente não se cobra."
        width="sm"
        footer={
          <Button variant="primary" busy={enviando} onClick={criar}>
            Criar
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label="O que precisa ser feito" htmlFor="tarefa-titulo">
            <Input
              id="tarefa-titulo"
              value={titulo}
              onChange={(evento) => setTitulo(evento.target.value)}
              placeholder="Corrigir o envio do formulário"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Natureza" htmlFor="tarefa-natureza">
              <Select
                id="tarefa-natureza"
                value={natureza}
                onChange={(evento) => {
                  const valor = evento.target.value;
                  setNatureza(valor);
                  // Acompanha o padrão do domínio para não haver duas verdades.
                  setCobravel(valor !== "support");
                }}
              >
                <option value="feature">Funcionalidade</option>
                <option value="support">Suporte</option>
                <option value="improvement">Melhoria</option>
                <option value="bug">Correção</option>
                <option value="chore">Manutenção</option>
              </Select>
            </Field>

            <Field label="Prioridade" htmlFor="tarefa-prioridade">
              <Select
                id="tarefa-prioridade"
                value={prioridade}
                onChange={(evento) => setPrioridade(evento.target.value)}
              >
                <option value="low">Baixa</option>
                <option value="normal">Normal</option>
                <option value="high">Alta</option>
                <option value="urgent">Urgente</option>
              </Select>
            </Field>
          </div>

          <Field label="Prazo" htmlFor="tarefa-prazo" hint="Opcional">
            <Input
              id="tarefa-prazo"
              type="date"
              value={prazo}
              onChange={(evento) => setPrazo(evento.target.value)}
            />
          </Field>

          <Checkbox
            checked={cobravel}
            onChange={(evento) => setCobravel(evento.target.checked)}
            label="Cobrável"
            hint="Decide se o tempo gasto nisto entra na próxima cobrança."
          />

          {erro ? <Notice tone="negative">{erro}</Notice> : null}
        </div>
      </Dialog>
    </Panel>
  );
}
