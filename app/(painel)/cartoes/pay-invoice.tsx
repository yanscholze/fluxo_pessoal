"use client";

/**
 * Pagamento de fatura.
 *
 * A tela deixa explícito que isto **não** é uma nova despesa: o dinheiro sai
 * da conta e abate a dívida do cartão. As compras já foram contadas quando
 * aconteceram.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { CardsView, InvoiceView } from "../../../server/services/cards.ts";
import { competenceShort, date, money } from "../../ui/format.ts";

export function PayInvoice({
  cardId,
  cardName,
  invoice,
  accounts,
  defaultAccountId,
  onClose,
}: {
  cardId: string;
  cardName: string;
  invoice: InvoiceView;
  accounts: CardsView["accounts"];
  defaultAccountId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [contaId, setContaId] = useState(defaultAccountId);
  const [valor, setValor] = useState(String((invoice.outstandingCents / 100).toFixed(2)).replace(".", ","));
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const conta = accounts.find((item) => item.id === contaId);
  const saldoInsuficiente = conta ? conta.balanceCents < invoice.outstandingCents : false;

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);

    const resposta = await fetch("/api/v1/invoices/pay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        cardId,
        competence: invoice.competence,
        accountId: contaId,
        amount: valor,
      }),
    });

    setEnviando(false);

    if (!resposta.ok) {
      const corpo = (await resposta.json().catch(() => ({}))) as { error?: { message?: string } };
      setErro(corpo.error?.message ?? "Não foi possível registrar o pagamento.");
      return;
    }

    onClose();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Pagar fatura"
        className="max-h-dvh w-full max-w-md overflow-y-auto rounded-t-[--radius-card] border border-line bg-surface p-5 shadow-[--shadow-raised] sm:rounded-[--radius-card]"
      >
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[1.0625rem] font-semibold text-ink">Pagar fatura</h2>
            <p className="mt-0.5 text-[0.8125rem] text-ink-muted">
              {cardName} · {competenceShort(invoice.competence)} · vence {date(invoice.dueDate)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[--radius-control] px-2 py-1 text-[0.8125rem] text-ink-muted hover:bg-surface-sunken"
          >
            Fechar
          </button>
        </header>

        <form onSubmit={enviar} className="space-y-4" noValidate>
          <label className="block">
            <span className="mb-1.5 block text-[0.8125rem] font-medium text-ink">Sai da conta</span>
            <select
              value={contaId}
              onChange={(evento) => setContaId(evento.target.value)}
              className="h-10 w-full rounded-[--radius-control] border border-line bg-surface px-3 text-[0.875rem] text-ink outline-none focus:border-accent"
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} — {money(account.balanceCents)}
                </option>
              ))}
            </select>
            {saldoInsuficiente ? (
              <span className="mt-1 block text-[0.75rem] text-caution">
                O saldo desta conta não cobre o total em aberto.
              </span>
            ) : null}
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[0.8125rem] font-medium text-ink">Valor</span>
            <input
              value={valor}
              onChange={(evento) => setValor(evento.target.value)}
              inputMode="decimal"
              className="tabular h-10 w-full rounded-[--radius-control] border border-line bg-surface px-3 text-[0.875rem] text-ink outline-none focus:border-accent"
            />
            <span className="mt-1 block text-[0.75rem] text-ink-subtle">
              Em aberto: {money(invoice.outstandingCents)}. Pagamento parcial é aceito.
            </span>
          </label>

          <p className="rounded-[--radius-control] bg-surface-sunken px-3 py-2 text-[0.75rem] text-ink-muted">
            O valor é abatido da conta e da dívida do cartão. Não vira uma nova despesa — as compras
            já foram contadas quando aconteceram.
          </p>

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
            {enviando ? "Registrando…" : "Confirmar pagamento"}
          </button>
        </form>
      </div>
    </div>
  );
}
