"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const TIPOS = [
  ["checking", "Conta corrente"],
  ["savings", "Poupança"],
  ["cash", "Dinheiro"],
  ["benefit", "Benefício"],
  ["investment", "Investimento"],
] as const;

const MOEDAS = ["BRL", "USD", "EUR", "GBP", "ARS", "CAD", "JPY", "CHF"] as const;

export function NewAccount() {
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
    const resposta = await fetch("/api/v1/accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: dados.get("name"),
        kind: dados.get("kind"),
        institution: dados.get("institution") || null,
        currency: dados.get("currency"),
        openingBalance: dados.get("openingBalance") || "0",
        openedOn: dados.get("openedOn") || null,
        goalAmount: dados.get("goalAmount") || null,
        includeInTotals: dados.get("includeInTotals") === "on",
      }),
    });

    setEnviando(false);

    if (!resposta.ok) {
      const corpo = (await resposta.json().catch(() => ({}))) as {
        error?: { message?: string; issues?: { path: string; message: string }[] };
      };
      setErro(corpo.error?.message ?? "Não foi possível cadastrar a conta.");
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
        className="h-10 rounded-[--radius-control] bg-accent px-4 text-[0.875rem] font-semibold text-accent-ink"
      >
        Nova conta
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Nova conta"
        className="max-h-dvh w-full max-w-md overflow-y-auto rounded-t-[--radius-card] border border-line bg-surface p-5 shadow-[--shadow-raised] sm:rounded-[--radius-card]"
      >
        <header className="mb-4 flex items-center justify-between">
          <h2 className="text-[1.0625rem] font-semibold text-ink">Nova conta</h2>
          <button
            type="button"
            onClick={() => setAberto(false)}
            className="rounded-[--radius-control] px-2 py-1 text-[0.8125rem] text-ink-muted hover:bg-surface-sunken"
          >
            Fechar
          </button>
        </header>

        <form onSubmit={enviar} className="space-y-4" noValidate>
          <Campo rotulo="Nome" erro={issues.name}>
            <input name="name" required maxLength={60} className={entrada(issues.name)} />
          </Campo>

          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Tipo" erro={issues.kind}>
              <select name="kind" className={entrada(issues.kind)} defaultValue="checking">
                {TIPOS.map(([valor, rotulo]) => (
                  <option key={valor} value={valor}>
                    {rotulo}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Moeda" erro={issues.currency}>
              <select name="currency" className={entrada(issues.currency)} defaultValue="BRL">
                {MOEDAS.map((moeda) => (
                  <option key={moeda} value={moeda}>
                    {moeda}
                  </option>
                ))}
              </select>
            </Campo>
          </div>

          <Campo rotulo="Instituição" dica="Opcional">
            <input name="institution" maxLength={60} className={entrada()} />
          </Campo>

          <div className="grid grid-cols-2 gap-3">
            <Campo
              rotulo="Saldo de abertura"
              erro={issues.openingBalance}
              dica="Quanto havia quando entrou no Fluxo"
            >
              <input
                name="openingBalance"
                inputMode="decimal"
                placeholder="0,00"
                className={`${entrada(issues.openingBalance)} tabular`}
              />
            </Campo>
            <Campo rotulo="Desde" erro={issues.openedOn}>
              <input name="openedOn" type="date" className={entrada(issues.openedOn)} />
            </Campo>
          </div>

          <Campo rotulo="Meta de reserva" dica="Opcional">
            <input name="goalAmount" inputMode="decimal" placeholder="0,00" className={`${entrada()} tabular`} />
          </Campo>

          <label className="flex items-start gap-2.5">
            <input name="includeInTotals" type="checkbox" defaultChecked className="mt-0.5" />
            <span className="text-[0.8125rem] text-ink">
              Somar nos totais
              <span className="mt-0.5 block text-[0.75rem] text-ink-subtle">
                Desmarque para contas usadas só como anotação — elas ficam fora do saldo total e do livre
                para gastar.
              </span>
            </span>
          </label>

          {erro ? (
            <p role="alert" className="rounded-[--radius-control] bg-negative-wash px-3 py-2 text-[0.8125rem] text-negative">
              {erro}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={enviando}
            className="h-11 w-full rounded-[--radius-control] bg-accent text-[0.875rem] font-semibold text-accent-ink disabled:opacity-60"
          >
            {enviando ? "Cadastrando…" : "Cadastrar conta"}
          </button>
        </form>
      </div>
    </div>
  );
}

function entrada(erro?: string): string {
  return `h-10 w-full rounded-[--radius-control] border bg-surface px-3 text-[0.875rem] text-ink outline-none ${
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
      <span className="mb-1.5 block text-[0.8125rem] font-medium text-ink">{rotulo}</span>
      {children}
      {erro ? <span className="mt-1 block text-[0.75rem] text-negative">{erro}</span> : null}
      {!erro && dica ? <span className="mt-1 block text-[0.75rem] text-ink-subtle">{dica}</span> : null}
    </label>
  );
}
