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
  /** Caminho local do comprovante. O arquivo permanece offline no aparelho. */
  receiptUri?: string;
  version?: number;
  updatedAt?: string;
  deletedAt?: string;
  deviceId?: string;
  pendingSync?: boolean;
};

export type FinanceAccount = { id: string; name: string; institution: string; kind: string; balance: number; goal: number; monthlyYieldPercent: number; fixed: boolean; color: string };
export type FinanceCategory = { id: string; name: string; kind: string; color: string; icon: string; essential: boolean };
export type FinanceCard = { id: string; name: string; linkedAccount: string; kind: "credit" | "debit"; brand: string; tier: string; last4: string; limit: number; closingDay: number; dueDay: number; dueAdjustment?: "previous" | "next"; pointsPerDollar: number; cashbackPercent: number; rewardMode: string; pointsGoal: number; manualUsdRate?: number; color: string; imageData?: string; favorite?: boolean; sortOrder?: number };
export type FinanceRewardRedemption = { id: string; cardId: string; kind: "points" | "cashback"; amount: number; account?: string; date: string; note?: string; createdAt?: string };
export type FinanceRecurringRule = { id: string; description: string; type: "expense" | "income"; category: string; account: string; amount: number; dayOfMonth: number; active: boolean; projectedAmount?: number; effectiveDate?: string; lastConfirmedMonth?: string; businessDays?: number };
export type FinanceTrip = { id: string; name: string; startDate: string; endDate: string; currency: string; exchangeRate: number; createdAt?: string; updatedAt?: string };

export type FinanceSnapshot = {
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
  cards: FinanceCard[];
  trips: FinanceTrip[];
  transactions: FinanceTransaction[];
  rewardRedemptions: FinanceRewardRedemption[];
  salaryRule: FinanceRecurringRule | null;
  benefitRule: FinanceRecurringRule | null;
  recurringRules: FinanceRecurringRule[];
  serverTime: string;
};

export type SyncMutation = {
  mutationId: string;
  entity: "transaction";
  entityId: string;
  operation: "upsert" | "delete";
  baseVersion: number;
  data?: FinanceTransaction;
};

export type SyncResult = {
  mutationId: string;
  entity: "transaction";
  entityId: string;
  status: "applied" | "conflict" | "duplicate" | "noop" | "rejected";
  entityVersion?: number;
  entityData?: FinanceTransaction;
  message?: string;
};

export type SyncResponse = {
  apiVersion: "1";
  schemaVersion: number;
  syncToken: string;
  serverTime: string;
  results: SyncResult[];
  snapshot: FinanceSnapshot;
};

export type ReceiptScanResult = {
  merchant: string;
  description: string;
  date: string;
  total: number;
  category: string;
  paymentHint: "credit" | "debit" | "cash" | "unknown";
  items: Array<{ description: string; quantity: number; unitPrice: number; total: number }>;
  confidence: number;
  warnings: string[];
};

export type FinancialCoachResult = {
  answer: string;
  summary: string;
  actions: Array<{ label: string; reason: string; priority: "high" | "medium" | "low" }>;
  warnings: string[];
};

export type ProfileFeedback = { id: string; senderOwnerId: string; senderName: string; message: string; status: string; developerComment?: string | null; createdAt: string; updatedAt: string };
export type ProfileResult = { user: { id: string; email: string; displayName: string; avatarData?: string | null }; isDeveloper: boolean; feedback: ProfileFeedback[] };

export type AppNotification = {
  id: string;
  kind: string;
  title: string;
  message: string;
  feedbackId?: string | null;
  readAt?: string | null;
  createdAt: string;
};

export type NotificationsResult = { notifications: AppNotification[]; unreadCount: number };
