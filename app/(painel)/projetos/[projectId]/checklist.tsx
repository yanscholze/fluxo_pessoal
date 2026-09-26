"use client";

import { useState } from "react";
import { ChecklistPanel } from "./checklist-panel.tsx";
import { TimeEntryForm } from "./log-time.tsx";

export function Checklist({ projectId, groups, tasks, entries }: { projectId: string; groups: readonly { id: string; name: string; sortOrder: number }[]; tasks: readonly { id: string; groupId: string | null; title: string; status: string; archivedAt: string | null; sortOrder: number }[]; entries: readonly { id: string; taskId: string | null; workedOn: string; durationMilli: number; description: string }[] }) {
  const [taskId, setTaskId] = useState<string | null>(null);
  const active = tasks.filter((task) => !task.archivedAt && task.status !== "done");
  const selected = active.find((task) => task.id === taskId);
  return <>
    <ChecklistPanel projectId={projectId} groups={groups} tasks={tasks} entries={entries} onLog={setTaskId} />
    {selected ? <TimeEntryForm key={selected.id} open onClose={() => setTaskId(null)} projectId={projectId} tasks={[{ id: selected.id, title: selected.title }]} initialTaskId={selected.id} /> : null}
  </>;
}
