/**
 * `GET /api/v1/reports?periodo=6m`
 *
 * Relatório do período: entradas, saídas, resultado, categorias e assinaturas.
 *
 * Só existia `reports/export`, que devolve CSV. Um aplicativo não quer o
 * arquivo — quer os números para desenhar. Sem esta rota, a única forma de ver
 * relatório era abrir o site.
 *
 * Rota fina: autentica, valida o período, chama o serviço, devolve.
 */

import { requireUser } from "../../../../server/auth/session.ts";
import { handle, json } from "../../../../server/http/respond.ts";
import { type ReportPeriod, buildReport } from "../../../../server/services/reports.ts";

export const dynamic = "force-dynamic";

const PERIODOS: readonly ReportPeriod[] = ["mes", "3m", "6m", "12m", "todos"];

export const GET = handle(async (request: Request) => {
  const user = await requireUser(request);
  const pedido = new URL(request.url).searchParams.get("periodo");

  // Período desconhecido cai no padrão em vez de recusar: é parâmetro de
  // leitura, e derrubar a tela inteira por causa de um texto estranho na URL
  // seria pior do que mostrar a janela mais usada.
  const periodo = PERIODOS.find((candidato) => candidato === pedido) ?? "6m";

  return json({ data: await buildReport(user.id, periodo) });
});
