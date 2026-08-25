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
      {erro ? <span className="text-caption text-negative">{erro}</span> : null}
      <button
        type="button"
        onClick={confirmar}
        disabled={enviando}
        className="inline-flex h-8 shrink-0 select-none items-center justify-center gap-1.5 rounded-md border border-transparent bg-accent px-2.5 text-body-sm font-medium text-accent-ink transition-colors hover:bg-accent-hover disabled:pointer-events-none disabled:opacity-45"
      >
        {enviando ? "Confirmando…" : `Confirmar ${money(amountCents)}`}
      </button>
    </span>
  );
}
