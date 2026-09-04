/**
 * A situação de um projeto.
 *
 * Existia em três listas que divergiam entre si: o enum do banco, a lista de
 * validação de cada rota e o filtro da tela — que discordavam sobre o que conta
 * como projeto de pé. O KPI dizia três em andamento e a lista mostrava cinco.
 * Agora a lista é uma só, e as três a importam.
 *
 * O miolo é a fase do trabalho, na ordem em que ela acontece:
 *
 *   em desenvolvimento → testes → ajustes → entregue
 *
 * Separar **testes** de **ajustes** importa porque são esperas diferentes. Em
 * testes o trabalho está com você e depende do seu tempo; em ajustes ele já
 * voltou de alguém, e o que falta é uma lista finita de correções. Chamar os
 * dois de "em desenvolvimento" esconde justamente a fase em que os projetos
 * costumam encalhar.
 *
 * **Concluído** é o fim: o projeto sai da lista de abertos e vira histórico.
 * Não é o mesmo que entregue — entre entregar e encerrar existe o período em
 * que ainda se conserta o que o cliente encontrou, e é ele que consome as
 * horas que ninguém orçou.
 */

export const PROJECT_STATUSES = [
  "lead",
  "proposal",
  "active",
  "testing",
  "adjustments",
  "waiting_client",
  "paused",
  "delivered",
  "support",
  "done",
  "cancelled",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  lead: "Prospecção",
  proposal: "Proposta",
  active: "Em desenvolvimento",
  testing: "Testes",
  adjustments: "Ajustes",
  waiting_client: "Aguardando cliente",
  paused: "Pausado",
  delivered: "Entregue",
  support: "Suporte",
  done: "Concluído",
  cancelled: "Cancelado",
};

/**
 * As situações em que o projeto ainda é trabalho, e não histórico.
 *
 * `delivered` está aqui de propósito: entregue não é encerrado. O projeto
 * entregue continua consumindo tempo — o cliente responde, encontra coisas,
 * pede um último ajuste — e some da lista de abertos só quando alguém decide
 * que acabou. Encerrar é uma decisão, não uma consequência de entregar.
 */
const ABERTOS: readonly ProjectStatus[] = [
  "lead",
  "proposal",
  "active",
  "testing",
  "adjustments",
  "waiting_client",
  "paused",
  "delivered",
  "support",
];

export function isOpenStatus(status: string): boolean {
  return ABERTOS.includes(status as ProjectStatus);
}

/** Encerrado: saiu da fila de trabalho, com ou sem entrega. */
export function isClosedStatus(status: string): boolean {
  return status === "done" || status === "cancelled";
}

/**
 * As fases do trabalho em si, na ordem.
 *
 * É o que o seletor de situação oferece em destaque — prospecção e proposta
 * são de antes do projeto existir, e pausado e cancelado são desvios.
 */
export const WORK_PHASES: readonly ProjectStatus[] = [
  "active",
  "testing",
  "adjustments",
  "delivered",
];

/**
 * A fase seguinte, para o botão de avançar.
 *
 * `null` no fim da linha: depois de entregue vem encerrar, que é outra ação e
 * pede confirmação — avançar por engano até "concluído" tiraria o projeto da
 * tela sem que ninguém tenha decidido isso.
 */
export function nextPhase(status: string): ProjectStatus | null {
  const indice = WORK_PHASES.indexOf(status as ProjectStatus);
  if (indice === -1 || indice === WORK_PHASES.length - 1) return null;
  return WORK_PHASES[indice + 1];
}

/** Lê a situação vinda da borda, caindo em `active` quando não reconhece. */
export function toProjectStatus(value: string | null | undefined): ProjectStatus {
  return PROJECT_STATUSES.includes(value as ProjectStatus) ? (value as ProjectStatus) : "active";
}
