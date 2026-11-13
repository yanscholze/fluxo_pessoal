-- Preserve the previous selection once; subsequent choices are independent of account kind.
ALTER TABLE accounts ADD COLUMN include_in_free_to_spend INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
UPDATE accounts
SET include_in_free_to_spend = CASE WHEN kind IN ('checking', 'cash', 'benefit') THEN 1 ELSE 0 END,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
