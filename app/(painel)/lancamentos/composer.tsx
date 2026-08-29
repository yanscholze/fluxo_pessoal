"use client";

/**
 * Registro de lançamento.
 *
 * O formulário muda conforme o tipo: transferência pede conta de destino,
 * despesa no crédito pede cartão e libera parcelamento. Mostrar todos os
 * campos sempre e ignorar os que não valem foi o que fez a versão anterior
 * precisar adivinhar o cartão quando ele vinha vazio.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { Competence } from "../../../core/time/competence.ts";
import type { Statement } from "../../../server/services/statement.ts";

type Tipo = "expense" | "income" | "transfer";
type Origem = "account" | "card";

type Erro = { message?: string; issues?: { path: string; message: string }[] };

export function Composer({
  options,
  competence,
}: {
  options: Statement["options"];
  competence: Competence;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [tipo, setTipo] = useState<Tipo>("expense");
  const [origem, setOrigem] = useState<Origem>("account");
  const [parcelas, setParcelas] = useState(1);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [issues, setIssues] = useState<Record<string, string>>({});

  const cartoesCredito = options.cards.filter((card) => card.kind === "credit");
  const podeUsarCartao = tipo === "expense" && cartoesCredito.length > 0;
  const usandoCartao = podeUsarCartao && origem === "card";
  const categorias = options.categories.filter((category) =>
    tipo === "income" ? category.kind === "income" : category.kind === "expense",
  );

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);
    setIssues({});

    const dados = new FormData(evento.currentTarget);
    const corpo: Record<string, unknown> = {
      kind: tipo,
      description: dados.get("description"),
      amount: dados.get("amount"),
      occurredOn: dados.get("occurredOn"),
      state: dados.get("state") ?? "confirmed",
    };

    if (tipo !== "transfer") corpo.categoryId = dados.get("categoryId") || null;
    if (usandoCartao) {
      corpo.cardId = dados.get("cardId");
      if (parcelas > 1) corpo.installmentCount = parcelas;
    } else {
      corpo.accountId = dados.get("accountId");
    }
    if (tipo === "transfer") corpo.destinationAccountId = dados.get("destinationAccountId");

    const resposta = await fetch("/api/v1/transactions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo),
    });

    setEnviando(false);

    if (!resposta.ok) {
      const body = (await resposta.json().catch(() => ({}))) as { error?: Erro };
      setErro(body.error?.message ?? "Não foi possível registrar o lançamento.");
      setIssues(Object.fromEntries((body.error?.issues ?? []).map((issue) => [issue.path, issue.message])));
      return;
    }

    setAberto(false);
    setParcelas(1);
    router.refresh();
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="inline-flex h-9 shrink-0 select-none items-center justify-center gap-2 rounded-md border border-transparent bg-accent px-3.5 text-body-sm font-medium text-accent-ink transition-colors hover:bg-accent-hover disabled:pointer-events-none disabled:opacity-45"
      >
        Novo lançamento
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Novo lançamento"
        className="max-h-dvh w-full max-w-lg overflow-y-auto rounded-t-panel border border-line bg-surface p-5 shadow-float sm:rounded-panel"
      >
        <header className="mb-4 flex items-center justify-between">
          <h2 className="text-title font-semibold text-ink">Novo lançamento</h2>
          <button
            type="button"
            onClick={() => setAberto(false)}
            className="rounded-md px-2 py-1 text-body-sm text-ink-muted hover:bg-surface-sunken"
          >
            Fechar
          </button>
        </header>

        <form onSubmit={enviar} className="space-y-4" noValidate>
          <fieldset>
            <legend className="mb-1.5 text-body-sm font-medium text-ink">Tipo</legend>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  ["expense", "Despesa"],
                  ["income", "Receita"],
                  ["transfer", "Transferência"],
                ] as const
              ).map(([valor, rotulo]) => (
                <button
                  key={valor}
                  type="button"
                  onClick={() => {
                    setTipo(valor);
                    if (valor !== "expense") setOrigem("account");
                    setParcelas(1);
                  }}
                  aria-pressed={tipo === valor}
                  className={`h-9 rounded-md border text-body-sm ${
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

          <Campo rotulo="Descrição" erro={issues.description}>
            <input name="description" required maxLength={160} className={entrada(issues.description)} />
          </Campo>

          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Valor" erro={issues.amount}>
              <input
                name="amount"
                required
                inputMode="decimal"
                placeholder="0,00"
                className={`${entrada(issues.amount)} tabular`}
              />
            </Campo>
            <Campo rotulo="Data" erro={issues.occurredOn}>
              <input
                name="occurredOn"
                type="date"
                required
                defaultValue={`${competence}-01`}
                className={entrada(issues.occurredOn)}
              />
            </Campo>
          </div>

          {podeUsarCartao ? (
            <fieldset>
              <legend className="mb-1.5 text-body-sm font-medium text-ink">Pago com</legend>
              <div className="grid grid-cols-2 gap-1.5">
                {(
                  [
                    ["account", "Conta / débito"],
                    ["card", "Cartão de crédito"],
                  ] as const
                ).map(([valor, rotulo]) => (
                  <button
                    key={valor}
                    type="button"
                    onClick={() => {
                      setOrigem(valor);
                      if (valor === "account") setParcelas(1);
                    }}
                    aria-pressed={origem === valor}
                    className={`h-9 rounded-md border text-body-sm ${
                      origem === valor
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

          {usandoCartao ? (
            <Campo rotulo="Cartão" erro={issues.cardId}>
              <select name="cardId" required className={entrada(issues.cardId)}>
                {cartoesCredito.map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.name}
                  </option>
                ))}
              </select>
            </Campo>
          ) : (
            <Campo rotulo={tipo === "income" ? "Conta que recebe" : "Conta"} erro={issues.accountId}>
              <select name="accountId" required className={entrada(issues.accountId)}>
                {options.accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </Campo>
          )}

          {tipo === "transfer" ? (
            <Campo rotulo="Conta de destino" erro={issues.destinationAccountId}>
              <select name="destinationAccountId" required className={entrada(issues.destinationAccountId)}>
                {options.accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </Campo>
          ) : (
            <Campo rotulo="Categoria" erro={issues.categoryId}>
              <select name="categoryId" className={entrada(issues.categoryId)}>
                <option value="">Sem categoria</option>
                {categorias.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </Campo>
          )}

          {usandoCartao ? (
            <Campo
              rotulo="Parcelas"
              dica={parcelas > 1 ? "Cada parcela cai na competência da fatura correspondente." : undefined}
            >
              <input
                type="number"
                min={1}
                max={48}
                value={parcelas}
                onChange={(evento) => setParcelas(Math.max(1, Math.min(48, Number(evento.target.value) || 1)))}
                className={`${entrada()} tabular`}
              />
            </Campo>
          ) : null}

          <Campo rotulo="Situação">
            <select name="state" className={entrada()}>
              <option value="confirmed">Confirmado — já aconteceu</option>
              <option value="planned">Previsto — ainda vai acontecer</option>
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
            {enviando ? "Registrando…" : parcelas > 1 ? `Registrar em ${parcelas}x` : "Registrar"}
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
