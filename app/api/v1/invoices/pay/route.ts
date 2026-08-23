/**
 * `POST /api/v1/invoices/pay` — paga (total ou parcialmente) uma fatura.
 *
 * O pagamento não é despesa: é transferência que abate a dívida do cartão.
 */

import { requireUser } from "../../../../../server/auth/session.ts";
import { read } from "../../../../../server/http/input.ts";
import { handle, json, readJson } from "../../../../../server/http/respond.ts";
import { payInvoice } from "../../../../../server/services/transactions.ts";

export const dynamic = "force-dynamic";

export const POST = handle(async (request: Request) => {
  const user = await requireUser(request);
  const input = read(await readJson(request));

  const payload = {
    cardId: input.reference("cardId"),
    competence: input.competence("competence"),
    accountId: input.reference("accountId"),
    amount: input.optionalMoney("amount"),
    paidOn: input.optionalDate("paidOn"),
  };

  input.done();

  const result = await payInvoice(user.id, payload);
  return json({ data: result }, { status: 201 });
});
