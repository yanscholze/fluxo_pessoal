import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    passwordHash: text("password_hash").notNull(),
    passwordSalt: text("password_salt").notNull(),
    passwordIterations: integer("password_iterations").notNull().default(100000),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("users_email_idx").on(table.email)],
);

export const webSessions = sqliteTable(
  "web_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at"),
    lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("web_sessions_token_hash_idx").on(table.tokenHash),
    index("web_sessions_user_idx").on(table.userId),
  ],
);

export const authRateLimits = sqliteTable(
  "auth_rate_limits",
  {
    keyHash: text("key_hash").primaryKey(),
    scope: text("scope").notNull(),
    failures: integer("failures").notNull().default(0),
    windowStartedAt: text("window_started_at").notNull(),
    blockedUntil: text("blocked_until"),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("auth_rate_limits_updated_idx").on(table.updatedAt)],
);

export const aiUsageDaily = sqliteTable(
  "ai_usage_daily",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    feature: text("feature").notNull(),
    usageDay: text("usage_day").notNull(),
    requestCount: integer("request_count").notNull().default(0),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("ai_usage_owner_day_idx").on(table.ownerId, table.usageDay)],
);

export const userProfiles = sqliteTable(
  "user_profiles",
  {
    ownerId: text("owner_id").primaryKey(),
    avatarData: text("avatar_data"),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
);

export const developerFeedback = sqliteTable(
  "developer_feedback",
  {
    id: text("id").primaryKey(),
    senderOwnerId: text("sender_owner_id").notNull(),
    senderName: text("sender_name").notNull(),
    message: text("message").notNull(),
    status: text("status").notNull().default("new"),
    developerComment: text("developer_comment"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("developer_feedback_sender_idx").on(table.senderOwnerId),
    index("developer_feedback_status_created_idx").on(table.status, table.createdAt),
  ],
);

export const appNotifications = sqliteTable(
  "app_notifications",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    feedbackId: text("feedback_id"),
    readAt: text("read_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("app_notifications_owner_created_idx").on(table.ownerId, table.createdAt),
    index("app_notifications_owner_read_idx").on(table.ownerId, table.readAt),
  ],
);

export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    deviceId: text("device_id").notNull(),
    expoPushToken: text("expo_push_token").notNull(),
    platform: text("platform").notNull().default("android"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    lastRegisteredAt: text("last_registered_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("push_subscriptions_owner_device_idx").on(table.ownerId, table.deviceId),
    uniqueIndex("push_subscriptions_token_idx").on(table.expoPushToken),
    index("push_subscriptions_owner_active_idx").on(table.ownerId, table.active),
  ],
);

export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    institution: text("institution").notNull().default("manual"),
    currency: text("currency_code").notNull().default("BRL"),
    kind: text("kind").notNull().default("checking"),
    balanceCents: integer("balance_cents").notNull().default(0),
    goalCents: integer("goal_cents").notNull().default(0),
    monthlyYieldBasisPoints: integer("monthly_yield_basis_points").notNull().default(0),
    fixed: integer("fixed", { mode: "boolean" }).notNull().default(false),
    color: text("color").notNull().default("teal"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("accounts_owner_idx").on(table.ownerId),
    uniqueIndex("accounts_owner_name_idx").on(table.ownerId, table.name),
  ],
);
export const categories = sqliteTable(
  "categories",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("expense"),
    color: text("color").notNull().default("teal"),
    icon: text("icon").notNull().default("circle"),
    essential: integer("essential", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("categories_owner_idx").on(table.ownerId),
    uniqueIndex("categories_owner_name_idx").on(table.ownerId, table.name),
  ],
);

export const trips = sqliteTable(
  "trips",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    currency: text("currency").notNull().default("BRL"),
    exchangeRateMicros: integer("exchange_rate_micros").notNull().default(1_000_000),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("trips_owner_dates_idx").on(table.ownerId, table.startDate, table.endDate),
    uniqueIndex("trips_owner_name_dates_idx").on(table.ownerId, table.name, table.startDate),
  ],
);

export const transactions = sqliteTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull().default("Outros"),
    account: text("account").notNull().default("Nubank"),
    destinationAccount: text("destination_account"),
    occurredAt: text("occurred_at").notNull(),
    amountCents: integer("amount_cents").notNull(),
    type: text("type").notNull(),
    installments: text("installments"),
    installmentGroupId: text("installment_group_id"),
    importBatchId: text("import_batch_id"),
    importBatchName: text("import_batch_name"),
    importBatchMonth: text("import_batch_month"),
    importedAt: text("imported_at"),
    status: text("status").notNull().default("confirmed"),
    source: text("source").notNull().default("manual"),
    paymentMethod: text("payment_method").notNull().default("other"),
    cardId: text("card_id"),
    tripId: text("trip_id"),
    invoiceMonth: text("invoice_month"),
    rewardPointsMilli: integer("reward_points_milli"),
    rewardCashbackCents: integer("reward_cashback_cents"),
    rewardUsdRateMicros: integer("reward_usd_rate_micros"),
    fingerprint: text("fingerprint"),
    version: integer("version").notNull().default(1),
    deletedAt: text("deleted_at"),
    deviceId: text("device_id"),
    lastMutationId: text("last_mutation_id"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("transactions_owner_date_idx").on(table.ownerId, table.occurredAt),
    index("transactions_owner_updated_idx").on(table.ownerId, table.updatedAt),
    index("transactions_owner_trip_idx").on(table.ownerId, table.tripId),
    index("transactions_owner_installment_group_idx").on(table.ownerId, table.installmentGroupId),
    index("transactions_owner_import_batch_idx").on(table.ownerId, table.importBatchId),
    uniqueIndex("transactions_owner_fingerprint_idx").on(table.ownerId, table.fingerprint),
  ],
);

export const syncMutations = sqliteTable(
  "sync_mutations",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    mutationId: text("mutation_id").notNull(),
    deviceId: text("device_id").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    operation: text("operation").notNull(),
    status: text("status").notNull(),
    responseJson: text("response_json").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("sync_mutations_owner_mutation_idx").on(table.ownerId, table.mutationId),
    index("sync_mutations_owner_created_idx").on(table.ownerId, table.createdAt),
  ],
);

export const mobileDevices = sqliteTable(
  "mobile_devices",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    deviceId: text("device_id").notNull(),
    name: text("name").notNull(),
    platform: text("platform").notNull().default("android"),
    appVersion: text("app_version"),
    tokenHash: text("token_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at"),
    lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("mobile_devices_owner_device_idx").on(table.ownerId, table.deviceId),
    uniqueIndex("mobile_devices_token_hash_idx").on(table.tokenHash),
    index("mobile_devices_owner_idx").on(table.ownerId),
  ],
);

export const recurringEntries = sqliteTable(
  "recurring_entries",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    description: text("description").notNull().default("Salário"),
    category: text("category").notNull().default("Receita"),
    account: text("account").notNull().default("Nubank"),
    amountCents: integer("amount_cents").notNull().default(0),
    type: text("type").notNull().default("income"),
    dayOfMonth: integer("day_of_month").notNull().default(1),
    calculationMode: text("calculation_mode").notNull().default("fixed"),
    scheduleMode: text("schedule_mode").notNull().default("day-of-month"),
    dateAdjustment: text("date_adjustment").notNull().default("previous"),
    paymentMethod: text("payment_method").notNull().default("transfer"),
    cardId: text("card_id"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    lastConfirmedMonth: text("last_confirmed_month"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("recurring_entries_owner_idx").on(table.ownerId)],
);

export const cards = sqliteTable(
  "cards",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    linkedAccount: text("linked_account").notNull(),
    kind: text("kind").notNull().default("credit"),
    brand: text("brand").notNull().default("Mastercard"),
    tier: text("tier").notNull().default("Black"),
    last4: text("last4").notNull().default("0000"),
    limitCents: integer("limit_cents").notNull().default(0),
    closingDay: integer("closing_day").notNull().default(1),
    dueDay: integer("due_day").notNull().default(8),
    dueAdjustment: text("due_adjustment").notNull().default("next"),
    pointsPerDollarMilli: integer("points_per_dollar_milli").notNull().default(0),
    cashbackBasisPoints: integer("cashback_basis_points").notNull().default(0),
    rewardMode: text("reward_mode").notNull().default("none"),
    pointsGoal: integer("points_goal").notNull().default(0),
    manualUsdRateMicros: integer("manual_usd_rate_micros").notNull().default(0),
    color: text("color").notNull().default("black"),
    imageData: text("image_data"),
    favorite: integer("is_favorite", { mode: "boolean" }).notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("cards_owner_idx").on(table.ownerId),
    uniqueIndex("cards_owner_name_idx").on(table.ownerId, table.name),
  ],
);

export const rewardRedemptions = sqliteTable(
  "reward_redemptions",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    cardId: text("card_id").notNull(),
    kind: text("kind").notNull(),
    amountMilli: integer("amount_milli").notNull(),
    account: text("account"),
    redeemedAt: text("redeemed_at").notNull(),
    note: text("note"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("reward_redemptions_owner_date_idx").on(table.ownerId, table.redeemedAt),
    index("reward_redemptions_owner_card_idx").on(table.ownerId, table.cardId),
  ],
);
