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
  status?: "confirmed" | "planned";
  source?: "manual" | "import" | "recurring" | "invoice-payment" | "account-transfer";
  fingerprint?: string;
  rewardPoints?: number;
  rewardCashback?: number;
  rewardUsdRate?: number;
  version?: number;
  updatedAt?: string;
  deletedAt?: string;
  deviceId?: string;
  pendingSync?: boolean;
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
  kind: "checking" | "cash" | "investment" | "credit-card" | "benefit" | string;
  balance: number;
  goal: number;
  monthlyYieldPercent: number;
  fixed: boolean;
  color: string;
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
  serverTime: string;
};
