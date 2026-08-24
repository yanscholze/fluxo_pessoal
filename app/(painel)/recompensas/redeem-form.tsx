"use client";

/**
 * Resgate de pontos ou cashback.
 *
 * Cashback exige conta de destino porque ele vira dinheiro de verdade: um
 * lançamento de receita entra na conta escolhida. Pontos saem só do saldo de
 * recompensa — não são dinheiro e não passam pelo razão.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import { decimal, money } from "../../ui/format.ts";

type Tipo = "points" | "cashback";

export function RedeemForm({
  cardId,
  cardName,
  pointsMilli,
  cashbackCents,
  accounts,
  hasPoints,
  hasCashback,
}: {
  cardId: string;
  cardName: string;
  pointsMilli: number;
  cashbackCents: number;
  accounts: readonly { id: string; name: string }[];
  hasPoints: boolean;
  hasCashback: boolean;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [tipo, setTipo] = useState<Tipo>(hasPoints ? "points" : "cashback");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const disponivel = tipo === "points" ? pointsMilli : cashbackCents;
  const semSaldo = pointsMilli === 0 && cashbackCents === 0;

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);

    const dados = new FormData(evento.currentTarget);
    const resposta = await fetch("/api/v1/rewards", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        cardId,
        kind: tipo,
        amount: dados.get("amount"),
        accountId: tipo === "cashback" ? dados.get("accountId") : null,
        note: dados.get("note") || null,
      }),
    });

    setEnviando(false);

    if (!resposta.ok) {
      const corpo = (await resposta.json().catch(() => ({}))) as { error?: { message?: string } };
      setErro(corpo.error?.message ?? "Não foi possível registrar o resgate.");
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
        disabled={semSaldo}
        title={semSaldo ? "Nenhum saldo resgatável ainda" : undefined}
        className="h-9 rounded-[--radius-control] bg-accent px-4 text-[0.8125rem] font-semibold text-accent-ink disabled:opacity-50"
      >
        Resgatar
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Resgatar recompensa do ${cardName}`}
        className="max-h-dvh w-full max-w-md overflow-y-auto rounded-t-[--radius-card] border border-line bg-surface p-5 shadow-[--shadow-raised] sm:rounded-[--radius-card]"
      >
        <header className="mb-4 flex items-center justify-between">
          <h2 className="text-[1.0625rem] font-semibold text-ink">Resgatar · {cardName}</h2>
          <button
            type="button"
            onClick={() => setAberto(false)}
            className="rounded-[--radius-control] px-2 py-1 text-[0.8125rem] text-ink-muted hover:bg-surface-sunken"
          >
            Fechar
          </button>
        </header>

        <form onSubmit={enviar} className="space-y-4" noValidate>
          {hasPoints && hasCashback ? (
            <fieldset>
              <legend className="mb-1.5 text-[0.8125rem] font-medium text-ink">O que resgatar</legend>
              <div className="grid grid-cols-2 gap-1.5">
                {(
                  [
                    ["points", "Pontos"],
                    ["cashback", "Cashback"],
                  ] as const
                ).map(([valor, rotulo]) => (
                  <button
                    key={valor}
                    type="button"
                    onClick={() => setTipo(valor)}
                    aria-pressed={tipo === valor}
                    className={`h-9 rounded-[--radius-control] border text-[0.8125rem] ${
                      tipo === valor
                        ? "border-accent bg-accent-wash font-medium text-accent"
                        : "border-line text-ink-muted"
                    }`}
                  >
                    {rotulo}
                  </button>
                ))}
              </div>
            </fieldset>
          ) : null}

          <label className="block">
            <span className="mb-1.5 block text-[0.8125rem] font-medium text-ink">
              {tipo === "points" ? "Quantos pontos" : "Quanto"}
            </span>
            <input
              name="amount"
              required
              inputMode={tipo === "points" ? "numeric" : "decimal"}
              placeholder={tipo === "points" ? "0" : "0,00"}
              className="tabular h-10 w-full rounded-[--radius-control] border border-line bg-surface px-3 text-[0.875rem] text-ink outline-none focus:border-accent"
            />
            <span className="mt-1 block text-[0.75rem] text-ink-subtle">
              Disponível: {tipo === "points" ? `${decimal(disponivel / 1000, 0)} pontos` : money(disponivel)}
            </span>
          </label>

          {tipo === "cashback" ? (
            <label className="block">
              <span className="mb-1.5 block text-[0.8125rem] font-medium text-ink">Conta que recebe</span>
              <select
                name="accountId"
                required
                className="h-10 w-full rounded-[--radius-control] border border-line bg-surface px-3 text-[0.875rem] text-ink outline-none focus:border-accent"
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-[0.75rem] text-ink-subtle">
                O cashback entra como receita nesta conta.
              </span>
            </label>
          ) : null}

          <label className="block">
            <span className="mb-1.5 block text-[0.8125rem] font-medium text-ink">Observação</span>
            <input
              name="note"
              maxLength={180}
              placeholder="Passagem, milhas transferidas…"
              className="h-10 w-full rounded-[--radius-control] border border-line bg-surface px-3 text-[0.875rem] text-ink outline-none focus:border-accent"
            />
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
            {enviando ? "Registrando…" : "Registrar resgate"}
          </button>
        </form>
      </div>
    </div>
  );
}
