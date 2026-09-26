"use client";

/**
 * Sair da conta.
 *
 * Morava na barra lateral, num par de ícones sem rótulo ao lado do seletor de
 * tema. O desenho do Mesa não tem esse par — a lateral dele termina no cartão
 * do usuário —, e a saída veio para cá, que é onde ela já era procurada por
 * quem não achava o ícone.
 *
 * Fica na aba de Segurança, junto da troca de senha: as duas respondem à mesma
 * pergunta, "quem consegue entrar nesta conta".
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "../../ui/controls.tsx";
import { LogOut } from "../../ui/icons.tsx";

export function SignOut() {
  const router = useRouter();
  const [saindo, setSaindo] = useState(false);

  async function sair() {
    setSaindo(true);
    await fetch("/api/v1/session", { method: "DELETE" });
    router.replace("/entrar");
    router.refresh();
  }

  return (
    <Button variant="secondary" icon={LogOut} busy={saindo} onClick={() => void sair()}>
      Sair desta conta
    </Button>
  );
}
