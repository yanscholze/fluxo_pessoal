"use client";

/**
 * Preferências que moram no navegador, não no React.
 *
 * Tema, acento, fonte e largura do menu são aplicados no `<html>` antes da
 * primeira pintura — é o que impede a tela de piscar branca antes de ficar
 * escura. O React chega depois e precisa apenas **ler** o que já está lá.
 *
 * Ler num efeito e chamar `setState` era o caminho óbvio e é o errado: o
 * componente monta com um valor, descarta e remonta com outro, em cascata a
 * cada navegação. `useSyncExternalStore` lê a fonte de verdade direto, devolve
 * o padrão durante a renderização no servidor e reidrata sem render extra.
 *
 * O `<html>` não emite evento quando muda, então quem escreve avisa. É o
 * bastante: essas preferências só mudam por ação nossa, nesta aba.
 */

import { useSyncExternalStore } from "react";

const ouvintes = new Set<() => void>();

function subscribe(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

/**
 * Lê uma preferência do documento.
 *
 * `ler` precisa devolver um primitivo — string, número ou booleano. Devolver
 * objeto novo a cada chamada faria o React considerar que o valor mudou em
 * toda renderização e entrar em laço.
 */
export function usePreferencia<T extends string | number | boolean>(
  ler: (raiz: HTMLElement) => T,
  padrao: T,
): T {
  return useSyncExternalStore(
    subscribe,
    () => ler(document.documentElement),
    () => padrao,
  );
}

/** Aplica a mudança no documento, persiste e avisa quem estiver lendo. */
export function gravarPreferencia(
  aplicar: (raiz: HTMLElement) => void,
  chave: string,
  valor: string,
): void {
  aplicar(document.documentElement);
  localStorage.setItem(chave, valor);
  for (const ouvinte of ouvintes) ouvinte();
}
