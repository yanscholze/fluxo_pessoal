export const DASHBOARD_WIDGET_IDS = ["free", "balance", "installments", "invoice", "next"] as const;

export type DashboardWidgetId = (typeof DASHBOARD_WIDGET_IDS)[number];

export const DEFAULT_DASHBOARD_WIDGET_ORDER: DashboardWidgetId[] = [...DASHBOARD_WIDGET_IDS];

export function normalizeDashboardWidgetOrder(value: unknown): DashboardWidgetId[] {
  const valid = new Set<string>(DASHBOARD_WIDGET_IDS);
  const received = Array.isArray(value) ? value.filter((item): item is DashboardWidgetId => typeof item === "string" && valid.has(item)) : [];
  const unique = [...new Set(received)];
  return [...unique, ...DASHBOARD_WIDGET_IDS.filter((id) => !unique.includes(id))];
}

export function reorderDashboardWidgets(order: DashboardWidgetId[], source: DashboardWidgetId, target: DashboardWidgetId) {
  const normalized = normalizeDashboardWidgetOrder(order);
  const sourceIndex = normalized.indexOf(source);
  const targetIndex = normalized.indexOf(target);
  if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return normalized;
  const next = [...normalized];
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);
  return next;
}
