type PtaxItem = {
  cotacaoCompra: number;
  cotacaoVenda: number;
  dataHoraCotacao: string;
};

function bcbDate(date: Date) {
  return `${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}-${date.getUTCFullYear()}`;
}

export async function GET() {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 12);
  const parameters = `dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao`;
  const aliases = `@dataInicial='${bcbDate(start)}'&@dataFinalCotacao='${bcbDate(end)}'`;
  const url = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo(${parameters})?${aliases}&$top=1&$orderby=dataHoraCotacao%20desc&$format=json`;
  try {
    const response = await fetch(url, { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error("BCB unavailable");
    const payload = await response.json() as { value?: PtaxItem[] };
    const latest = payload.value?.[0];
    if (!latest) throw new Error("PTAX unavailable");
    return Response.json({
      currency: "USD",
      buy: latest.cotacaoCompra,
      sell: latest.cotacaoVenda,
      quotedAt: latest.dataHoraCotacao,
      source: "BCB PTAX",
    }, { headers: { "cache-control": "public, max-age=1800, s-maxage=1800" } });
  } catch {
    return Response.json({ error: "Cotação PTAX indisponível" }, { status: 503 });
  }
}
