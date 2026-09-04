/**
 * `PATCH /api/v1/proposals/:id` — move a proposta pelo ciclo.
 *
 * Aceitar preenche o valor contratado do projeto quando ele ainda estava
 * zerado: é o momento em que a promessa vira compromisso.
 */

import { requireUser } from "../../../../../server/auth/session.ts";
import { read } from "../../../../../server/http/input.ts";
import { handle, json, readJson } from "../../../../../server/http/respond.ts";
import { segmentAfter } from "../../../../../server/http/route-params.ts";
import { decideProposal } from "../../../../../server/services/work.ts";

export const dynamic = "force-dynamic";

const SITUACOES = ["sent", "accepted", "rejected", "expired"] as const;

export const PATCH = handle(async (request: Request) => {
  const user = await requireUser(request);
  const proposalId = segmentAfter(request, "proposals");
  const input = read(await readJson(request));

  const status = input.choice("status", SITUACOES);
  input.done();

  await decideProposal(user.id, proposalId, status);
  return json({ data: { ok: true } });
});
