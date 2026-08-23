import type { BusinessDayAdjustment, ScheduleMode } from "./brazil-calendar";

export type TransactionType = "expense" | "income" | "transfer";
export type PaymentMethod = "credit" | "debit" | "cash" | "transfer" | "other";

export type FinanceTransaction = {
  id: string;
  description: string;
  category: string;
  account: string;
  destinationAccount?: string;
  date: string;
  amount: number;
  type: TransactionType;
  paymentMethod?: PaymentMethod;
  cardId?: string;
  tripId?: string;
  invoiceMonth?: string;
  installments?: string;
  /** Identifica todas as parcelas originadas da mesma compra. */
  installmentGroupId?: string;
  /** Identifica o arquivo de fatura que criou este conjunto de lançamentos. */
  importBatchId?: string;
  importBatchName?: string;
  importBatchMonth?: string;
  importedAt?: string;
  status?: "confirmed" | "planned";
  source?: "manual" | "import" | "recurring" | "invoice-payment" | "account-transfer" | "notification";
  fingerprint?: string;
  rewardPoints?: number;
  rewardCashback?: number;
  rewardUsdRate?: number;
  version?: number;
  updatedAt?: string;
  deletedAt?: string;
  deviceId?: string;
  pendingSync?: boolean;
  /** true quando o lançamento foi criado automaticamente a partir de uma notificação. */
  autoImported?: boolean;
  /** Estado de revisão para lançamentos automáticos. */
  reviewStatus?: "new" | "confirmed" | "edited" | "ignored" | "duplicate";
  /** App de origem da notificação (ex.: "Nubank"). */
  sourceApp?: string;
  /** Texto bruto da notificação que originou o lançamento. */
  rawText?: string;
  /** Confiança (0-1) da extração automática. */
  confidence?: number;
};

export type EstablishmentRule = { id: string; matchText: string; category: string };
export type NotificationAppRule = { id: string; sourceApp: string; action: "ignore" | "allow"; accountId?: string; cardId?: string; defaultCategory?: string };
export type PendingAutoTransaction = {
  id: string; sourceApp: string; rawText: string; confidence: number; description: string; amount: number;
  type: TransactionType; date: string; suggestedCategory?: string; suggestedAccount?: string; cardId?: string;
  reviewStatus: "new" | "ignored" | "duplicate"; ignoreReason?: string; createdAt: string;
};

export type FinanceTrip = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  currency: string;
  exchangeRate: number;
  createdAt?: string;
  updatedAt?: string;
};

export type FinanceAccount = {
  id: string;
  name: string;
  institution: string;
  currency: string;
  kind: "checking" | "cash" | "investment" | "credit-card" | "benefit" | string;
  balance: number;
  goal: number;
  monthlyYieldPercent: number;
  fixed: boolean;
  color: string;
  /** Quando true, a conta fica de fora de "Saldo total" e "Livre para gastar" — útil pra contas usadas só como anotação (ex.: valores futuros de fatura). */
  excludeFromTotals?: boolean;
};

export type FinanceCategory = {
  id: string;
  name: string;
  kind: "expense" | "income" | string;
  color: string;
  icon: string;
  essential: boolean;
};

export type FinanceRecurringRule = {
  id: string;
  description: string;
  type: "expense" | "income";
  category: string;
  account: string;
  amount: number;
  dayOfMonth: number;
  calculationMode: "fixed" | "business-day";
  scheduleMode: ScheduleMode;
  dateAdjustment: BusinessDayAdjustment;
  paymentMethod: PaymentMethod;
  cardId?: string;
  active: boolean;
  lastConfirmedMonth?: string;
  effectiveDate?: string;
  businessDays?: number;
  projectedAmount?: number;
};

export type FinanceSalaryRule = FinanceRecurringRule;
export type FinanceBenefitRule = FinanceRecurringRule;

export type FinanceCard = {
  id: string;
  name: string;
  linkedAccount: string;
  kind: "credit" | "debit";
  brand: string;
  tier: string;
  last4: string;
  limit: number;
  closingDay: number;
  dueDay: number;
  dueAdjustment: BusinessDayAdjustment;
  pointsPerDollar: number;
  cashbackPercent: number;
  rewardMode: "none" | "points" | "cashback" | "both";
  pointsGoal: number;
  manualUsdRate: number;
  color: string;
  imageData?: string;
  favorite?: boolean;
  sortOrder?: number;
};

export type FinanceRewardRedemption = {
  id: string;
  cardId: string;
  kind: "points" | "cashback";
  amount: number;
  account?: string;
  date: string;
  note?: string;
  createdAt?: string;
};

export type FinanceExchangeRate = {
  currency: "USD";
  buy: number;
  sell: number;
  quotedAt: string;
  source: "BCB PTAX";
  stale?: boolean;
};

export type FinanceSnapshot = {
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
  cards: FinanceCard[];
  trips: FinanceTrip[];
  transactions: FinanceTransaction[];
  rewardRedemptions: FinanceRewardRedemption[];
  salaryRule: FinanceSalaryRule | null;
  benefitRule: FinanceBenefitRule | null;
  recurringRules: FinanceRecurringRule[];
  /** Apelidos definidos pelo usuário para grupos de parcelamento (installmentGroupId -> nome). */
  installmentLabels: Record<string, string>;
  establishmentRules: EstablishmentRule[];
  notificationAppRules: NotificationAppRule[];
  pendingAutoTransactions: PendingAutoTransaction[];
  serverTime: string;
};
