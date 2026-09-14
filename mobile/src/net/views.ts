/**
 * As visões que o servidor calcula e o aplicativo só desenha.
 *
 * Nenhuma delas passa pelo sync: o protocolo carrega lançamento e nada mais
 * (`core/domain/sync/protocol.ts`). Isso não é limitação a contornar — é a
 * decisão que impede duas respostas para a mesma pergunta. Saúde, patrimônio,
 * parcelamento e relatório dependem de projeção, ciclo de fatura e política de
 * exclusão; recalcular tudo isso no aparelho criaria um segundo número, e o
 * usuário não teria como saber qual acreditar.
 *
 * O preço é honesto: sem rede, estas telas dizem que não sabem, em vez de
 * mostrar um número velho com cara de atual.
 *
 * Os tipos aqui declaram **o que o aplicativo consome**, não o que o servidor
 * devolve. Copiar a definição inteira do serviço acoplaria o aparelho a campos
 * que ele nunca desenha, e cada campo novo no servidor viraria uma atualização
 * obrigatória do aplicativo.
 */

import { call } from "./client.ts";

// --- saúde -------------------------------------------------------------------

export type HealthSignal = {
  readonly key: string;
  readonly title: string;
  readonly status: "bom" | "atencao" | "critico";
  readonly detail: string;
};

export type AgendaEvent = {
  readonly date: string;
  readonly description: string;
  readonly amountCents: number;
  readonly direction: "in" | "out";
  readonly kind: "recorrencia" | "fatura" | "parcela" | "previsto";
};

export type HealthView = {
  readonly today: string;
  readonly freeToSpendCents: number;
  readonly reserve: {
    readonly currentCents: number;
    readonly targetCents: number;
    readonly percent: number;
    readonly monthsCovered: number;
  };
  readonly savingsRatePercent: number;
  readonly commitment: { readonly percent: number; readonly committedCents: number };
  readonly debts: {
    readonly cardDebtCents: number;
    readonly overdueInvoices: number;
    readonly openInstallmentsCents: number;
  };
  readonly netWorthCents: number;
  readonly signals: readonly HealthSignal[];
  readonly agenda: readonly AgendaEvent[];
};

// --- patrimônio --------------------------------------------------------------

export type HoldingView = {
  readonly id: string;
  readonly name: string;
  readonly institution: string;
  readonly kind: string;
  readonly color: string;
  readonly balanceCents: number;
  readonly sharePercent: number;
};

export type NetWorthView = {
  readonly netWorthCents: number;
  readonly assetsCents: number;
  readonly liabilitiesCents: number;
  readonly liquidCents: number;
  readonly investedCents: number;
  readonly holdings: readonly HoldingView[];
  readonly liabilities: readonly { readonly id: string; readonly name: string; readonly amountCents: number }[];
  readonly history: readonly { readonly competence: string; readonly netCents: number }[];
  readonly changeCents: number;
  readonly changePercent: number | null;
};

// --- parcelamentos -----------------------------------------------------------

export type InstallmentPlanView = {
  readonly planId: string;
  readonly label: string;
  readonly cardName: string;
  readonly totalAmount: number;
  readonly paidAmount: number;
  readonly openAmount: number;
  readonly paidCount: number;
  readonly totalCount: number;
  readonly overdueCount: number;
  readonly percentPaid: number;
  readonly nextDueDate: string | null;
  readonly isSettled: boolean;
};

export type InstallmentsView = {
  readonly today: string;
  readonly active: readonly InstallmentPlanView[];
  readonly settled: readonly InstallmentPlanView[];
  readonly totals: {
    readonly totalCents: number;
    readonly paidCents: number;
    readonly openCents: number;
    readonly percentPaid: number;
  };
  readonly commitment: readonly { readonly competence: string; readonly amountCents: number }[];
};

// --- planejamento ------------------------------------------------------------

export type RecurrenceView = {
  readonly id: string;
  readonly kind: "expense" | "income" | "transfer";
  readonly description: string;
  readonly amountCents: number;
  readonly scheduleLabel: string;
  readonly isActive: boolean;
  readonly originName: string;
  readonly categoryName: string | null;
  readonly next: { readonly date: string; readonly amountCents: number } | null;
  /** Ocorrência da competência corrente ainda não confirmada. */
  readonly pending: { readonly competence: string; readonly date: string; readonly amountCents: number } | null;
};

export type PlanningView = {
  readonly today: string;
  readonly competence: string;
  readonly recurrences: readonly RecurrenceView[];
  readonly projection: readonly {
    readonly competence: string;
    readonly incomeCents: number;
    readonly committedCents: number;
    readonly freeCents: number;
  }[];
  readonly subscriptions: {
    readonly activeCount: number;
    readonly monthlyCents: number;
    readonly yearlyCents: number;
    readonly next7DaysCents: number;
    readonly upcoming: readonly {
      readonly recurrenceId: string;
      readonly description: string;
      readonly date: string;
      readonly amountCents: number;
    }[];
  };
};

// --- relatório ---------------------------------------------------------------

export type ReportPeriod = "mes" | "3m" | "6m" | "12m" | "todos";

export type CategoryBreakdown = {
  readonly categoryId: string | null;
  readonly name: string;
  readonly color: string;
  readonly amountCents: number;
  readonly percent: number;
  readonly transactionCount: number;
};

export type ReportView = {
  readonly period: ReportPeriod;
  readonly indicators: {
    readonly incomeCents: number;
    readonly expenseCents: number;
    readonly netCents: number;
    readonly savingsRatePercent: number;
    readonly averageMonthlyExpenseCents: number;
    readonly transactionCount: number;
  };
  readonly monthly: readonly {
    readonly competence: string;
    readonly incomeCents: number;
    readonly expenseCents: number;
    readonly netCents: number;
  }[];
  readonly expensesByCategory: readonly CategoryBreakdown[];
  readonly incomeByCategory: readonly CategoryBreakdown[];
  readonly insights: readonly string[];
};

// --- trabalho ----------------------------------------------------------------

export type BoardTask = {
  readonly id: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly projectColor: string | null;
  readonly clientName: string | null;
  readonly title: string;
  readonly kind: string;
  readonly priority: string;
  readonly status: string;
  readonly dueOn: string | null;
  readonly billable: boolean;
  readonly isLate: boolean;
};

export type BoardView = {
  readonly today: string;
  readonly tasks: readonly BoardTask[];
  readonly projects: readonly { readonly id: string; readonly name: string; readonly color: string | null }[];
};

// --- chamadas ----------------------------------------------------------------

type Credenciais = { readonly baseUrl: string; readonly token: string };

const buscar = <T>(caminho: string, { baseUrl, token }: Credenciais): Promise<T> =>
  call<T>(caminho, { baseUrl, token });

export const fetchHealth = (c: Credenciais) => buscar<HealthView>("/api/v1/health", c);
export const fetchNetWorth = (c: Credenciais) => buscar<NetWorthView>("/api/v1/networth", c);
export const fetchInstallments = (c: Credenciais) => buscar<InstallmentsView>("/api/v1/installments", c);
export const fetchPlanning = (c: Credenciais) => buscar<PlanningView>("/api/v1/planning", c);
export const fetchBoard = (c: Credenciais) => buscar<BoardView>("/api/v1/work/board", c);

export const fetchReport = (c: Credenciais, periodo: ReportPeriod = "6m") =>
  buscar<ReportView>(`/api/v1/reports?periodo=${periodo}`, c);

// --- contas, metas, investimentos, recompensas, viagens, automações ---------

export type ContaView = {
  readonly id: string;
  readonly name: string;
  readonly institution: string;
  readonly kind: string;
  readonly color: string;
  readonly balanceCents: number;
  readonly includeInTotals: boolean;
};

export type MetaView = {
  readonly goalId: string;
  readonly name: string;
  readonly target: number;
  readonly current: number;
  readonly remaining: number;
  readonly percent: number;
  readonly isAchieved: boolean;
  readonly monthsRemaining: number | null;
  readonly color: string;
  readonly accountName: string | null;
};

export type MetasView = {
  readonly goals: readonly MetaView[];
  readonly totals: { readonly target: number; readonly current: number; readonly percent: number };
};

export type InvestimentoView = {
  readonly id: string;
  readonly name: string;
  readonly institution: string;
  readonly assetClass: string;
  readonly principalCents: number;
  readonly currentValueCents: number;
  readonly yieldCents: number;
  readonly yieldPercent: number;
  readonly sharePercent: number;
};

export type InvestimentosView = {
  readonly investments: readonly InvestimentoView[];
  readonly totals: {
    readonly principalCents: number;
    readonly currentValueCents: number;
    readonly yieldCents: number;
    readonly yieldPercent: number;
  };
  readonly byClass: readonly { readonly label: string; readonly valueCents: number; readonly percent: number }[];
};

export type RecompensaView = {
  readonly cardId: string;
  readonly cardName: string;
  readonly balance: {
    readonly pointsBalance?: number;
    readonly cashbackCents?: number;
    readonly pointsEarned?: number;
  };
};

export type RecompensasView = { readonly cards: readonly RecompensaView[] };

export type ViagemView = {
  readonly id: string;
  readonly name: string;
  readonly startsOn: string | null;
  readonly endsOn: string | null;
  readonly spentCents: number;
  readonly budgetCents: number | null;
};

export type ViagensView = { readonly trips: readonly ViagemView[] };

export type AutomacaoView = {
  readonly id: string;
  readonly payerName: string;
  readonly target: string;
  readonly isActive?: boolean;
  readonly lastMatchedAt?: string | null;
};

export const fetchContas = (c: Credenciais) => buscar<readonly ContaView[]>("/api/v1/accounts", c);
export const fetchMetas = (c: Credenciais) => buscar<MetasView>("/api/v1/goals", c);
export const fetchInvestimentos = (c: Credenciais) => buscar<InvestimentosView>("/api/v1/investments", c);
export const fetchRecompensas = (c: Credenciais) => buscar<RecompensasView>("/api/v1/rewards", c);
export const fetchViagens = (c: Credenciais) => buscar<ViagensView>("/api/v1/trips", c);
export const fetchAutomacoes = (c: Credenciais) => buscar<readonly AutomacaoView[]>("/api/v1/receipt-rules", c);

// --- painel ------------------------------------------------------------------

/**
 * O painel, calculado no servidor.
 *
 * O aplicativo tinha o seu próprio: derivava "livre para gastar" do razão
 * sincronizado, chamando a mesma função de domínio que o site chama. Mesma
 * função, entradas diferentes — o sync carrega lançamento e mais nada, então o
 * aparelho não sabia quais categorias ficam fora da folga nem que o vale é um
 * bolso à parte. O resultado foi o site dizendo R$ 951,27 e o celular dizendo
 * -R$ 2.556,47 para o mesmo dinheiro, no mesmo dia.
 *
 * Número que o usuário compara entre duas telas precisa vir de um lugar só. O
 * razão local continua servindo para ver o extrato sem rede e para enfileirar
 * lançamento offline; a **conta** é do servidor.
 */
export type DashboardView = {
  readonly today: string;
  readonly competence: string;
  readonly freeToSpend: {
    readonly amountCents: number;
    readonly liquidBalanceCents: number;
    readonly pendingIncomeCents: number;
    readonly openInvoicesCents: number;
    readonly otherCommitmentsCents: number;
    readonly windowStart: string;
    readonly windowEnd: string;
  };
  readonly benefitFreeToSpend: { readonly amountCents: number; readonly liquidBalanceCents: number } | null;
  readonly position: {
    readonly currentBalanceCents: number;
    readonly committedCents: number;
    readonly investmentsCents: number;
    readonly netWorthCents: number;
  };
  readonly monthFlow: {
    readonly incomeCents: number;
    readonly expenseCents: number;
    readonly netCents: number;
  };
  readonly categorySpend: readonly {
    readonly categoryId: string | null;
    readonly name: string;
    readonly color: string;
    readonly amountCents: number;
    readonly percent: number;
  }[];
  readonly cards: readonly {
    readonly id: string;
    readonly name: string;
    readonly kind: string;
    readonly color: string;
    readonly daysUntilClosing: number;
    readonly currentInvoice: {
      readonly competence: string;
      readonly closingDate: string;
      readonly dueDate: string;
      readonly outstandingCents: number;
      readonly isSettled: boolean;
    } | null;
  }[];
  readonly upcoming: readonly {
    readonly date: string;
    readonly description: string;
    readonly amountCents: number;
    readonly kind: string;
  }[];
  readonly cashflow: readonly {
    readonly competence: string;
    readonly inflowCents: number;
    readonly outflowCents: number;
  }[];
  /**
   * As pendências em aberto, já prontas para a tela.
   *
   * Vêm junto com o painel de propósito: uma chamada a mais só para as tarefas
   * gastaria uma volta de rede inteira para cinco linhas de texto, e o painel
   * já carrega tudo o que a primeira tela mostra.
   */
  readonly openTasks: readonly BoardTask[];
};

export const fetchDashboard = (c: Credenciais) => buscar<DashboardView>("/api/v1/dashboard", c);

// --- projetos ----------------------------------------------------------------

export type ProjetoView = {
  readonly id: string;
  readonly name: string;
  readonly clientName: string | null;
  readonly status: string;
  readonly color: string | null;
  readonly dueOn: string | null;
  readonly openTasks: number;
  readonly contractedCents: number;
  readonly receivedCents: number;
  readonly pendingCents: number;
  readonly overdueCents: number;
  readonly percentReceived: number;
  readonly workedMilli: number;
  readonly estimatedMilli: number;
  readonly overrun: boolean;
};

export type ProjetosView = {
  readonly projects: readonly ProjetoView[];
  readonly totals: {
    readonly activeProjects: number;
    readonly contractedCents: number;
    readonly receivedCents: number;
    readonly pendingCents: number;
    readonly overdueCents: number;
    readonly unscheduledCents: number;
    readonly lateProjects: number;
    readonly weekMilli: number;
  };
};

export const fetchProjetos = (c: Credenciais) => buscar<ProjetosView>("/api/v1/projects", c);

// --- assinaturas -------------------------------------------------------------

export type RotuloDeAssinatura = { readonly id: string; readonly name: string; readonly color: string };

export type AssinaturaView = {
  readonly id: string;
  readonly description: string;
  readonly amountCents: number;
  readonly monthlyCents: number;
  readonly yearlyCents: number;
  readonly interval: "monthly" | "yearly";
  readonly scheduleDay: number;
  readonly isActive: boolean;
  readonly cardName: string | null;
  readonly label: RotuloDeAssinatura | null;
};

export type AssinaturasView = {
  readonly competence: string;
  readonly subscriptions: readonly AssinaturaView[];
  readonly byLabel: readonly {
    readonly label: RotuloDeAssinatura;
    readonly monthlyCents: number;
    readonly yearlyCents: number;
    readonly count: number;
    readonly sharePercent: number;
  }[];
  readonly totals: {
    readonly monthlyCents: number;
    readonly yearlyCents: number;
    readonly activeCount: number;
    readonly pausedCount: number;
  };
};

export const fetchAssinaturas = (c: Credenciais) => buscar<AssinaturasView>("/api/v1/subscriptions", c);

// --- assistente --------------------------------------------------------------

export type RespostaDoAssistente = {
  readonly answer: string;
  readonly summary: string;
  readonly actions: readonly {
    readonly label: string;
    readonly reason: string;
    readonly priority: "alta" | "media" | "baixa";
  }[];
  readonly warnings: readonly string[];
  readonly remaining?: number;
};

export type EstadoDoAssistente = {
  readonly configured: boolean;
  readonly advice: { readonly remaining: number; readonly limit: number };
  readonly receipt: { readonly remaining: number; readonly limit: number };
};

export const fetchAssistente = (c: Credenciais) => buscar<EstadoDoAssistente>("/api/v1/assistant", c);

// --- importações -------------------------------------------------------------

export type LoteDeImportacao = {
  readonly id: string;
  readonly filename: string;
  readonly format: "ofx" | "csv";
  readonly status: "review" | "committed" | "discarded";
  readonly targetName: string;
  readonly competence: string | null;
  readonly createdAt: string;
  readonly counts: {
    readonly found: number;
    readonly fresh: number;
    readonly duplicates: number;
    readonly withoutCategory: number;
    readonly possibleTransfers: number;
    readonly discarded: number;
  };
};

export const fetchImportacoes = (c: Credenciais) =>
  buscar<readonly LoteDeImportacao[]>("/api/v1/imports", c);
