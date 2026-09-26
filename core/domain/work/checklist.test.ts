import assert from "node:assert/strict";
import test from "node:test";
import { checklistProgress, stageProgress, PROJECT_CHECKLIST_TEMPLATE } from "./checklist.ts";

test("progresso deriva de tarefas concluídas e ignora arquivadas", () => {
  const items = [
    { id: "a", groupId: "g", status: "done", sortOrder: 0 },
    { id: "b", groupId: "g", status: "doing", sortOrder: 1 },
    { id: "c", groupId: "g", status: "done", sortOrder: 2, archivedAt: "agora" },
  ];
  assert.deepEqual(checklistProgress(items), { total: 2, completed: 1, percent: 50 });
  assert.deepEqual(stageProgress(items, "g"), { total: 2, completed: 1, percent: 50 });
});

test("checklist vazio informa zero e modelo inclui as quatro etapas", () => {
  assert.deepEqual(checklistProgress([]), { total: 0, completed: 0, percent: 0 });
  assert.deepEqual(PROJECT_CHECKLIST_TEMPLATE.map((stage) => stage.name), ["Planejamento", "Desenvolvimento", "Validação", "Finalização"]);
});
