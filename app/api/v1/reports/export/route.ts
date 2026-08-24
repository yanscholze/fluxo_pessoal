/**
 * `GET /api/v1/reports/export` — exporta o relatório em CSV.
 *
 * Devolve o arquivo com `Content-Disposition: attachment` para o navegador
 * salvar em vez de exibir.
 */

import { requireUser } from "../../../../../server/auth/session.ts";
import { handle } from "../../../../../server/http/respond.ts";
import { type ReportPeriod, buildReport, toCsv } from "../../../../../server/services/reports.ts";

export const dynamic = "force-dynamic";

const PERIODOS: readonly ReportPeriod[] = ["mes", "3m", "6m", "12m", "todos"];

export const GET = handle(async (request: Request) => {
  const user = await requireUser(request);
  const url = new URL(request.url);

  const pedido = url.searchParams.get("periodo") ?? "6m";
  const periodo = (PERIODOS as readonly string[]).includes(pedido) ? (pedido as ReportPeriod) : "6m";
  const fluxo = url.searchParams.get("fluxo") === "entradas" ? "entradas" : "saidas";

  const report = await buildReport(user.id, periodo);
  const linhas = fluxo === "entradas" ? report.incomeByCategory : report.expensesByCategory;

  // BOM UTF-8: sem ele o Excel em português abre acento como caractere solto.
  const csv = `﻿${toCsv(report, linhas)}`;

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="fluxo-${fluxo}-${report.from}-${report.to}.csv"`,
      "cache-control": "no-store",
    },
  });
});
