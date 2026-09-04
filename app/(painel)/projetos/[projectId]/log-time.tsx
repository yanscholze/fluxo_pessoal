"use client";

/**
 * Registro de horas.
 *
 * A duração é digitada em **minutos**, não em horas decimais. "90" é mais
 * rápido e menos ambíguo do que "1,5" — e evita a dúvida de quanto vale "1,25"
 * para quem está com pressa no fim do expediente.
 *
 * A categoria é obrigatória e vem pré-selecionada em desenvolvimento, que é o
 * caso mais comum. Ela é o que transforma "80 horas neste projeto" em
 * informação sobre a qual dá para decidir: oitenta de desenvolvimento é um
 * projeto que rendeu; oitenta com trinta de correção de bug é um projeto mal
 * orçado, e a diferença só existe se cada sessão disser a que veio.
 *
 * A sessão **não** guarda valor/hora. O que ela registra é que três horas
 * aconteceram numa terça-feira; quanto elas valeram é conta do relatório, feita
 * sobre a receita do projeto.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ACTIVITIES, ACTIVITY_LABEL, type Activity } from "../../../../core/domain/work/activity.ts";
import { Button, Checkbox, Field, Input, Select } from "../../../ui/controls.tsx";
import { Dialog } from "../../../ui/dialog.tsx";
import { Clock } from "../../../ui/icons.tsx";
import { Notice } from "../../../ui/primitives.tsx";

/** Atalhos para as durações mais comuns. */
const ATALHOS = [15, 30, 60, 120, 240];

export type Sessao = {
  readonly id: string;
  readonly workedOn: string;
  readonly durationMilli: number;
  readonly activity: string;
  readonly billable: boolean;
  readonly description: string;
  readonly taskId: string | null;
};

export function TimeEntryForm({
  open,
  onClose,
  projectId,
  tasks,
  sessao = null,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  tasks: readonly { id: string; title: string }[];
  /** Preenchida, o formulário corrige; nula, registra uma nova. */
  sessao?: Sessao | null;
}) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const hoje = new Date().toISOString().slice(0, 10);
  const [data, setData] = useState(sessao?.workedOn ?? hoje);
  const [minutos, setMinutos] = useState(
    sessao ? String(Math.round((sessao.durationMilli / 1000) * 60)) : "60",
  );
  const [descricao, setDescricao] = useState(sessao?.description ?? "");
  const [categoria, setCategoria] = useState<Activity>((sessao?.activity as Activity) ?? "development");
  const [tarefa, setTarefa] = useState(sessao?.taskId ?? "");
  const [cobravel, setCobravel] = useState(sessao?.billable ?? true);

  const editando = sessao !== null;

  async function enviar() {
    setEnviando(true);
    setErro(null);

    const resposta = await fetch(
      editando ? `/api/v1/time/${sessao.id}` : `/api/v1/projects/${projectId}/time`,
      {
        method: editando ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workedOn: data,
          minutes: Number(minutos),
          description: descricao,
          activity: categoria,
          // A rota de correção lê texto, porque `false` num campo opcional é
          // indistinguível de ausente quando o JSON chega como booleano.
          billable: editando ? String(cobravel) : cobravel,
          ...(tarefa ? { taskId: tarefa } : editando ? { taskId: "" } : {}),
        }),
      },
    );

    setEnviando(false);

    if (!resposta.ok) {
      const dados = (await resposta.json().catch(() => ({}))) as { error?: { message?: string } };
      setErro(dados.error?.message ?? "Não foi possível registrar as horas.");
      return;
    }

    onClose();
    if (!editando) {
      setDescricao("");
      setMinutos("60");
    }
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editando ? "Corrigir sessão" : "Registrar horas"}
      description="A categoria é o que separa desenvolvimento de retrabalho no relatório do projeto."
      width="sm"
      footer={
        <Button variant="primary" busy={enviando} onClick={enviar}>
          {editando ? "Salvar" : "Registrar"}
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="O que foi feito" htmlFor="hora-descricao">
          <Input
            id="hora-descricao"
            value={descricao}
            onChange={(evento) => setDescricao(evento.target.value)}
            placeholder="Ajuste do formulário de contato"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Data" htmlFor="hora-data">
            <Input
              id="hora-data"
              type="date"
              max={hoje}
              value={data}
              onChange={(evento) => setData(evento.target.value)}
            />
          </Field>

          <Field label="Minutos" htmlFor="hora-minutos">
            <Input
              id="hora-minutos"
              type="number"
              min={1}
              max={1440}
              value={minutos}
              onChange={(evento) => setMinutos(evento.target.value)}
            />
          </Field>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {ATALHOS.map((valor) => (
            <button
              key={valor}
              type="button"
              onClick={() => setMinutos(String(valor))}
              aria-pressed={minutos === String(valor)}
              className={`rounded-md border px-2.5 py-1 text-caption transition-colors ${
                minutos === String(valor)
                  ? "border-accent-edge bg-accent-wash text-ink"
                  : "border-line-strong bg-surface text-ink-muted hover:bg-surface-inset"
              }`}
            >
              {valor >= 60 ? `${valor / 60} h` : `${valor} min`}
            </button>
          ))}
        </div>

        <Field label="Categoria" htmlFor="hora-categoria" hint="Entra no relatório do projeto">
          <Select
            id="hora-categoria"
            value={categoria}
            onChange={(evento) => {
              const escolhida = evento.target.value as Activity;
              setCategoria(escolhida);
              // Suporte nasce não cobrável, como a tarefa de suporte: consertar
              // o que deveria funcionar normalmente não se cobra.
              if (escolhida === "support") setCobravel(false);
            }}
          >
            {ACTIVITIES.map((atividade) => (
              <option key={atividade} value={atividade}>
                {ACTIVITY_LABEL[atividade]}
              </option>
            ))}
          </Select>
        </Field>

        {tasks.length ? (
          <Field label="Tarefa" htmlFor="hora-tarefa" hint="Opcional">
            <Select
              id="hora-tarefa"
              value={tarefa}
              onChange={(evento) => setTarefa(evento.target.value)}
            >
              <option value="">Sem tarefa</option>
              {tasks.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <Checkbox
          checked={cobravel}
          onChange={(evento) => setCobravel(evento.target.checked)}
          label="Cobrável"
          hint="Retrabalho e cortesia entram no tempo, mas não no valor a cobrar."
        />

        {erro ? <Notice tone="negative">{erro}</Notice> : null}
      </div>
    </Dialog>
  );
}

export function LogTime({
  projectId,
  tasks,
}: {
  projectId: string;
  tasks: readonly { id: string; title: string }[];
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <Button variant="primary" icon={Clock} onClick={() => setAberto(true)}>
        Registrar horas
      </Button>

      <TimeEntryForm
        open={aberto}
        onClose={() => setAberto(false)}
        projectId={projectId}
        tasks={tasks}
      />
    </>
  );
}
