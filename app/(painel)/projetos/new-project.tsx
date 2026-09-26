"use client";

/**
 * Cadastro de projeto.
 *
 * Só o nome é obrigatório. Prazo, contrato e valor/hora são o que dá sentido
 * aos indicadores, mas exigir tudo na criação transformaria "anotar um projeto
 * novo" num formulário de dez campos — e o projeto acabaria não sendo anotado.
 * O resto se preenche depois, na página dele.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Field, Input, MoneyInput } from "../../ui/controls.tsx";
import { Dialog } from "../../ui/dialog.tsx";
import { Plus } from "../../ui/icons.tsx";
import { Notice } from "../../ui/primitives.tsx";
import { PROJECT_CHECKLIST_TEMPLATE } from "../../../core/domain/work/checklist.ts";

type EtapaRascunho = { id: string; name: string; tasks: string[] };

/** Converte "1.234,56" no inteiro de centavos que a API espera. */
function centavosDe(texto: string): number | null {
  const limpo = texto.trim();
  if (!limpo) return null;
  return Math.round(Number(limpo.replace(/\./g, "").replace(",", ".")) * 100);
}

export function NewProject() {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [nome, setNome] = useState("");
  const [prazo, setPrazo] = useState("");
  const [contrato, setContrato] = useState("");
  const [valorHora, setValorHora] = useState("");
  const [horas, setHoras] = useState("");
  const [repositorio, setRepositorio] = useState("");
  const [usarChecklist, setUsarChecklist] = useState(true);
  const [etapas, setEtapas] = useState<EtapaRascunho[]>(() => PROJECT_CHECKLIST_TEMPLATE.map((etapa) => ({ id: etapa.name, name: etapa.name, tasks: [...etapa.tasks] })));

  async function enviar() {
    setEnviando(true);
    setErro(null);

    const resposta = await fetch("/api/v1/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: nome,
        ...(prazo ? { dueOn: prazo } : {}),
        ...(centavosDe(contrato) !== null ? { contract: centavosDe(contrato) } : {}),
        ...(centavosDe(valorHora) !== null ? { hourlyRate: centavosDe(valorHora) } : {}),
        ...(horas ? { estimatedHours: Number(horas) } : {}),
        ...(repositorio ? { repositoryUrl: repositorio } : {}),
        useChecklistTemplate: false,
        ...(usarChecklist ? { checklist: etapas.map(({ name, tasks }) => ({ name, tasks })) } : {}),
      }),
    });

    setEnviando(false);

    if (!resposta.ok) {
      const dados = (await resposta.json().catch(() => ({}))) as { error?: { message?: string } };
      setErro(dados.error?.message ?? "Não foi possível criar o projeto.");
      return;
    }

    setAberto(false);
    setNome("");
    setPrazo("");
    setContrato("");
    setValorHora("");
    setHoras("");
    setRepositorio("");
    router.refresh();
  }

  return (
    <>
      <Button variant="primary" icon={Plus} onClick={() => setAberto(true)}>
        Novo projeto
      </Button>

      <Dialog
        open={aberto}
        onClose={() => setAberto(false)}
        title="Novo projeto"
        description="O contrato e o valor/hora alimentam a comparação entre o que foi combinado e o que aconteceu."
        footer={
          <Button variant="primary" busy={enviando} onClick={enviar}>
            Criar projeto
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label="Nome" htmlFor="projeto-nome">
            <Input
              id="projeto-nome"
              value={nome}
              onChange={(evento) => setNome(evento.target.value)}
              placeholder="Site institucional"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Valor contratado" htmlFor="projeto-contrato" hint="Opcional">
              <MoneyInput
                id="projeto-contrato"
                value={contrato}
                onChange={(evento) => setContrato(evento.target.value)}
              />
            </Field>

            <Field label="Valor por hora" htmlFor="projeto-hora" hint="Para comparar com o efetivo">
              <MoneyInput
                id="projeto-hora"
                value={valorHora}
                onChange={(evento) => setValorHora(evento.target.value)}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Prazo" htmlFor="projeto-prazo" hint="Opcional">
              <Input
                id="projeto-prazo"
                type="date"
                value={prazo}
                onChange={(evento) => setPrazo(evento.target.value)}
              />
            </Field>

            <Field label="Horas estimadas" htmlFor="projeto-horas" hint="Opcional">
              <Input
                id="projeto-horas"
                type="number"
                min={0}
                value={horas}
                onChange={(evento) => setHoras(evento.target.value)}
              />
            </Field>
          </div>

          <Field label="Repositório" htmlFor="projeto-repo" hint="Opcional">
            <Input
              id="projeto-repo"
              value={repositorio}
              onChange={(evento) => setRepositorio(evento.target.value)}
              placeholder="https://github.com/..."
            />
          </Field>

          <section className="rounded-lg border border-line p-3">
            <label className="flex items-start gap-2 text-body-sm font-medium text-ink">
              <input type="checkbox" checked={usarChecklist} onChange={(evento) => setUsarChecklist(evento.target.checked)} className="mt-1 accent-accent" />
              Usar checklist de desenvolvimento
            </label>
            <p className="mt-1 text-caption text-ink-muted">O progresso será calculado pelas tarefas concluídas. Você pode ajustar etapas e itens antes de criar.</p>
            {usarChecklist ? <div className="mt-3 space-y-3">
              {etapas.map((etapa, index) => <div key={etapa.id} className="rounded-md bg-surface-inset p-3">
                <div className="flex gap-2">
                  <Input aria-label="Nome da etapa" value={etapa.name} onChange={(evento) => setEtapas((atual) => atual.map((item, i) => i === index ? { ...item, name: evento.target.value } : item))} />
                  <Button size="sm" variant="ghost" aria-label="Mover etapa para cima" disabled={index === 0} onClick={() => setEtapas((atual) => { const next = [...atual]; [next[index - 1], next[index]] = [next[index]!, next[index - 1]!]; return next; })}>↑</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEtapas((atual) => atual.filter((_, i) => i !== index))}>Remover</Button>
                </div>
                <div className="mt-2 space-y-2">{etapa.tasks.map((tarefa, taskIndex) => <div key={`${taskIndex}-${tarefa}`} className="flex gap-2">
                  <Input aria-label="Item do checklist" value={tarefa} onChange={(evento) => setEtapas((atual) => atual.map((item, i) => i === index ? { ...item, tasks: item.tasks.map((task, j) => j === taskIndex ? evento.target.value : task) } : item))} />
                  <Button size="sm" variant="ghost" aria-label="Mover item para cima" disabled={taskIndex === 0} onClick={() => setEtapas((atual) => atual.map((item, i) => { if (i !== index) return item; const tasks = [...item.tasks]; [tasks[taskIndex - 1], tasks[taskIndex]] = [tasks[taskIndex]!, tasks[taskIndex - 1]!]; return { ...item, tasks }; }))}>↑</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEtapas((atual) => atual.map((item, i) => i === index ? { ...item, tasks: item.tasks.filter((_, j) => j !== taskIndex) } : item))}>×</Button>
                </div>)}</div>
                <Button size="sm" variant="secondary" className="mt-2" onClick={() => setEtapas((atual) => atual.map((item, i) => i === index ? { ...item, tasks: [...item.tasks, ""] } : item))}>Adicionar item</Button>
              </div>)}
              <Button size="sm" variant="secondary" onClick={() => setEtapas((atual) => [...atual, { id: `etapa-${Date.now()}`, name: "Nova etapa", tasks: [] }])}>Adicionar etapa</Button>
            </div> : null}
          </section>

          {erro ? <Notice tone="negative">{erro}</Notice> : null}
        </div>
      </Dialog>
    </>
  );
}
