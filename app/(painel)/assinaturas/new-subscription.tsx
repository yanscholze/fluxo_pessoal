"use client";

/**
 * Botão de cadastrar assinatura.
 *
 * Faltava: a única forma de registrar uma era ir em Recorrências e escolher o
 * papel certo — a tela que fala de assinatura não deixava criar uma.
 */

import { useState } from "react";

import { Button } from "../../ui/controls.tsx";
import { Plus } from "../../ui/icons.tsx";
import { type Opcoes, SubscriptionForm } from "./subscription-form.tsx";

export function NewSubscription({ opcoes }: { opcoes: Opcoes }) {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <Button variant="primary" icon={Plus} onClick={() => setAberto(true)}>
        Nova assinatura
      </Button>

      <SubscriptionForm open={aberto} onClose={() => setAberto(false)} opcoes={opcoes} />
    </>
  );
}
