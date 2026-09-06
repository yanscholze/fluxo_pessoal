/**
 * `PATCH  /api/v1/accounts/:id` — renomeia, recolore, ajusta meta e totais.
 * `DELETE /api/v1/accounts/:id` — arquiva, ou apaga se nunca foi usada.
 *
 * Apagar é decisão do serviço, não da rota: conta com histórico é **arquivada**
 * porque os lançamentos apontam para ela, e removê-la deixaria movimentação
 * órfã — que é como um saldo passa a não fechar. Conta que nunca recebeu
 * lançamento pode sair de vez, e some da lista em vez de virar entulho.
 */

import { requireUser } from "../../../../../server/auth/session.ts";
import { read } from "../../../../../server/http/input.ts";
import { handle, json, readJson } from "../../../../../server/http/respond.ts";
import { segmentAfter } from "../../../../../server/http/route-params.ts";
import { archiveAccount, updateAccount } from "../../../../../server/services/catalog.ts";

export const dynamic = "force-dynamic";

function idOf(request: Request): string {
  return segmentAfter(request, "accounts");
}

export const PATCH = handle(async (request: Request) => {
  const user = await requireUser(request);
  const accountId = idOf(request);
  const input = read(await readJson(request));

  const name = input.optionalString("name", { max: 60 });
  const institution = input.optionalString("institution", { max: 60 });
  const color = input.optionalString("color", { max: 9 });
  const goalAmount = input.optionalMoney("goalAmount");
  const monthlyYieldBasisPoints = input.optionalInteger("monthlyYieldBasisPoints", { min: 0, max: 100_000 });
  const includeInTotals = input.optionalBoolean("includeInTotals");
  /*
   * O saldo de abertura é corrigível.
   *
   * Ele é o que existia antes do primeiro lançamento, e quem digita errado no
   * cadastro — ou importa de um sistema antigo com o número errado — só
   * descobre quando o saldo de hoje não bate. Sem esta porta, a saída era
   * apagar a conta e recriar, perdendo o histórico junto.
   */
  const openingBalance = input.optionalMoney("openingBalance", { allowNegative: true });

  input.done();

  await updateAccount(user.id, accountId, {
    ...(name !== null ? { name } : {}),
    ...(institution !== null ? { institution } : {}),
    ...(color !== null ? { color } : {}),
    ...(goalAmount !== null ? { goalAmount } : {}),
    ...(monthlyYieldBasisPoints !== null ? { monthlyYieldBasisPoints } : {}),
    ...(includeInTotals !== null ? { includeInTotals } : {}),
    ...(openingBalance !== null ? { openingBalance } : {}),
  });

  return json({ data: { ok: true } });
});

export const DELETE = handle(async (request: Request) => {
  const user = await requireUser(request);
  const resultado = await archiveAccount(user.id, idOf(request));

  // O cliente precisa saber qual dos dois aconteceu: "arquivada" continua
  // aparecendo em relatório histórico, "apagada" não.
  return json({ data: { outcome: resultado } });
});
