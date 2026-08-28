/**
 * Orçamentos.
 *
 * Diferente do extrato, esta tela lê do servidor e não do banco local. O
 * orçamento não é sincronizado para o aparelho: ele é regra de planejamento, e
 * o gasto que o consome já mora no razão do servidor, calculado com projeção
 * pelos dias decorridos. Duplicar esse cálculo aqui criaria duas respostas para
 * "quanto ainda posso gastar" — que é justamente a pergunta que não pode ter
 * duas respostas.
 *
 * Sem rede, a tela diz isso em vez de mostrar número velho como se fosse atual.
 */

import { call } from "./client.ts";

export type BudgetLine = {
  readonly budgetId: string;
  readonly categoryId: string;
  readonly categoryName: string;
  readonly categoryColor: string;
  readonly amount: number;
  readonly spent: number;
  readonly available: number;
  readonly percentUsed: number;
  readonly projected: number;
  readonly willExceed: boolean;
  readonly daysElapsed: number;
  readonly daysInMonth: number;
};

export type BudgetsSnapshot = {
  readonly competence: string;
  readonly today: string;
  readonly budgets: readonly BudgetLine[];
  readonly totals: {
    readonly amount: number;
    readonly spent: number;
    readonly available: number;
    readonly percentUsed: number;
    readonly exceededCount: number;
    readonly atRiskCount: number;
  };
  readonly uncovered: readonly {
    readonly categoryId: string;
    readonly name: string;
    readonly color: string;
    readonly spentCents: number;
  }[];
};

export function fetchBudgets(input: { baseUrl: string; token: string }): Promise<BudgetsSnapshot> {
  return call<BudgetsSnapshot>("/api/v1/budgets", { baseUrl: input.baseUrl, token: input.token });
}
