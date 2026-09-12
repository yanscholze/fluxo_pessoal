"use client";

/**
 * O convite para instalar.
 *
 * O Chrome dispara `beforeinstallprompt` uma vez e, se ninguém o segurar, o
 * convite se perde: sobra o ícone discreto na barra de endereço, que quase
 * ninguém encontra. Aqui ele é guardado e vira um botão de verdade — que some
 * sozinho depois de instalado ou recusado.
 *
 * Quem registra o service worker é o layout raiz. Tem de ser lá: o Chrome
 * decide se oferece a instalação na primeira página carregada, e enquanto o
 * registro vivia aqui — dentro da barra lateral do painel — ele só acontecia
 * depois do login, tarde demais.
 */

import { useEffect, useState } from "react";

import { Download } from "./icons.tsx";
import { join } from "./primitives.tsx";

/** O evento do Chrome, que ainda não está na biblioteca padrão de tipos. */
type ConviteDeInstalacao = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallApp({ className }: { className?: string }) {
  const [convite, setConvite] = useState<ConviteDeInstalacao | null>(null);

  useEffect(() => {
    // O registro do service worker mora no layout raiz: precisa acontecer na
    // primeira página, que é a de login, e não só depois de entrar no painel.
    function aoPoderInstalar(evento: Event) {
      // Sem isto o Chrome mostra o próprio aviso, no momento dele.
      evento.preventDefault();
      setConvite(evento as ConviteDeInstalacao);
    }

    function aoInstalar() {
      setConvite(null);
    }

    window.addEventListener("beforeinstallprompt", aoPoderInstalar);
    window.addEventListener("appinstalled", aoInstalar);

    return () => {
      window.removeEventListener("beforeinstallprompt", aoPoderInstalar);
      window.removeEventListener("appinstalled", aoInstalar);
    };
  }, []);

  // Nada a oferecer: já instalado, navegador sem suporte, ou o convite já foi
  // usado. Um botão que não faz nada é pior que nenhum botão.
  if (!convite) return null;

  return (
    <button
      type="button"
      onClick={async () => {
        await convite.prompt();
        const { outcome } = await convite.userChoice;
        // O convite é de uso único: aceito ou recusado, ele não serve mais.
        if (outcome) setConvite(null);
      }}
      className={join(
        "inline-flex h-8 shrink-0 select-none items-center gap-1.5 rounded-md px-2.5 text-body-sm text-ink-muted transition-colors hover:bg-surface-inset hover:text-ink",
        className,
      )}
    >
      <Download size={15} strokeWidth={1.5} aria-hidden />
      <span>Instalar</span>
    </button>
  );
}
