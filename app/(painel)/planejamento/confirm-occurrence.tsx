"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { Competence } from "../../../core/time/competence.ts";
import { money } from "../../ui/format.ts";

/**
 * Confirma que a ocorrência aconteceu.
 *
 * A operação é idempotente no servidor, então um duplo clique não credita duas
 * vezes — mas o botão desabilita mesmo assim, porque piscar duas vezes assusta.
 */
export function ConfirmOccurrence({
  recurrenceId,
  competence,
  amountCents,
}: {
  recurrenceId: string;
  competence: Competence;
  amountCents: number;
}) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function confirmar() {
    setEnviando(true);
    setErro(null);

    const resposta = await fetch("/api/v1/recurrences/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recurrenceId, competence }),
    });

    if (!resposta.ok) {
      const corpo = (await resposta.json().catch(() => ({}))) as { error?: { message?: string } };
      setErro(corpo.error?.message ?? "Não foi possível confirmar.");
      setEnviando(false);
      return;
    }

    router.refresh();
    setEnviando(false);
  }

  return (
    <span className="flex items-center gap-2">
      {erro ? <span className="text-[0.75rem] text-negative">{erro}</span> : null}
      <button
        type="button"
        onClick={confirmar}
        disabled={enviando}
        className="h-8 rounded-[--radius-control] bg-accent px-3 text-[0.8125rem] font-semibold text-accent-ink disabled:opacity-60"
      >
        {enviando ? "Confirmando…" : `Confirmar ${money(amountCents)}`}
      </button>
    </span>
  );
}
