"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function GoalForm({ accounts }: { accounts: readonly { id: string; name: string }[] }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [issues, setIssues] = useState<Record<string, string>>({});

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);
    setIssues({});

    const dados = new FormData(evento.currentTarget);
    const resposta = await fetch("/api/v1/goals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: dados.get("name"),
        target: dados.get("target"),
        monthlyContribution: dados.get("monthlyContribution") || null,
        targetDate: dados.get("targetDate") || null,
        accountId: dados.get("accountId") || null,
      }),
    });

    setEnviando(false);

    if (!resposta.ok) {
      const corpo = (await resposta.json().catch(() => ({}))) as {
        error?: { message?: string; issues?: { path: string; message: string }[] };
      };
      setErro(corpo.error?.message ?? "Não foi possível criar a meta.");
      setIssues(Object.fromEntries((corpo.error?.issues ?? []).map((issue) => [issue.path, issue.message])));
      return;
    }

    setAberto(false);
    router.refresh();
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="inline-flex h-9 shrink-0 select-none items-center justify-center gap-2 rounded-md border border-transparent bg-accent px-3.5 text-body-sm font-medium text-accent-ink transition-colors hover:bg-accent-hover disabled:pointer-events-none disabled:opacity-45"
      >
        Nova meta
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Nova meta"
        className="max-h-dvh w-full max-w-md overflow-y-auto rounded-t-[--radius-card] border border-line bg-surface p-5 shadow-float sm:rounded-lg"
      >
        <header className="mb-4 flex items-center justify-between">
          <h2 className="text-title font-semibold text-ink">Nova meta</h2>
          <button
            type="button"
            onClick={() => setAberto(false)}
            className="rounded-md px-2 py-1 text-body-sm text-ink-muted hover:bg-surface-sunken"
          >
            Fechar
          </button>
        </header>

        <form onSubmit={enviar} className="space-y-4" noValidate>
          <Campo rotulo="Objetivo" erro={issues.name}>
            <input name="name" required maxLength={80} placeholder="Viagem, reserva, carro…" className={entrada(issues.name)} />
          </Campo>

          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Quanto quer juntar" erro={issues.target}>
              <input
                name="target"
                required
                inputMode="decimal"
                placeholder="0,00"
                className={`${entrada(issues.target)} tabular`}
              />
            </Campo>
            <Campo rotulo="Aporte mensal" dica="Base da previsão">
              <input
                name="monthlyContribution"
                inputMode="decimal"
                placeholder="0,00"
                className={`${entrada()} tabular`}
              />
            </Campo>
          </div>

          <Campo rotulo="Prazo desejado" dica="Opcional — usado para avisar se o ritmo não alcança">
            <input name="targetDate" type="date" className={entrada()} />
          </Campo>

          <Campo
            rotulo="Conta que lastreia"
            dica="Quando informada, o acumulado é o saldo dela — não um número à parte"
          >
            <select name="accountId" className={entrada()}>
              <option value="">Registrar aportes manualmente</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </Campo>

          {erro ? (
            <p role="alert" className="rounded-md bg-negative-wash px-3 py-2 text-body-sm text-negative">
              {erro}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={enviando}
            className="inline-flex h-9 shrink-0 select-none items-center justify-center gap-2 rounded-md border border-transparent bg-accent px-3.5 text-body-sm font-medium text-accent-ink transition-colors hover:bg-accent-hover disabled:pointer-events-none disabled:opacity-45 w-full"
          >
            {enviando ? "Criando…" : "Criar meta"}
          </button>
        </form>
      </div>
    </div>
  );
}

function entrada(erro?: string): string {
  return `h-10 w-full rounded-md border bg-surface px-3 text-body text-ink outline-none ${
    erro ? "border-negative" : "border-line focus:border-accent"
  }`;
}

function Campo({
  rotulo,
  erro,
  dica,
  children,
}: {
  rotulo: string;
  erro?: string;
  dica?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-body-sm font-medium text-ink">{rotulo}</span>
      {children}
      {erro ? <span className="mt-1 block text-caption text-negative">{erro}</span> : null}
      {!erro && dica ? <span className="mt-1 block text-caption text-ink-subtle">{dica}</span> : null}
    </label>
  );
}
