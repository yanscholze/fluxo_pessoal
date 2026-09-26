/** Modelo inicial de checklist; o progresso sempre vem do estado das tarefas. */
export const PROJECT_CHECKLIST_TEMPLATE = [
  { name: "Planejamento", tasks: ["Definir objetivo e escopo", "Definir requisitos principais", "Planejar arquitetura e estrutura"] },
  { name: "Desenvolvimento", tasks: ["Criar estrutura inicial", "Implementar funcionalidades principais", "Implementar interface", "Integrar banco, APIs e serviços"] },
  { name: "Validação", tasks: ["Testar funcionalidades principais", "Corrigir bugs encontrados", "Revisar experiência e interface"] },
  { name: "Finalização", tasks: ["Preparar ambiente final", "Fazer deploy ou distribuição", "Validar versão final", "Preparar documentação"] },
] as const;

export type ChecklistStage = { id: string; name: string; sortOrder: number };
export type ChecklistItem = { id: string; groupId: string | null; status: string; sortOrder: number; archivedAt?: string | null };
export type ChecklistProgress = { total: number; completed: number; percent: number };

export function checklistProgress(items: readonly ChecklistItem[]): ChecklistProgress {
  const active = items.filter((item) => !item.archivedAt);
  const total = active.length;
  const completed = active.filter((item) => item.status === "done").length;
  return { total, completed, percent: total === 0 ? 0 : Math.round((completed / total) * 100) };
}

export function stageProgress(items: readonly ChecklistItem[], groupId: string): ChecklistProgress {
  return checklistProgress(items.filter((item) => item.groupId === groupId));
}
