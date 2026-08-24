/**
 * Cotação do dólar.
 *
 * Fonte é a PTAX do Banco Central. A cotação de um dia passado nunca muda, e é
 * por isso que ela é guardada: evita uma chamada externa por requisição e
 * mantém o cálculo de pontos funcionando quando o BCB está fora do ar.
 */

import { and, desc, eq, lte } from "drizzle-orm";

import { type LocalDate, addDays, localDate, todayIn } from "../../core/time/local-date.ts";
import { getDatabase } from "../db/client.ts";
import { exchangeRates } from "../db/schema/index.ts";

export type Quote = {
  readonly currency: string;
  readonly quotedOn: LocalDate;
  /** Quantos reais vale uma unidade, em micros. */
  readonly rateMicros: number;
  readonly source: string;
  /**
   * Verdadeiro quando a cotação não é do dia pedido.
   *
   * Acontece em fim de semana e feriado, quando o BCB não publica — a tela
   * precisa poder dizer "cotação de sexta" em vez de fingir que é de hoje.
   */
  readonly stale: boolean;
};

const OLINDA =
  "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)";

/** Quantos dias recuar procurando a última cotação publicada. */
const MAX_LOOKBACK = 7;
const TIMEOUT_MS = 6000;

/**
 * Cotação de venda do dólar para uma data.
 *
 * Devolve `null` quando não há cotação nem em cache nem no BCB — quem chama
 * decide o que fazer (o cartão tem uma cotação manual de contingência).
 */
export async function usdQuote(on?: LocalDate, now: Date = new Date()): Promise<Quote | null> {
  const alvo = on ?? todayIn(now);

  const guardada = await cached("USD", alvo);
  if (guardada) return guardada;

  const buscada = await fetchFromBcb(alvo);
  if (buscada) {
    await store(buscada);
    return buscada;
  }

  // Sem resposta do BCB: a última cotação conhecida é melhor que nenhuma.
  const ultima = await mostRecent("USD", alvo);
  return ultima ? { ...ultima, stale: true } : null;
}

async function cached(currency: string, on: LocalDate): Promise<Quote | null> {
  const database = getDatabase();
  const [row] = await database
    .select()
    .from(exchangeRates)
    .where(and(eq(exchangeRates.currency, currency), eq(exchangeRates.quotedOn, on)))
    .limit(1);

  return row
    ? {
        currency: row.currency,
        quotedOn: localDate(row.quotedOn),
        rateMicros: row.rateMicros,
        source: row.source,
        stale: false,
      }
    : null;
}

async function mostRecent(currency: string, on: LocalDate): Promise<Quote | null> {
  const database = getDatabase();
  const [row] = await database
    .select()
    .from(exchangeRates)
    .where(and(eq(exchangeRates.currency, currency), lte(exchangeRates.quotedOn, on)))
    .orderBy(desc(exchangeRates.quotedOn))
    .limit(1);

  return row
    ? {
        currency: row.currency,
        quotedOn: localDate(row.quotedOn),
        rateMicros: row.rateMicros,
        source: row.source,
        stale: true,
      }
    : null;
}

async function store(quote: Quote): Promise<void> {
  await getDatabase()
    .insert(exchangeRates)
    .values({
      currency: quote.currency,
      quotedOn: quote.quotedOn as string,
      rateMicros: quote.rateMicros,
      source: quote.source,
    })
    .onConflictDoNothing();
}

type OlindaResponse = { value?: { cotacaoVenda?: number; dataHoraCotacao?: string }[] };

/**
 * Consulta o BCB, recuando dia a dia até achar uma cotação publicada.
 *
 * A PTAX não sai em fim de semana nem feriado. Recuar é o comportamento certo:
 * a cotação vigente num sábado é a de sexta.
 */
async function fetchFromBcb(target: LocalDate): Promise<Quote | null> {
  for (let recuo = 0; recuo < MAX_LOOKBACK; recuo += 1) {
    const dia = addDays(target, -recuo);
    const [ano, mes, dias] = dia.split("-");
    const url = `${OLINDA}?@dataCotacao='${mes}-${dias}-${ano}'&$top=1&$format=json&$select=cotacaoVenda,dataHoraCotacao`;

    try {
      const resposta = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!resposta.ok) continue;

      const corpo = (await resposta.json()) as OlindaResponse;
      const cotacao = corpo.value?.[0]?.cotacaoVenda;
      if (typeof cotacao !== "number" || !Number.isFinite(cotacao) || cotacao <= 0) continue;

      return {
        currency: "USD",
        quotedOn: dia,
        rateMicros: Math.round(cotacao * 1_000_000),
        source: "BCB PTAX",
        stale: recuo > 0,
      };
    } catch {
      // Rede fora, tempo esgotado ou resposta ilegível: tenta o dia anterior.
      // Falhar a importação inteira por causa do câmbio seria desproporcional.
      continue;
    }
  }

  return null;
}
