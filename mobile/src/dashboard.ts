export const DASHBOARD_WIDGET_IDS = [
  "free", "balance", "flow", "invoice", "commitments", "reserve", "goals",
  "planning", "categories", "cards", "assets", "investments", "subscriptions",
  "recent", "calendar",
] as const;

export type DashboardWidgetId = typeof DASHBOARD_WIDGET_IDS[number];
export type DashboardWidgetSize = "P" | "M" | "G";
export type DashboardWidgetPreference = { id: DashboardWidgetId; size: DashboardWidgetSize; visible: boolean };

export const DASHBOARD_WIDGET_LABELS: Record<DashboardWidgetId, string> = {
  free: "Livre para gastar",
  balance: "Saldo total",
  flow: "Fluxo do mês",
  invoice: "Fatura atual",
  commitments: "Próximos compromissos",
  reserve: "Reserva de emergência",
  goals: "Objetivos",
  planning: "Planejamento",
  categories: "Gastos por categoria",
  cards: "Cartões",
  assets: "Patrimônio",
  investments: "Investimentos",
  subscriptions: "Assinaturas",
  recent: "Últimos lançamentos",
  calendar: "Calendário financeiro",
};

const DEFAULT_SIZES: Record<DashboardWidgetId, DashboardWidgetSize> = {
  free: "G", balance: "P", flow: "M", invoice: "M", commitments: "M", reserve: "P",
  goals: "M", planning: "M", categories: "G", cards: "M", assets: "M", investments: "M",
  subscriptions: "M", recent: "G", calendar: "G",
};

const DEFAULT_VISIBLE = new Set<DashboardWidgetId>(["free", "balance", "flow", "invoice", "commitments", "reserve", "categories", "recent"]);

export const DEFAULT_DASHBOARD_LAYOUT: DashboardWidgetPreference[] = DASHBOARD_WIDGET_IDS.map((id) => ({
  id,
  size: DEFAULT_SIZES[id],
  visible: DEFAULT_VISIBLE.has(id),
}));

export function normalizeDashboardLayout(input: unknown): DashboardWidgetPreference[] {
  const parsed = Array.isArray(input) ? input : [];
  const seen = new Set<DashboardWidgetId>();
  const result: DashboardWidgetPreference[] = [];
  for (const raw of parsed) {
    if (!raw || typeof raw !== "object") continue;
    const candidate = raw as Partial<DashboardWidgetPreference>;
    if (!DASHBOARD_WIDGET_IDS.includes(candidate.id as DashboardWidgetId) || seen.has(candidate.id as DashboardWidgetId)) continue;
    const id = candidate.id as DashboardWidgetId;
    seen.add(id);
    result.push({ id, size: ["P", "M", "G"].includes(candidate.size ?? "") ? candidate.size as DashboardWidgetSize : DEFAULT_SIZES[id], visible: candidate.visible !== false });
  }
  for (const fallback of DEFAULT_DASHBOARD_LAYOUT) if (!seen.has(fallback.id)) result.push({ ...fallback });
  return result;
}

export function moveDashboardWidget(layout: DashboardWidgetPreference[], id: DashboardWidgetId, offset: number) {
  const from = layout.findIndex((item) => item.id === id);
  if (from < 0) return layout;
  const to = Math.max(0, Math.min(layout.length - 1, from + offset));
  if (from === to) return layout;
  const next = [...layout];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function updateDashboardWidget(layout: DashboardWidgetPreference[], id: DashboardWidgetId, changes: Partial<Omit<DashboardWidgetPreference, "id">>) {
  return layout.map((item) => item.id === id ? { ...item, ...changes } : item);
}

export function nextWidgetSize(size: DashboardWidgetSize) {
  return size === "P" ? "M" : size === "M" ? "G" : "P";
}
