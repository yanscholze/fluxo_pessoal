"use client";

/**
 * Consulta ao assistente.
 *
 * As sugestões prontas existem porque tela em branco com campo de texto não
 * ensina o que dá para perguntar — e uma pergunta ruim gasta cota à toa.
 */

import { useState } from "react";

import { Badge } from "../../ui/primitives.tsx";

type Acao = { label: string; reason: string; priority: "alta" | "media" | "baixa" };

type Resposta = {
  answer: string;
  summary: string;
  actions: Acao[];
  warnings: string[];
  remaining: number;
};

const SUGESTOES = [
  "Posso gastar R$ 500 este mês sem apertar?",
  "Onde meu dinheiro está indo mais do que eu imagino?",
  "Vale a pena antecipar alguma parcela agora?",
  "Minha reserva de emergência está no caminho certo?",
];

const TOM_PRIORIDADE = { alta: "negative", media: "caution", baixa: "neutral" } as const;

export function AssistantChat({ remaining }: { remaining: number }) {
  const [pergunta, setPergunta] = useState("");
  const [resposta, setResposta] = useState<Resposta | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [restantes, setRestantes] = useState(remaining);

  async function perguntar(texto: string) {
    if (!texto.trim() || enviando) return;

    setEnviando(true);
    setErro(null);

    const http = await fetch("/api/v1/assistant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: texto }),
    });

    setEnviando(false);

    if (!http.ok) {
      const corpo = (await http.json().catch(() => ({}))) as { error?: { message?: string } };
      setErro(corpo.error?.message ?? "Não foi possível consultar o assistente.");
      return;
    }

    const corpo = (await http.json()) as { data: Resposta };
    setResposta(corpo.data);
    setRestantes(corpo.data.remaining);
  }

  const semCota = restantes <= 0;

  return (
    <div>
      <form
        onSubmit={(evento) => {
          evento.preventDefault();
          perguntar(pergunta);
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <input
          value={pergunta}
          onChange={(evento) => setPergunta(evento.target.value)}
          maxLength={500}
          disabled={semCota}
          placeholder="O que você quer saber?"
          className="h-11 flex-1 rounded-[--radius-control] border border-line bg-surface px-3 text-[0.875rem] text-ink outline-none focus:border-accent disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={enviando || semCota || pergunta.trim().length < 3}
          className="h-11 rounded-[--radius-control] bg-accent px-5 text-[0.875rem] font-semibold text-accent-ink disabled:opacity-60"
        >
          {enviando ? "Pensando…" : "Perguntar"}
        </button>
      </form>

      {!resposta && !enviando ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {SUGESTOES.map((sugestao) => (
            <li key={sugestao}>
              <button
                type="button"
                disabled={semCota}
                onClick={() => {
                  setPergunta(sugestao);
                  perguntar(sugestao);
                }}
                className="rounded-full border border-line px-3 py-1.5 text-[0.75rem] text-ink-muted hover:bg-surface-sunken disabled:opacity-50"
              >
                {sugestao}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {erro ? (
        <p role="alert" className="mt-3 rounded-[--radius-control] bg-negative-wash px-3 py-2 text-[0.8125rem] text-negative">
          {erro}
        </p>
      ) : null}

      {resposta ? (
        <article className="mt-4 rounded-[--radius-control] border border-line bg-surface-sunken p-4">
          <p className="text-[0.8125rem] font-medium text-ink-muted">{resposta.summary}</p>
          <p className="mt-2 whitespace-pre-line text-[0.9375rem] leading-relaxed text-ink">
            {resposta.answer}
          </p>

          {resposta.actions.length ? (
            <>
              <h3 className="mt-4 mb-2 text-[0.8125rem] font-semibold text-ink">O que fazer</h3>
              <ul className="space-y-2">
                {resposta.actions.map((acao) => (
                  <li key={acao.label} className="flex items-start gap-2">
                    <Badge tone={TOM_PRIORIDADE[acao.priority]}>{acao.priority}</Badge>
                    <span className="min-w-0">
                      <span className="block text-[0.875rem] text-ink">{acao.label}</span>
                      <span className="block text-[0.75rem] text-ink-subtle">{acao.reason}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {resposta.warnings.length ? (
            <ul className="mt-4 space-y-1">
              {resposta.warnings.map((aviso) => (
                <li key={aviso} className="text-[0.75rem] text-caution">
                  {aviso}
                </li>
              ))}
            </ul>
          ) : null}

          <p className="mt-4 border-t border-line pt-3 text-[0.6875rem] text-ink-subtle">
            Respostas do assistente saem dos seus próprios dados e podem conter erro. Ele não
            recomenda investimento — para isso, procure um profissional registrado.
          </p>
        </article>
      ) : null}

      {semCota ? (
        <p className="mt-3 text-[0.8125rem] text-caution">
          Você usou todas as consultas de hoje. A cota volta amanhã.
        </p>
      ) : null}
    </div>
  );
}
