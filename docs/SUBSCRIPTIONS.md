# Subscriptions: web management and scheduled card posting

## Scope

`Compromissos > Assinaturas` opens `/assinaturas`. The page uses the existing
recurrence, classification, transaction and invoice services. Subscriptions
remain recurrences with `role = subscription`; no parallel financial model is
introduced. Legacy `/planejamento?aba=assinaturas` links redirect here.

The page supports creation, editing, pause/resume and cancellation, with monthly
equivalent and exact annual cost, classification totals and payment origins.
Annual prices are divided by twelve only for monthly comparison; annual totals
retain the original cents. The optional start date determines the billing month
for annual subscriptions. Confirmed occurrences are excluded from upcoming costs.

## Account and card behavior

- Account subscriptions remain explicit: record a payment or link an existing
  confirmed transaction through the shared commitment settlement dialog. Linking
  preserves the original transaction and does not move the balance again.
- Credit-card subscriptions with a fixed calendar day post automatically on that
  civil date, including weekends and holidays. Missing days are clamped to the
  last day of the month. Explicit business-day schedules remain business-day
  schedules. The existing card cycle assigns the invoice.
- Automatic posting records bookkeeping entries in Fluxo; it does not initiate
  a payment or charge a bank card.
- Cancellation preserves historical transactions. Account inclusion preferences
  and the free-to-spend formula are unchanged.

## Execution and duplicate prevention

The existing five-minute Worker cron runs subscription posting independently
from AI generation. Each tick handles one eligible user, ordered by a persisted
checkpoint, and at most ten due subscriptions. This bounds CPU usage and rotates
past entries awaiting review. Posting is asynchronous: a normal complete sweep
takes approximately five minutes per eligible user, with additional ticks for
backlogs. Financial dates retain the configured due date.

Only the current calendar competence is eligible. Deployment does not backfill
previous months. The checkpoint migration (`0031`) adds orchestration state only.
Reads and page loads never generate transactions.

The scheduler uses existing atomic recurrence confirmation/linking and a per-user
lease shared with import and capture confirmation. Retries reuse the same
occurrence. A unique matching unlinked charge on the same card, within three days
and with the same service and amount, is linked instead of created. Price
discrepancies, ambiguous matches and recognized notifications with a different
amount require review. Installments are excluded from this matching.

Imports and capture confirmation can reuse an already posted subscription charge.
Import bank identities are retained as aliases without replacing the recurrence
fingerprint. A distinct subsequent identity or multiple accepted import rows
matching one canonical charge require review, rather than hiding a possible
second real charge. Changing a merchant description may also require review.

## Validation

```sh
npm test
npm run lint
npm run typecheck --workspace mobile
npm run build
npm run validate:subscriptions
npm run validate:ai-scheduled
npm run validate:ai-critical-path
```

`validate:subscriptions` exercises the actual built Worker and migrations with
an ephemeral D1 database. It verifies authentication, annual/monthly reporting,
read-only GETs, the cron, fixed card dates, repeated execution, manual account
settlement and stable balances/free-to-spend when a forecast becomes a posting.
It blocks outbound provider requests and does not read production credentials.
`--serve` keeps the disposable fixture available for browser checks; terminate
the process to discard it. The fixture includes an unlinked payment for testing
settlement through the web interface.

Browser validation uses that isolated fixture for create/edit/pause/resume/cancel
and linking an existing payment. Production smoke checks are read-only. The
Android source and packaging are outside this change; no new APK is required.
