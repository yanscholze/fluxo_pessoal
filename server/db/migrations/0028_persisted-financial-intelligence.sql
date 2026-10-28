-- Persist only minimized analysis data; never credentials. Existing ready insights are retained.
--> statement-breakpoint
ALTER TABLE ai_analyses ADD COLUMN source_revision INTEGER NOT NULL DEFAULT -1;
--> statement-breakpoint
ALTER TABLE ai_analyses ADD COLUMN checked_day TEXT;
--> statement-breakpoint
ALTER TABLE ai_analyses ADD COLUMN checked_at TEXT;
--> statement-breakpoint
ALTER TABLE ai_analyses ADD COLUMN checked_fingerprint TEXT;
--> statement-breakpoint
ALTER TABLE ai_analyses ADD COLUMN published_fingerprint TEXT;
--> statement-breakpoint
ALTER TABLE ai_analyses ADD COLUMN context_json TEXT;
--> statement-breakpoint
ALTER TABLE ai_analyses ADD COLUMN suggestions_json TEXT NOT NULL DEFAULT '[]';
--> statement-breakpoint
ALTER TABLE ai_analyses ADD COLUMN provider TEXT;
--> statement-breakpoint
ALTER TABLE ai_analyses ADD COLUMN model TEXT;
--> statement-breakpoint
ALTER TABLE ai_analyses ADD COLUMN analysis_version INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE ai_analyses ADD COLUMN last_error TEXT;
--> statement-breakpoint
ALTER TABLE ai_analyses ADD COLUMN last_attempt_at TEXT;
--> statement-breakpoint
CREATE TABLE financial_revisions (user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE, revision INTEGER NOT NULL DEFAULT 0);
--> statement-breakpoint
CREATE TRIGGER financial_revision_accounts_insert AFTER INSERT ON accounts
WHEN EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
BEGIN
  INSERT INTO financial_revisions(user_id,revision) VALUES (NEW.user_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
--> statement-breakpoint
CREATE TRIGGER financial_revision_accounts_update AFTER UPDATE ON accounts
WHEN EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
BEGIN
  INSERT INTO financial_revisions(user_id,revision) VALUES (NEW.user_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
--> statement-breakpoint
CREATE TRIGGER financial_revision_accounts_delete AFTER DELETE ON accounts
WHEN EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
BEGIN
  INSERT INTO financial_revisions(user_id,revision) VALUES (OLD.user_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
--> statement-breakpoint
CREATE TRIGGER financial_revision_categories_insert AFTER INSERT ON categories
WHEN EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
BEGIN
  INSERT INTO financial_revisions(user_id,revision) VALUES (NEW.user_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
--> statement-breakpoint
CREATE TRIGGER financial_revision_categories_update AFTER UPDATE ON categories
WHEN EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
BEGIN
  INSERT INTO financial_revisions(user_id,revision) VALUES (NEW.user_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
--> statement-breakpoint
CREATE TRIGGER financial_revision_categories_delete AFTER DELETE ON categories
WHEN EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
BEGIN
  INSERT INTO financial_revisions(user_id,revision) VALUES (OLD.user_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
--> statement-breakpoint
CREATE TRIGGER financial_revision_cards_insert AFTER INSERT ON cards
WHEN EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
BEGIN
  INSERT INTO financial_revisions(user_id,revision) VALUES (NEW.user_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
--> statement-breakpoint
CREATE TRIGGER financial_revision_cards_update AFTER UPDATE ON cards
WHEN EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
BEGIN
  INSERT INTO financial_revisions(user_id,revision) VALUES (NEW.user_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
--> statement-breakpoint
CREATE TRIGGER financial_revision_cards_delete AFTER DELETE ON cards
WHEN EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
BEGIN
  INSERT INTO financial_revisions(user_id,revision) VALUES (OLD.user_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
--> statement-breakpoint
CREATE TRIGGER financial_revision_transactions_insert AFTER INSERT ON transactions
WHEN EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
BEGIN
  INSERT INTO financial_revisions(user_id,revision) VALUES (NEW.user_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
--> statement-breakpoint
CREATE TRIGGER financial_revision_transactions_update AFTER UPDATE ON transactions
WHEN EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
BEGIN
  INSERT INTO financial_revisions(user_id,revision) VALUES (NEW.user_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
--> statement-breakpoint
CREATE TRIGGER financial_revision_transactions_delete AFTER DELETE ON transactions
WHEN EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
BEGIN
  INSERT INTO financial_revisions(user_id,revision) VALUES (OLD.user_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
--> statement-breakpoint
CREATE TRIGGER financial_revision_ledger_entries_insert AFTER INSERT ON ledger_entries
WHEN EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
BEGIN
  INSERT INTO financial_revisions(user_id,revision) VALUES (NEW.user_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
--> statement-breakpoint
CREATE TRIGGER financial_revision_ledger_entries_update AFTER UPDATE ON ledger_entries
WHEN EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
BEGIN
  INSERT INTO financial_revisions(user_id,revision) VALUES (NEW.user_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
--> statement-breakpoint
CREATE TRIGGER financial_revision_ledger_entries_delete AFTER DELETE ON ledger_entries
WHEN EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
BEGIN
  INSERT INTO financial_revisions(user_id,revision) VALUES (OLD.user_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
--> statement-breakpoint
CREATE TRIGGER financial_revision_installment_plans_insert AFTER INSERT ON installment_plans
WHEN EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
BEGIN
  INSERT INTO financial_revisions(user_id,revision) VALUES (NEW.user_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
--> statement-breakpoint
CREATE TRIGGER financial_revision_installment_plans_update AFTER UPDATE ON installment_plans
WHEN EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
BEGIN
  INSERT INTO financial_revisions(user_id,revision) VALUES (NEW.user_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
--> statement-breakpoint
CREATE TRIGGER financial_revision_installment_plans_delete AFTER DELETE ON installment_plans
WHEN EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
BEGIN
  INSERT INTO financial_revisions(user_id,revision) VALUES (OLD.user_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
--> statement-breakpoint
CREATE TRIGGER financial_revision_invoices_insert AFTER INSERT ON invoices
WHEN EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
BEGIN
  INSERT INTO financial_revisions(user_id,revision) VALUES (NEW.user_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
--> statement-breakpoint
CREATE TRIGGER financial_revision_invoices_update AFTER UPDATE ON invoices
WHEN EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
BEGIN
  INSERT INTO financial_revisions(user_id,revision) VALUES (NEW.user_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
--> statement-breakpoint
CREATE TRIGGER financial_revision_invoices_delete AFTER DELETE ON invoices
WHEN EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
BEGIN
  INSERT INTO financial_revisions(user_id,revision) VALUES (OLD.user_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
--> statement-breakpoint
CREATE TRIGGER financial_revision_goals_insert AFTER INSERT ON goals
WHEN EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
BEGIN
  INSERT INTO financial_revisions(user_id,revision) VALUES (NEW.user_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
--> statement-breakpoint
CREATE TRIGGER financial_revision_goals_update AFTER UPDATE ON goals
WHEN EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
BEGIN
  INSERT INTO financial_revisions(user_id,revision) VALUES (NEW.user_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
--> statement-breakpoint
CREATE TRIGGER financial_revision_goals_delete AFTER DELETE ON goals
WHEN EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
BEGIN
  INSERT INTO financial_revisions(user_id,revision) VALUES (OLD.user_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
--> statement-breakpoint
CREATE TRIGGER financial_revision_goal_contributions_insert AFTER INSERT ON goal_contributions
WHEN EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
BEGIN
  INSERT INTO financial_revisions(user_id,revision) VALUES (NEW.user_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
--> statement-breakpoint
CREATE TRIGGER financial_revision_goal_contributions_update AFTER UPDATE ON goal_contributions
WHEN EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
BEGIN
  INSERT INTO financial_revisions(user_id,revision) VALUES (NEW.user_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
--> statement-breakpoint
CREATE TRIGGER financial_revision_goal_contributions_delete AFTER DELETE ON goal_contributions
WHEN EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
BEGIN
  INSERT INTO financial_revisions(user_id,revision) VALUES (OLD.user_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
--> statement-breakpoint
CREATE TRIGGER financial_revision_recurrences_insert AFTER INSERT ON recurrences
WHEN EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
BEGIN
  INSERT INTO financial_revisions(user_id,revision) VALUES (NEW.user_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
--> statement-breakpoint
CREATE TRIGGER financial_revision_recurrences_update AFTER UPDATE ON recurrences
WHEN EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
BEGIN
  INSERT INTO financial_revisions(user_id,revision) VALUES (NEW.user_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
--> statement-breakpoint
CREATE TRIGGER financial_revision_recurrences_delete AFTER DELETE ON recurrences
WHEN EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
BEGIN
  INSERT INTO financial_revisions(user_id,revision) VALUES (OLD.user_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
--> statement-breakpoint
CREATE TRIGGER financial_revision_recurrence_runs_insert AFTER INSERT ON recurrence_runs
WHEN EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
BEGIN
  INSERT INTO financial_revisions(user_id,revision) VALUES (NEW.user_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
--> statement-breakpoint
CREATE TRIGGER financial_revision_recurrence_runs_update AFTER UPDATE ON recurrence_runs
WHEN EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
BEGIN
  INSERT INTO financial_revisions(user_id,revision) VALUES (NEW.user_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
--> statement-breakpoint
CREATE TRIGGER financial_revision_recurrence_runs_delete AFTER DELETE ON recurrence_runs
WHEN EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
BEGIN
  INSERT INTO financial_revisions(user_id,revision) VALUES (OLD.user_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
--> statement-breakpoint
CREATE TRIGGER financial_revision_budgets_insert AFTER INSERT ON budgets
WHEN EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
BEGIN
  INSERT INTO financial_revisions(user_id,revision) VALUES (NEW.user_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
--> statement-breakpoint
CREATE TRIGGER financial_revision_budgets_update AFTER UPDATE ON budgets
WHEN EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
BEGIN
  INSERT INTO financial_revisions(user_id,revision) VALUES (NEW.user_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
--> statement-breakpoint
CREATE TRIGGER financial_revision_budgets_delete AFTER DELETE ON budgets
WHEN EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
BEGIN
  INSERT INTO financial_revisions(user_id,revision) VALUES (OLD.user_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
--> statement-breakpoint
CREATE TRIGGER financial_revision_investments_insert AFTER INSERT ON investments
WHEN EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
BEGIN
  INSERT INTO financial_revisions(user_id,revision) VALUES (NEW.user_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
--> statement-breakpoint
CREATE TRIGGER financial_revision_investments_update AFTER UPDATE ON investments
WHEN EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
BEGIN
  INSERT INTO financial_revisions(user_id,revision) VALUES (NEW.user_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
--> statement-breakpoint
CREATE TRIGGER financial_revision_investments_delete AFTER DELETE ON investments
WHEN EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
BEGIN
  INSERT INTO financial_revisions(user_id,revision) VALUES (OLD.user_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
--> statement-breakpoint
CREATE TRIGGER financial_revision_investment_movements_insert AFTER INSERT ON investment_movements
WHEN EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
BEGIN
  INSERT INTO financial_revisions(user_id,revision) VALUES (NEW.user_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
--> statement-breakpoint
CREATE TRIGGER financial_revision_investment_movements_update AFTER UPDATE ON investment_movements
WHEN EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
BEGIN
  INSERT INTO financial_revisions(user_id,revision) VALUES (NEW.user_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
--> statement-breakpoint
CREATE TRIGGER financial_revision_investment_movements_delete AFTER DELETE ON investment_movements
WHEN EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
BEGIN
  INSERT INTO financial_revisions(user_id,revision) VALUES (OLD.user_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
--> statement-breakpoint
CREATE TRIGGER financial_revision_capture_events_insert AFTER INSERT ON capture_events
WHEN EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
BEGIN
  INSERT INTO financial_revisions(user_id,revision) VALUES (NEW.user_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
--> statement-breakpoint
CREATE TRIGGER financial_revision_capture_events_update AFTER UPDATE ON capture_events
WHEN EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
BEGIN
  INSERT INTO financial_revisions(user_id,revision) VALUES (NEW.user_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
--> statement-breakpoint
CREATE TRIGGER financial_revision_capture_events_delete AFTER DELETE ON capture_events
WHEN EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
BEGIN
  INSERT INTO financial_revisions(user_id,revision) VALUES (OLD.user_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
