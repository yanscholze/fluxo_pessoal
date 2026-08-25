"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "../../ui/controls.tsx";
import { Plus } from "../../ui/icons.tsx";

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

export function InvestmentForm({
  accounts,
  label = "Novo aporte",
}: {
  accounts: readonly { id: string; name: string }[];
  /** O texto muda conforme o contexto: no vazio, ele convida a começar. */
  label?: string;
}) {
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
      <Button variant="primary" icon={Plus} onClick={() => setAberto(true)}>
        {label}
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Novo investimento"
        className="max-h-dvh w-full max-w-md overflow-y-auto rounded-t-[--radius-card] border border-line bg-surface p-5 shadow-float sm:rounded-lg"
      >
        <header className="mb-4 flex items-center justify-between">
          <h2 className="text-title font-semibold text-ink">Novo investimento</h2>
          <button
            type="button"
            onClick={() => setAberto(false)}
            className="rounded-md px-2 py-1 text-body-sm text-ink-muted hover:bg-surface-sunken"
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
            <p role="alert" className="rounded-md bg-negative-wash px-3 py-2 text-body-sm text-negative">
              {erro}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={enviando}
            className="inline-flex h-9 shrink-0 select-none items-center justify-center gap-2 rounded-md border border-transparent bg-accent px-3.5 text-body-sm font-medium text-accent-ink transition-colors hover:bg-accent-hover disabled:pointer-events-none disabled:opacity-45 w-full"
          >
            {enviando ? "Cadastrando…" : "Cadastrar"}
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
