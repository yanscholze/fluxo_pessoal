"use client";

/**
 * Registro do service worker, em toda página.
 *
 * Isto vivia dentro do botão "Instalar", que por sua vez vive na barra lateral
 * do painel — ou seja, só depois de entrar. E o Chrome decide se oferece a
 * instalação **na primeira página que carrega**, que é a de login: sem service
 * worker ativo ali, ele nunca oferece, e o aplicativo simplesmente não aparecia
 * como instalável no computador.
 *
 * Registrar é seguro fora da sessão porque o service worker não guarda dado de
 * ninguém: ele põe em cache ícones, fontes e o manifesto, nunca a API nem uma
 * página com números dentro. Um extrato servido do cache é um extrato velho
 * apresentado como atual, e num aplicativo cuja promessa é "o saldo está certo"
 * isso é pior do que não abrir.
 */

import { useEffect } from "react";

export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // Falhar aqui não pode derrubar nada: sem service worker o aplicativo
    // continua inteiro, só não é instalável.
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  return null;
}
