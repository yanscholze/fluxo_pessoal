/**
 * Em que o tempo foi gasto.
 *
 * A categoria da sessão é o que transforma "80 horas neste projeto" em uma
 * informação sobre a qual dá para decidir. Oitenta horas de desenvolvimento é
 * um projeto que rendeu; oitenta horas em que trinta foram correção de bug e
 * quinze foram reunião é um projeto mal orçado, e a diferença só aparece se
 * cada sessão disser a que veio.
 *
 * A lista é fechada, e não de texto livre. Categoria digitada à mão vira
 * "reunião", "reuniao", "Reunião com cliente" e "call" — quatro linhas no
 * relatório para a mesma coisa, e o percentual por categoria deixa de somar
 * cem por cento de nada.
 */

/** As categorias de trabalho, na ordem em que aparecem no relatório. */
export const ACTIVITIES = [
  "development",
  "bugs",
  "improvements",
  "integration",
  "deploy",
  "support",
  "meeting",
  "research",
  "documentation",
  "other",
] as const;

export type Activity = (typeof ACTIVITIES)[number];

export const ACTIVITY_LABEL: Record<Activity, string> = {
  development: "Desenvolvimento",
  bugs: "Correção de bugs",
  improvements: "Melhorias",
  integration: "Integração",
  deploy: "Deploy",
  support: "Suporte",
  meeting: "Reunião",
  research: "Pesquisa",
  documentation: "Documentação",
  other: "Outros",
};

/**
 * Cor de cada categoria, fixa.
 *
 * Fixa porque o gráfico é lido de relance e comparado entre projetos: se
 * "correção de bugs" for vermelha num projeto e azul no seguinte, a leitura
 * rápida — "esta fatia grande é retrabalho" — deixa de existir.
 */
export const ACTIVITY_COLOR: Record<Activity, string> = {
  development: "#6366f1",
  bugs: "#e11d48",
  improvements: "#0ea5e9",
  integration: "#8b5cf6",
  deploy: "#f59e0b",
  support: "#f97316",
  meeting: "#64748b",
  research: "#14b8a6",
  documentation: "#22c55e",
  other: "#94a3b8",
};

/**
 * Categorias que não produzem entrega.
 *
 * Não é juízo sobre o valor delas — reunião e pesquisa são trabalho, e cobrar
 * por elas é legítimo. É que a proporção entre o tempo que vira código e o que
 * não vira é o número que diz se o projeto foi mal orçado, e ele precisa de um
 * recorte para existir.
 */
const SEM_ENTREGA: readonly Activity[] = ["meeting", "research", "documentation", "other"];

export function isDelivery(activity: Activity): boolean {
  return !SEM_ENTREGA.includes(activity);
}

/**
 * Categorias que são retrabalho.
 *
 * Corrigir o que já deveria funcionar não é avanço: é custo de algo que passou.
 * Separá-lo do desenvolvimento é o que permite ver que o projeto de sessenta
 * horas gastou vinte consertando as outras quarenta.
 */
const RETRABALHO: readonly Activity[] = ["bugs", "support"];

export function isRework(activity: Activity): boolean {
  return RETRABALHO.includes(activity);
}

/** Lê a categoria vinda da borda, caindo em `other` quando não reconhece. */
export function toActivity(value: string | null | undefined): Activity {
  return ACTIVITIES.includes(value as Activity) ? (value as Activity) : "other";
}
