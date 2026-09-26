-- Etapas do checklist ficam separadas; horas permanecem nas tarefas existentes.
CREATE TABLE project_checklist_groups (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX project_checklist_groups_user_project_idx ON project_checklist_groups(user_id, project_id);
ALTER TABLE project_tasks ADD COLUMN group_id TEXT REFERENCES project_checklist_groups(id) ON DELETE SET NULL;
ALTER TABLE project_tasks ADD COLUMN archived_at TEXT;
