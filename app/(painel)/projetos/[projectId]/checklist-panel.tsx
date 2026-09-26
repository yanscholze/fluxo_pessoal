"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { checklistProgress, stageProgress } from "../../../../core/domain/work/checklist.ts";
import { Button, Input } from "../../../ui/controls.tsx";
import { Empty, Panel, PanelHeader } from "../../../ui/primitives.tsx";
import { dateShort, decimal } from "../../../ui/format.ts";
import { Clock, Plus } from "../../../ui/icons.tsx";

type Group = { id: string; name: string; sortOrder: number };
type Task = { id: string; groupId: string | null; title: string; status: string; archivedAt: string | null; sortOrder: number };
type Entry = { id: string; taskId: string | null; workedOn: string; durationMilli: number; description: string };

export function ChecklistPanel({ projectId, groups, tasks, entries, onLog }: { projectId: string; groups: readonly Group[]; tasks: readonly Task[]; entries: readonly Entry[]; onLog: (taskId: string) => void }) {
  const router = useRouter();
  const [novaEtapa, setNovaEtapa] = useState("");
  const [novoItem, setNovoItem] = useState<Record<string, string>>({});
  const ativos = tasks.filter((task) => !task.archivedAt);
  const progresso = checklistProgress(ativos);
  async function chamar(url: string, method: string, body?: unknown) {
    const response = await fetch(url, { method, headers: { "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (response.ok) router.refresh();
  }
  async function adicionarEtapa() {
    if (!novaEtapa.trim()) return;
    await chamar(`/api/v1/projects/${projectId}/checklist-groups`, "POST", { name: novaEtapa }); setNovaEtapa("");
  }
  async function adicionarItem(groupId: string | null) {
    const title = novoItem[groupId ?? "none"]?.trim(); if (!title) return;
    await chamar(`/api/v1/projects/${projectId}/tasks`, "POST", { title, groupId });
    setNovoItem((state) => ({ ...state, [groupId ?? "none"]: "" }));
  }
  async function moverItem(groupId: string | null, taskId: string, direction: -1 | 1) {
    const siblings = ativos.filter((task) => task.groupId === groupId).sort((a, b) => a.sortOrder - b.sortOrder);
    const index = siblings.findIndex((task) => task.id === taskId);
    const neighbor = siblings[index + direction];
    if (!neighbor) return;
    await Promise.all([
      fetch(`/api/v1/tasks/${taskId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ sortOrder: neighbor.sortOrder }) }),
      fetch(`/api/v1/tasks/${neighbor.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ sortOrder: siblings[index]!.sortOrder }) }),
    ]);
    router.refresh();
  }
  const gruposVisiveis = [...groups, ...(ativos.some((task) => task.groupId === null) ? [{ id: "", name: "Sem etapa", sortOrder: Number.MAX_SAFE_INTEGER }] : [])];
  return <Panel>
    <PanelHeader title="Checklist do projeto" hint={`${progresso.completed}/${progresso.total} concluídas · ${progresso.percent}%`} />
    <div className="h-2 overflow-hidden rounded-full bg-surface-inset"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progresso.percent}%` }} /></div>
    {gruposVisiveis.map((group) => {
      const subset = ativos.filter((task) => task.groupId === (group.id || null));
      const progress = group.id ? stageProgress(ativos, group.id) : checklistProgress(subset);
      return <details key={group.id || "none"} open className="mt-4 rounded-lg border border-line p-3">
        <summary className="flex cursor-pointer list-none items-center gap-2">
          <span className="min-w-0 flex-1 font-medium text-ink">{group.name}</span><span className="text-caption text-ink-muted">{progress.completed}/{progress.total} · {progress.percent}%</span>
          {group.id ? <><button type="button" className="text-caption text-ink-muted hover:text-ink" aria-label={`Mover ${group.name} para cima`} onClick={(event) => { event.preventDefault(); const index = groups.findIndex((item) => item.id === group.id); const above = groups[index - 1]; if (above) void Promise.all([fetch(`/api/v1/projects/${projectId}/checklist-groups/${group.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ sortOrder: above.sortOrder }) }), fetch(`/api/v1/projects/${projectId}/checklist-groups/${above.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ sortOrder: group.sortOrder }) })]).then(() => router.refresh()); }}>↑</button><button type="button" className="text-caption text-ink-muted hover:text-ink" onClick={(event) => { event.preventDefault(); const name = window.prompt("Nome da etapa", group.name); if (name?.trim()) void chamar(`/api/v1/projects/${projectId}/checklist-groups/${group.id}`, "PATCH", { name }); }}>Editar</button><button type="button" className="text-caption text-negative" onClick={(event) => { event.preventDefault(); if (window.confirm("Remover etapa? Os itens e horas continuam no projeto, sem etapa.")) void chamar(`/api/v1/projects/${projectId}/checklist-groups/${group.id}`, "DELETE"); }}>Excluir</button></> : null}
        </summary>
        <div className="mt-2 space-y-1">
          {subset.map((task) => {
            const history = entries.filter((entry) => entry.taskId === task.id);
            const total = history.reduce((sum, entry) => sum + entry.durationMilli, 0);
            return <div key={task.id} className="rounded-md px-1 py-2 hover:bg-surface-inset">
              <div className="flex items-center gap-2"><input aria-label={`Concluir ${task.title}`} type="checkbox" checked={task.status === "done"} onChange={(event) => void chamar(`/api/v1/tasks/${task.id}`, "PATCH", { status: event.target.checked ? "done" : "todo" })} className="accent-accent" />
                <span className={`min-w-0 flex-1 text-body-sm ${task.status === "done" ? "text-ink-muted line-through" : "text-ink"}`}>{task.title}</span>
                <button type="button" className="text-caption text-ink-muted" aria-label={`Editar ${task.title}`} onClick={() => { const title = window.prompt("Nome do item", task.title); if (title?.trim()) void chamar(`/api/v1/tasks/${task.id}`, "PATCH", { title }); }}>Editar</button>
                <button type="button" className="text-caption text-ink-muted" aria-label={`Mover ${task.title} para cima`} onClick={() => void moverItem(group.id || null, task.id, -1)}>↑</button>
                <button type="button" className="text-caption text-ink-muted" aria-label={`Mover ${task.title} para baixo`} onClick={() => void moverItem(group.id || null, task.id, 1)}>↓</button>
                <span className="text-caption text-ink-muted">{decimal(total / 1000, 1)} h</span><button type="button" onClick={() => onLog(task.id)} className="text-accent" aria-label={`Registrar horas em ${task.title}`}><Clock size={15} /></button>
                <button type="button" className="text-caption text-negative" aria-label={`Arquivar ${task.title}`} onClick={() => { if (window.confirm("Arquivar este item? Os registros de horas serão preservados.")) void chamar(`/api/v1/tasks/${task.id}`, "DELETE"); }}>×</button>
              </div>
              {history.length ? <details className="ml-6 mt-1 text-caption text-ink-muted"><summary>{history.length} registro{history.length === 1 ? "" : "s"} de horas</summary>{history.map((entry) => <p key={entry.id} className="py-1">{dateShort(entry.workedOn as never)} · {decimal(entry.durationMilli / 1000, 1)} h · {entry.description}</p>)}</details> : null}
            </div>;
          })}
          <div className="flex gap-2 pt-2"><Input aria-label={`Novo item em ${group.name}`} value={novoItem[group.id || "none"] ?? ""} onChange={(event) => setNovoItem((state) => ({ ...state, [group.id || "none"]: event.target.value }))} placeholder="Adicionar item" onKeyDown={(event) => { if (event.key === "Enter") void adicionarItem(group.id || null); }} /><Button size="sm" icon={Plus} onClick={() => void adicionarItem(group.id || null)}>Adicionar</Button></div>
        </div>
      </details>;
    })}
    <div className="mt-4 flex gap-2"><Input aria-label="Nova etapa" value={novaEtapa} onChange={(event) => setNovaEtapa(event.target.value)} placeholder="Nova etapa" onKeyDown={(event) => { if (event.key === "Enter") void adicionarEtapa(); }} /><Button size="sm" icon={Plus} onClick={() => void adicionarEtapa()}>Etapa</Button></div>
    {tasks.some((task) => task.archivedAt) ? <details className="mt-3 text-caption text-ink-muted"><summary>Itens arquivados</summary>{tasks.filter((task) => task.archivedAt).map((task) => <p key={task.id} className="py-1">{task.title} · {entries.filter((entry) => entry.taskId === task.id).length} registros de horas preservados</p>)}</details> : null}
    {!tasks.length ? <Empty title="Checklist vazio" hint="Adicione etapas e itens para acompanhar o projeto." /> : null}
  </Panel>;
}
