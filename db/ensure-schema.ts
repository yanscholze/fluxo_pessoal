import { env } from "cloudflare:workers";

let ready: Promise<void> | null = null;

export function ensureFinanceSchema() {
  if (!env.DB) throw new Error("Cloud database binding DB is unavailable");
  if (ready) return ready;

  ready = (async () => {
    const statements = [
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY NOT NULL,
        email TEXT NOT NULL,
        display_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        password_iterations INTEGER NOT NULL DEFAULT 100000,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users (email)`,
      `CREATE TABLE IF NOT EXISTS web_sessions (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        revoked_at TEXT,
        last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS web_sessions_token_hash_idx ON web_sessions (token_hash)`,
      `CREATE INDEX IF NOT EXISTS web_sessions_user_idx ON web_sessions (user_id)`,
      `CREATE TABLE IF NOT EXISTS auth_rate_limits (
        key_hash TEXT PRIMARY KEY NOT NULL,
        scope TEXT NOT NULL,
        failures INTEGER NOT NULL DEFAULT 0,
        window_started_at TEXT NOT NULL,
        blocked_until TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE INDEX IF NOT EXISTS auth_rate_limits_updated_idx ON auth_rate_limits (updated_at)`,
      `CREATE TABLE IF NOT EXISTS ai_usage_daily (
        id TEXT PRIMARY KEY NOT NULL,
        owner_id TEXT NOT NULL,
        feature TEXT NOT NULL,
        usage_day TEXT NOT NULL,
        request_count INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE INDEX IF NOT EXISTS ai_usage_owner_day_idx ON ai_usage_daily (owner_id, usage_day)`,
      `CREATE TABLE IF NOT EXISTS user_profiles (
        owner_id TEXT PRIMARY KEY NOT NULL,
        avatar_data TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS developer_feedback (
        id TEXT PRIMARY KEY NOT NULL,
        sender_owner_id TEXT NOT NULL,
        sender_name TEXT NOT NULL,
        message TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'new',
        developer_comment TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE INDEX IF NOT EXISTS developer_feedback_sender_idx ON developer_feedback (sender_owner_id)`,
      `CREATE INDEX IF NOT EXISTS developer_feedback_status_created_idx ON developer_feedback (status, created_at)`,
      `CREATE TABLE IF NOT EXISTS app_notifications (
        id TEXT PRIMARY KEY NOT NULL,
        owner_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        feedback_id TEXT,
        read_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE INDEX IF NOT EXISTS app_notifications_owner_created_idx ON app_notifications (owner_id, created_at)`,
      `CREATE INDEX IF NOT EXISTS app_notifications_owner_read_idx ON app_notifications (owner_id, read_at)`,
      `CREATE TABLE IF NOT EXISTS push_subscriptions (
        id TEXT PRIMARY KEY NOT NULL,
        owner_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        expo_push_token TEXT NOT NULL,
        platform TEXT NOT NULL DEFAULT 'android',
        active INTEGER NOT NULL DEFAULT 1,
        last_registered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_owner_device_idx ON push_subscriptions (owner_id, device_id)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_token_idx ON push_subscriptions (expo_push_token)`,
      `CREATE INDEX IF NOT EXISTS push_subscriptions_owner_active_idx ON push_subscriptions (owner_id, active)`,
      `CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY NOT NULL,
        owner_id TEXT NOT NULL,
        name TEXT NOT NULL,
        institution TEXT NOT NULL DEFAULT 'manual',
        currency_code TEXT NOT NULL DEFAULT 'BRL',
        kind TEXT NOT NULL DEFAULT 'checking',
        balance_cents INTEGER NOT NULL DEFAULT 0,
        goal_cents INTEGER NOT NULL DEFAULT 0,
        monthly_yield_basis_points INTEGER NOT NULL DEFAULT 0,
        fixed INTEGER NOT NULL DEFAULT 0,
        color TEXT NOT NULL DEFAULT 'teal',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS accounts_owner_name_idx ON accounts (owner_id, name)`,
      `CREATE INDEX IF NOT EXISTS accounts_owner_idx ON accounts (owner_id)`,
      `CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY NOT NULL,
        owner_id TEXT NOT NULL,
        name TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'expense',
        color TEXT NOT NULL DEFAULT 'teal',
        icon TEXT NOT NULL DEFAULT 'circle',
        essential INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS categories_owner_name_idx ON categories (owner_id, name)`,
      `CREATE INDEX IF NOT EXISTS categories_owner_idx ON categories (owner_id)`,
      `CREATE TABLE IF NOT EXISTS trips (
        id TEXT PRIMARY KEY NOT NULL,
        owner_id TEXT NOT NULL,
        name TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        currency TEXT NOT NULL DEFAULT 'BRL',
        exchange_rate_micros INTEGER NOT NULL DEFAULT 1000000,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE INDEX IF NOT EXISTS trips_owner_dates_idx ON trips (owner_id, start_date, end_date)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS trips_owner_name_dates_idx ON trips (owner_id, name, start_date)`,
      `CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY NOT NULL,
        owner_id TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'Outros',
        account TEXT NOT NULL DEFAULT 'Nubank',
        destination_account TEXT,
        occurred_at TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        type TEXT NOT NULL,
        installments TEXT,
        installment_group_id TEXT,
        status TEXT NOT NULL DEFAULT 'confirmed',
        source TEXT NOT NULL DEFAULT 'manual',
        payment_method TEXT NOT NULL DEFAULT 'other',
        card_id TEXT,
        trip_id TEXT,
        invoice_month TEXT,
        reward_points_milli INTEGER,
        reward_cashback_cents INTEGER,
        reward_usd_rate_micros INTEGER,
        fingerprint TEXT,
        version INTEGER NOT NULL DEFAULT 1,
        deleted_at TEXT,
        device_id TEXT,
        last_mutation_id TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE INDEX IF NOT EXISTS transactions_owner_date_idx ON transactions (owner_id, occurred_at)`,
      `CREATE INDEX IF NOT EXISTS transactions_owner_updated_idx ON transactions (owner_id, updated_at)`,
      `CREATE INDEX IF NOT EXISTS transactions_owner_installment_group_idx ON transactions (owner_id, installment_group_id)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS transactions_owner_fingerprint_idx ON transactions (owner_id, fingerprint)`,
      `CREATE TABLE IF NOT EXISTS sync_mutations (
        id TEXT PRIMARY KEY NOT NULL,
        owner_id TEXT NOT NULL,
        mutation_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        status TEXT NOT NULL,
        response_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS sync_mutations_owner_mutation_idx ON sync_mutations (owner_id, mutation_id)`,
      `CREATE INDEX IF NOT EXISTS sync_mutations_owner_created_idx ON sync_mutations (owner_id, created_at)`,
      `CREATE TABLE IF NOT EXISTS mobile_devices (
        id TEXT PRIMARY KEY NOT NULL,
        owner_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        name TEXT NOT NULL,
        platform TEXT NOT NULL DEFAULT 'android',
        app_version TEXT,
        token_hash TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        revoked_at TEXT,
        last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS mobile_devices_owner_device_idx ON mobile_devices (owner_id, device_id)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS mobile_devices_token_hash_idx ON mobile_devices (token_hash)`,
      `CREATE INDEX IF NOT EXISTS mobile_devices_owner_idx ON mobile_devices (owner_id)`,
      `CREATE TABLE IF NOT EXISTS recurring_entries (
        id TEXT PRIMARY KEY NOT NULL,
        owner_id TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT 'Salário',
        category TEXT NOT NULL DEFAULT 'Receita',
        account TEXT NOT NULL DEFAULT 'Nubank',
        amount_cents INTEGER NOT NULL DEFAULT 0,
        type TEXT NOT NULL DEFAULT 'income',
        day_of_month INTEGER NOT NULL DEFAULT 1,
        calculation_mode TEXT NOT NULL DEFAULT 'fixed',
        schedule_mode TEXT NOT NULL DEFAULT 'day-of-month',
        date_adjustment TEXT NOT NULL DEFAULT 'previous',
        payment_method TEXT NOT NULL DEFAULT 'transfer',
        card_id TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        last_confirmed_month TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE INDEX IF NOT EXISTS recurring_entries_owner_idx ON recurring_entries (owner_id)`,
      `CREATE TABLE IF NOT EXISTS cards (
        id TEXT PRIMARY KEY NOT NULL,
        owner_id TEXT NOT NULL,
        name TEXT NOT NULL,
        linked_account TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'credit',
        brand TEXT NOT NULL DEFAULT 'Mastercard',
        tier TEXT NOT NULL DEFAULT 'Black',
        last4 TEXT NOT NULL DEFAULT '0000',
        limit_cents INTEGER NOT NULL DEFAULT 0,
        closing_day INTEGER NOT NULL DEFAULT 1,
        due_day INTEGER NOT NULL DEFAULT 8,
        due_adjustment TEXT NOT NULL DEFAULT 'next',
        points_per_dollar_milli INTEGER NOT NULL DEFAULT 0,
        cashback_basis_points INTEGER NOT NULL DEFAULT 0,
        reward_mode TEXT NOT NULL DEFAULT 'none',
        points_goal INTEGER NOT NULL DEFAULT 0,
        manual_usd_rate_micros INTEGER NOT NULL DEFAULT 0,
        color TEXT NOT NULL DEFAULT 'black',
        image_data TEXT,
        is_favorite INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS cards_owner_name_idx ON cards (owner_id, name)`,
      `CREATE INDEX IF NOT EXISTS cards_owner_idx ON cards (owner_id)`,
      `CREATE TABLE IF NOT EXISTS reward_redemptions (
        id TEXT PRIMARY KEY NOT NULL,
        owner_id TEXT NOT NULL,
        card_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        amount_milli INTEGER NOT NULL,
        account TEXT,
        redeemed_at TEXT NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE INDEX IF NOT EXISTS reward_redemptions_owner_date_idx ON reward_redemptions (owner_id, redeemed_at)`,
      `CREATE INDEX IF NOT EXISTS reward_redemptions_owner_card_idx ON reward_redemptions (owner_id, card_id)`,
    ];

    await env.DB.batch(statements.map((statement) => env.DB.prepare(statement)));
    const transactionInfo = await env.DB.prepare("PRAGMA table_info(transactions)").all<{ name: string }>();
    const transactionColumns = new Set(transactionInfo.results.map((column) => column.name));
    if (!transactionColumns.has("payment_method")) await env.DB.prepare("ALTER TABLE transactions ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'other'").run();
    if (!transactionColumns.has("destination_account")) await env.DB.prepare("ALTER TABLE transactions ADD COLUMN destination_account TEXT").run();
    if (!transactionColumns.has("card_id")) await env.DB.prepare("ALTER TABLE transactions ADD COLUMN card_id TEXT").run();
    if (!transactionColumns.has("trip_id")) await env.DB.prepare("ALTER TABLE transactions ADD COLUMN trip_id TEXT").run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS transactions_owner_trip_idx ON transactions (owner_id, trip_id)").run();
    if (!transactionColumns.has("invoice_month")) await env.DB.prepare("ALTER TABLE transactions ADD COLUMN invoice_month TEXT").run();
    if (!transactionColumns.has("installment_group_id")) await env.DB.prepare("ALTER TABLE transactions ADD COLUMN installment_group_id TEXT").run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS transactions_owner_installment_group_idx ON transactions (owner_id, installment_group_id)").run();
    if (!transactionColumns.has("import_batch_id")) await env.DB.prepare("ALTER TABLE transactions ADD COLUMN import_batch_id TEXT").run();
    if (!transactionColumns.has("import_batch_name")) await env.DB.prepare("ALTER TABLE transactions ADD COLUMN import_batch_name TEXT").run();
    if (!transactionColumns.has("import_batch_month")) await env.DB.prepare("ALTER TABLE transactions ADD COLUMN import_batch_month TEXT").run();
    if (!transactionColumns.has("imported_at")) await env.DB.prepare("ALTER TABLE transactions ADD COLUMN imported_at TEXT").run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS transactions_owner_import_batch_idx ON transactions (owner_id, import_batch_id)").run();
    if (!transactionColumns.has("reward_points_milli")) await env.DB.prepare("ALTER TABLE transactions ADD COLUMN reward_points_milli INTEGER").run();
    if (!transactionColumns.has("reward_cashback_cents")) await env.DB.prepare("ALTER TABLE transactions ADD COLUMN reward_cashback_cents INTEGER").run();
    if (!transactionColumns.has("reward_usd_rate_micros")) await env.DB.prepare("ALTER TABLE transactions ADD COLUMN reward_usd_rate_micros INTEGER").run();
    if (!transactionColumns.has("version")) await env.DB.prepare("ALTER TABLE transactions ADD COLUMN version INTEGER NOT NULL DEFAULT 1").run();
    if (!transactionColumns.has("deleted_at")) await env.DB.prepare("ALTER TABLE transactions ADD COLUMN deleted_at TEXT").run();
    if (!transactionColumns.has("device_id")) await env.DB.prepare("ALTER TABLE transactions ADD COLUMN device_id TEXT").run();
    if (!transactionColumns.has("last_mutation_id")) await env.DB.prepare("ALTER TABLE transactions ADD COLUMN last_mutation_id TEXT").run();
    const accountInfo = await env.DB.prepare("PRAGMA table_info(accounts)").all<{ name: string }>();
    const accountColumns = new Set(accountInfo.results.map((column) => column.name));
    if (!accountColumns.has("currency_code")) await env.DB.prepare("ALTER TABLE accounts ADD COLUMN currency_code TEXT NOT NULL DEFAULT 'BRL'").run();
    if (!accountColumns.has("goal_cents")) await env.DB.prepare("ALTER TABLE accounts ADD COLUMN goal_cents INTEGER NOT NULL DEFAULT 0").run();
    if (!accountColumns.has("monthly_yield_basis_points")) await env.DB.prepare("ALTER TABLE accounts ADD COLUMN monthly_yield_basis_points INTEGER NOT NULL DEFAULT 0").run();
    if (!accountColumns.has("fixed")) await env.DB.prepare("ALTER TABLE accounts ADD COLUMN fixed INTEGER NOT NULL DEFAULT 0").run();
    const categoryInfo = await env.DB.prepare("PRAGMA table_info(categories)").all<{ name: string }>();
    const categoryColumns = new Set(categoryInfo.results.map((column) => column.name));
    if (!categoryColumns.has("essential")) {
      await env.DB.prepare("ALTER TABLE categories ADD COLUMN essential INTEGER NOT NULL DEFAULT 0").run();
      await env.DB.prepare("UPDATE categories SET essential = 1 WHERE name IN ('Alimentação', 'Moradia', 'Transporte', 'Saúde')").run();
    }
    const recurringInfo = await env.DB.prepare("PRAGMA table_info(recurring_entries)").all<{ name: string }>();
    const recurringColumns = new Set(recurringInfo.results.map((column) => column.name));
    if (!recurringColumns.has("calculation_mode")) await env.DB.prepare("ALTER TABLE recurring_entries ADD COLUMN calculation_mode TEXT NOT NULL DEFAULT 'fixed'").run();
    if (!recurringColumns.has("schedule_mode")) await env.DB.prepare("ALTER TABLE recurring_entries ADD COLUMN schedule_mode TEXT NOT NULL DEFAULT 'day-of-month'").run();
    if (!recurringColumns.has("date_adjustment")) await env.DB.prepare("ALTER TABLE recurring_entries ADD COLUMN date_adjustment TEXT NOT NULL DEFAULT 'previous'").run();
    if (!recurringColumns.has("payment_method")) await env.DB.prepare("ALTER TABLE recurring_entries ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'transfer'").run();
    if (!recurringColumns.has("card_id")) await env.DB.prepare("ALTER TABLE recurring_entries ADD COLUMN card_id TEXT").run();
    const cardInfo = await env.DB.prepare("PRAGMA table_info(cards)").all<{ name: string }>();
    const cardColumns = new Set(cardInfo.results.map((column) => column.name));
    if (!cardColumns.has("image_data")) await env.DB.prepare("ALTER TABLE cards ADD COLUMN image_data TEXT").run();
    if (!cardColumns.has("is_favorite")) await env.DB.prepare("ALTER TABLE cards ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0").run();
    if (!cardColumns.has("sort_order")) await env.DB.prepare("ALTER TABLE cards ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0").run();
    const feedbackInfo = await env.DB.prepare("PRAGMA table_info(developer_feedback)").all<{ name: string }>();
    const feedbackColumns = new Set(feedbackInfo.results.map((column) => column.name));
    if (!feedbackColumns.has("developer_comment")) await env.DB.prepare("ALTER TABLE developer_feedback ADD COLUMN developer_comment TEXT").run();
  })().catch((error) => {
    ready = null;
    throw error;
  });

  return ready;
}
