"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Confirmação do código exibido no celular.
 *
 * O campo aceita minúscula e converte: quem digita de um celular olhando para
 * outro não deveria errar por causa de caixa.
 */
export function PairingForm() {
  const router = useRouter();
  const [codigo, setCodigo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aprovado, setAprovado] = useState(false);

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);

    const resposta = await fetch("/api/v1/pairing", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: codigo.trim().toUpperCase() }),
    });

    setEnviando(false);

    if (!resposta.ok) {
      const corpo = (await resposta.json().catch(() => ({}))) as { error?: { message?: string } };
      setErro(
        corpo.error?.message === "Código de pareamento não encontrado"
          ? "Código inválido ou expirado. Peça um novo no aplicativo."
          : (corpo.error?.message ?? "Não foi possível autorizar."),
      );
      return;
    }

    setAprovado(true);
    setCodigo("");
    router.refresh();
  }

  if (aprovado) {
    return (
      <div className="rounded-[--radius-control] bg-positive-wash px-4 py-3">
        <p className="text-[0.875rem] font-medium text-positive">Aparelho autorizado.</p>
        <p className="mt-1 text-[0.8125rem] text-positive">
          O aplicativo conclui a conexão em alguns segundos.
        </p>
        <button
          type="button"
          onClick={() => setAprovado(false)}
          className="mt-3 text-[0.8125rem] font-medium text-positive underline-offset-2 hover:underline"
        >
          Conectar outro aparelho
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <label className="flex-1">
        <span className="sr-only">Código de seis caracteres</span>
        <input
          value={codigo}
          onChange={(evento) => setCodigo(evento.target.value.toUpperCase())}
          maxLength={8}
          autoComplete="one-time-code"
          inputMode="text"
          placeholder="A1B2C3"
          className="tabular h-12 w-full rounded-[--radius-control] border border-line bg-surface px-4 text-center text-[1.25rem] font-semibold tracking-[0.3em] text-ink outline-none focus:border-accent sm:text-left"
        />
      </label>

      <button
        type="submit"
        disabled={enviando || codigo.trim().length < 4}
        className="h-12 rounded-[--radius-control] bg-accent px-5 text-[0.875rem] font-semibold text-accent-ink disabled:opacity-60"
      >
        {enviando ? "Autorizando…" : "Autorizar"}
      </button>

      {erro ? (
        <p role="alert" className="w-full text-[0.8125rem] text-negative sm:w-auto">
          {erro}
        </p>
      ) : null}
    </form>
  );
}
