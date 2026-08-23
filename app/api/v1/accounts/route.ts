/**
 * `GET /api/v1/accounts` — contas com saldo calculado.
 * `POST /api/v1/accounts` — cadastra uma conta.
 */

import { accountBalance } from "../../../../core/domain/ledger/balance.ts";
import { todayIn } from "../../../../core/time/local-date.ts";
import { requireUser } from "../../../../server/auth/session.ts";
import { read } from "../../../../server/http/input.ts";
import { handle, json, readJson } from "../../../../server/http/respond.ts";
import { listAccounts } from "../../../../server/repositories/catalog.ts";
import { loadLedger } from "../../../../server/repositories/ledger.ts";
import { createAccount } from "../../../../server/services/catalog.ts";

export const dynamic = "force-dynamic";

const KINDS = ["checking", "savings", "cash", "benefit", "investment"] as const;

export const GET = handle(async (request: Request) => {
  const user = await requireUser(request);
  const [accounts, entries] = await Promise.all([listAccounts(user.id), loadLedger(user.id)]);
  const today = todayIn();

  return json({
    data: accounts.map((account) => ({
      id: account.id,
      name: account.name,
      institution: account.institution,
      kind: account.kind,
      currency: account.currency,
      color: account.color,
      includeInTotals: account.includeInTotals,
      goalCents: account.goalAmount,
      balanceCents: accountBalance(entries, account.id, today, account.openingBalance),
    })),
  });
});

export const POST = handle(async (request: Request) => {
  const user = await requireUser(request);
  const input = read(await readJson(request));

  const payload = {
    name: input.string("name", { max: 60 }),
    kind: input.choice("kind", KINDS),
    institution: input.optionalString("institution", { max: 60 }),
    currency: input.optionalString("currency", { max: 3 }),
    openingBalance: input.optionalMoney("openingBalance", { allowNegative: true }),
    openedOn: input.optionalDate("openedOn"),
    goalAmount: input.optionalMoney("goalAmount"),
    monthlyYieldBasisPoints: input.optionalInteger("monthlyYieldBasisPoints", { min: 0, max: 100_000 }),
    includeInTotals: input.boolean("includeInTotals", true),
    color: input.optionalString("color", { max: 9 }),
  };

  input.done();

  const id = await createAccount(user.id, payload);
  return json({ data: { id } }, { status: 201 });
});
