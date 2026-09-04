"use client";

/**
 * Registro de horas.
 *
 * A duração é digitada em **minutos**, não em horas decimais. "90" é mais
 * rápido e menos ambíguo do que "1,5" — e evita a dúvida de quanto vale "1,25"
 * para quem está com pressa no fim do expediente.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Checkbox, Field, Input, Select } from "../../../ui/controls.tsx";
import { Dialog } from "../../../ui/dialog.tsx";
import { Clock } from "../../../ui/icons.tsx";
import { Notice } from "../../../ui/primitives.tsx";

/** Atalhos para as durações mais comuns. */
const ATALHOS = [15, 30, 60, 120, 240];

export function LogTime({
  projectId,
  tasks,
}: {
  projectId: string;
  tasks: readonly { id: string; title: string }[];
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const hoje = new Date().toISOString().slice(0, 10);
  const [data, setData] = useState(hoje);
  const [minutos, setMinutos] = useState("60");
  const [descricao, setDescricao] = useState("");
  const [tarefa, setTarefa] = useState("");
  const [cobravel, setCobravel] = useState(true);

  async function enviar() {
    setEnviando(true);
    setErro(null);

    const resposta = await fetch(`/api/v1/projects/${projectId}/time`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workedOn: data,
        minutes: Number(minutos),
        description: descricao,
        billable: cobravel,
        ...(tarefa ? { taskId: tarefa } : {}),
      }),
    });

    setEnviando(false);

    if (!resposta.ok) {
      const dados = (await resposta.json().catch(() => ({}))) as { error?: { message?: string } };
      setErro(dados.error?.message ?? "Não foi possível registrar as horas.");
      return;
    }

    setAberto(false);
    setDescricao("");
    setMinutos("60");
    router.refresh();
  }

  return (
    <>
      <Button variant="primary" icon={Clock} onClick={() => setAberto(true)}>
        Registrar horas
      </Button>

      <Dialog
        open={aberto}
        onClose={() => setAberto(false)}
        title="Registrar horas"
        description="O valor/hora do projeto é congelado no registro — reajuste depois não reescreve o passado."
        width="sm"
        footer={
          <Button variant="primary" busy={enviando} onClick={enviar}>
            Registrar
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
    </>
  );
}
