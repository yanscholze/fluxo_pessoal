"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const MIN_SENHA = 10;

export function PasswordForm() {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    setSucesso(false);

    const dados = new FormData(evento.currentTarget);
    const nova = String(dados.get("newPassword") ?? "");
    if (nova.length < MIN_SENHA) {
      setErro(`A nova senha precisa ter ao menos ${MIN_SENHA} caracteres.`);
      return;
    }
    if (nova !== String(dados.get("confirmPassword") ?? "")) {
      setErro("A confirmação não confere com a nova senha.");
      return;
    }

    setEnviando(true);
    const resposta = await fetch("/api/v1/session/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentPassword: dados.get("currentPassword"), newPassword: nova }),
    });
    setEnviando(false);

    if (!resposta.ok) {
      const corpo = (await resposta.json().catch(() => ({}))) as { error?: { message?: string } };
      setErro(corpo.error?.message ?? "Não foi possível trocar a senha.");
      return;
    }

    setSucesso(true);
    // Trocar a senha revoga todas as sessões, inclusive esta.
    setTimeout(() => {
      router.replace("/entrar");
      router.refresh();
    }, 1500);
  }

  return (
    <form onSubmit={enviar} className="max-w-sm space-y-3" noValidate>
      <Campo rotulo="Senha atual" nome="currentPassword" autoComplete="current-password" />
      <Campo
        rotulo="Nova senha"
        nome="newPassword"
        autoComplete="new-password"
        dica={`Ao menos ${MIN_SENHA} caracteres`}
      />
      <Campo rotulo="Confirme a nova senha" nome="confirmPassword" autoComplete="new-password" />

      {erro ? (
        <p role="alert" className="rounded-md bg-negative-wash px-3 py-2 text-body-sm text-negative">
          {erro}
        </p>
      ) : null}

      {sucesso ? (
        <p className="rounded-md bg-positive-wash px-3 py-2 text-body-sm text-positive">
          Senha trocada. Todos os aparelhos foram desconectados — entrando de novo…
        </p>
      ) : null}

      <button
        type="submit"
        disabled={enviando || sucesso}
        className="inline-flex h-9 shrink-0 select-none items-center justify-center gap-2 rounded-md border border-transparent bg-accent px-3.5 text-body-sm font-medium text-accent-ink transition-colors hover:bg-accent-hover disabled:pointer-events-none disabled:opacity-45"
      >
        {enviando ? "Trocando…" : "Trocar senha"}
      </button>
    </form>
  );
}

function Campo({
  rotulo,
  nome,
  autoComplete,
  dica,
}: {
  rotulo: string;
  nome: string;
  autoComplete: string;
  dica?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-body-sm font-medium text-ink">{rotulo}</span>
      <input
        name={nome}
        type="password"
        required
        autoComplete={autoComplete}
        className="h-9 w-full rounded-md border border-line-strong bg-surface-sunken px-3 text-body text-ink placeholder:text-ink-subtle transition-colors focus:border-accent focus:outline-none disabled:opacity-50"
      />
      {dica ? <span className="mt-1 block text-caption text-ink-subtle">{dica}</span> : null}
    </label>
  );
}
