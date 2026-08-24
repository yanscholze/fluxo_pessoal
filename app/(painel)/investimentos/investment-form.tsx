"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const CLASSES = [
  ["fixed_income", "Renda fixa"],
  ["variable_income", "Renda variável"],
  ["fund", "Fundo"],
  ["crypto", "Cripto"],
  ["real_estate", "Imóvel"],
  ["other", "Outro"],
] as const;

const LIQUIDEZ = [
  ["daily", "Diária"],
  ["scheduled", "Programada"],
  ["maturity", "No vencimento"],
] as const;

export function InvestmentForm({ accounts }: { accounts: readonly { id: string; name: string }[] }) {
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
    const resposta = await fetch("/api/v1/investments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: dados.get("name"),
        institution: dados.get("institution") || null,
        assetClass: dados.get("assetClass"),
        liquidity: dados.get("liquidity"),
        maturityDate: dados.get("maturityDate") || null,
        principal: dados.get("principal"),
        currentValue: dados.get("currentValue") || null,
        accountId: dados.get("accountId") || null,
      }),
    });

    setEnviando(false);

    if (!resposta.ok) {
      const corpo = (await resposta.json().catch(() => ({}))) as {
        error?: { message?: string; issues?: { path: string; message: string }[] };
      };
      setErro(corpo.error?.message ?? "Não foi possível cadastrar o investimento.");
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
        Novo investimento
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Novo investimento"
        className="max-h-dvh w-full max-w-md overflow-y-auto rounded-t-[--radius-card] border border-line bg-surface p-5 shadow-[--shadow-raised] sm:rounded-[--radius-card]"
      >
        <header className="mb-4 flex items-center justify-between">
          <h2 className="text-[1.0625rem] font-semibold text-ink">Novo investimento</h2>
          <button
            type="button"
            onClick={() => setAberto(false)}
            className="rounded-[--radius-control] px-2 py-1 text-[0.8125rem] text-ink-muted hover:bg-surface-sunken"
          >
            Fechar
          </button>
        </header>

        <form onSubmit={enviar} className="space-y-4" noValidate>
          <Campo rotulo="Nome do ativo" erro={issues.name}>
            <input name="name" required maxLength={80} className={entrada(issues.name)} />
          </Campo>

          <Campo rotulo="Instituição" dica="Opcional">
            <input name="institution" maxLength={60} className={entrada()} />
          </Campo>

          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Classe">
              <select name="assetClass" className={entrada()} defaultValue="fixed_income">
                {CLASSES.map(([valor, rotulo]) => (
                  <option key={valor} value={valor}>
                    {rotulo}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Liquidez">
              <select name="liquidity" className={entrada()} defaultValue="daily">
                {LIQUIDEZ.map(([valor, rotulo]) => (
                  <option key={valor} value={valor}>
                    {rotulo}
                  </option>
                ))}
              </select>
            </Campo>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Valor aportado" erro={issues.principal}>
              <input
                name="principal"
                required
                inputMode="decimal"
                placeholder="0,00"
                className={`${entrada(issues.principal)} tabular`}
              />
            </Campo>
            <Campo rotulo="Valor atual" dica="Vazio = igual ao aporte">
              <input name="currentValue" inputMode="decimal" placeholder="0,00" className={`${entrada()} tabular`} />
            </Campo>
          </div>

          <Campo rotulo="Vencimento" dica="Opcional">
            <input name="maturityDate" type="date" className={entrada()} />
          </Campo>

          <Campo rotulo="Conta de custódia" dica="Opcional">
            <select name="accountId" className={entrada()}>
              <option value="">Nenhuma</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </Campo>

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
            {enviando ? "Cadastrando…" : "Cadastrar"}
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
