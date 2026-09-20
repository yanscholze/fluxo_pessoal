"use client";

/**
 * A voz do TARS.
 *
 * O gráfico de som mora no centro do orbe, no topo da página; a conversa mora
 * no fim dela. São duas árvores de componentes distantes e sem ancestral comum
 * do lado do cliente — o orbe é renderizado no servidor. Por isso a ligação
 * entre "o TARS está respondendo" e "as barras se mexem" não é `props` nem
 * contexto: é esta loja de módulo, que qualquer componente do cliente assina.
 *
 * São três estados, e cada um significa uma coisa que de fato acontece:
 *
 * - `pensando` — existe uma requisição em curso para o assistente;
 * - `falando`  — a resposta chegou e está na tela sendo lida;
 * - `quieto`   — nenhuma das duas.
 *
 * `falando` termina sozinho porque não há áudio: o fim da fala é o fim da
 * leitura, estimado pelo tamanho do texto. Deixar as barras se mexendo para
 * sempre depois da resposta seria um indicador que não indica nada.
 */

import { useSyncExternalStore } from "react";

export type VozDoTars = "quieto" | "pensando" | "falando";

let estado: VozDoTars = "quieto";
const ouvintes = new Set<() => void>();
let relogio: ReturnType<typeof setTimeout> | undefined;

/** Ritmo de leitura em voz alta, em caracteres por segundo. */
const RITMO = 14;
/** Uma resposta de uma linha ainda merece um instante de fala. */
const FALA_MINIMA = 1_800;
/** Acima disto o indicador deixa de informar e vira enfeite que não para. */
const FALA_MAXIMA = 7_000;

function anunciar(novo: VozDoTars): void {
  clearTimeout(relogio);
  relogio = undefined;
  if (estado === novo) return;
  estado = novo;
  for (const ouvinte of ouvintes) ouvinte();
}

export function tarsPensa(): void {
  anunciar("pensando");
}

export function tarsFala(texto: string): void {
  anunciar("falando");
  const duracao = Math.min(FALA_MAXIMA, Math.max(FALA_MINIMA, (texto.length / RITMO) * 1_000));
  relogio = setTimeout(() => anunciar("quieto"), duracao);
}

export function tarsCala(): void {
  anunciar("quieto");
}

function inscrever(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

/**
 * No servidor o TARS está sempre quieto: a primeira pintura é a mesma dos dois
 * lados, e a animação só começa depois que alguém pergunta alguma coisa.
 */
export function useVozDoTars(): VozDoTars {
  return useSyncExternalStore(
    inscrever,
    () => estado,
    () => "quieto" as const,
  );
}
