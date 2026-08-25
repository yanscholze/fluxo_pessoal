"use client";

/**
 * Fila de revisão das capturas.
 *
 * Cada sugestão mostra o **texto original** da notificação: é o que permite
 * ao usuário julgar se a leitura está certa. Sem ele, confirmar seria um voto
 * de confiança cego numa expressão regular.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { CaptureView, CapturesView } from "../../../server/services/captures.ts";
import { Badge } from "../../ui/primitives.tsx";
import { dateShort, money, percent } from "../../ui/format.ts";

const METODO: Record<string, string> = {
  credit: "crédito",
  debit: "débito",
  cash: "dinheiro",
  unknown: "não identificado",
};

export function CaptureQueue({
  items,
  options,
}: {
  items: readonly CaptureView[];
  options: CapturesView["options"];
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const cartoes = options.cards.filter((card) => card.kind === "credit");

  async function decidir(captureId: string, corpo: Record<string, unknown>) {
    setEnviando(captureId);
    setErro(null);

    const resposta = await fetch("/api/v1/captures", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ captureId, ...corpo }),
    });

    setEnviando(null);

    if (!resposta.ok) {
      const body = (await resposta.json().catch(() => ({}))) as { error?: { message?: string } };
      setErro(body.error?.message ?? "Não foi possível concluir.");
      return;
    }

    setAberto(null);
    router.refresh();
  }

  return (
    <div>
      {erro ? (
        <p role="alert" className="mb-3 rounded-md bg-negative-wash px-3 py-2 text-body-sm text-negative">
          {erro}
        </p>
      ) : null}

      <ul className="border-t border-line">
        {items.map((item) => {
          const baixaConfianca = item.confidencePercent < 60;
          const expandido = aberto === item.id;

          return (
            <li key={item.id} className="border-b border-line py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-body text-ink">
                    {item.description}
                    <Badge tone={baixaConfianca ? "caution" : "positive"}>
                      {percent(item.confidencePercent)} de confiança
                    </Badge>
                    {item.installment ? (
                      <Badge>
                        {item.installment.current}/{item.installment.total}
                      </Badge>
                    ) : null}
                  </p>
                  <p className="text-caption text-ink-subtle">
                    {dateShort(item.occurredOn)} · {item.sourceLabel ?? item.sourceApp} ·{" "}
                    {METODO[item.method]}
                  </p>
                </div>

                <p
                  className={`tabular shrink-0 text-heading font-medium ${
                    item.kind === "income" ? "text-positive" : "text-ink"
                  }`}
                >
                  {item.kind === "income" ? "+" : "−"} {money(item.amountCents)}
                </p>
              </div>

              <p className="mt-1.5 rounded-md bg-surface-sunken px-3 py-1.5 text-caption text-ink-subtle">
                {item.rawText}
              </p>

              {expandido ? (
                <form
                  onSubmit={(evento) => {
                    evento.preventDefault();
                    const dados = new FormData(evento.currentTarget);
                    const cardId = dados.get("cardId");
                    decidir(item.id, {
                      decision: "confirmar",
                      description: dados.get("description"),
                      amount: dados.get("amount"),
                      occurredOn: dados.get("occurredOn"),
                      categoryId: dados.get("categoryId") || null,
                      ...(cardId ? { cardId } : { accountId: dados.get("accountId") }),
                    });
                  }}
                  className="mt-3 space-y-3 rounded-md border border-line p-3"
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Campo rotulo="Descrição">
                      <input name="description" defaultValue={item.description} maxLength={160} className={entrada} />
                    </Campo>
                    <Campo rotulo="Valor">
                      <input
                        name="amount"
                        defaultValue={String(item.amountCents / 100).replace(".", ",")}
                        inputMode="decimal"
                        className={`${entrada} tabular`}
                      />
                    </Campo>
                    <Campo rotulo="Data">
                      <input name="occurredOn" type="date" defaultValue={item.occurredOn} className={entrada} />
                    </Campo>
                    <Campo rotulo="Categoria">
                      <select name="categoryId" className={entrada}>
                        <option value="">Sem categoria</option>
                        {options.categories
                          .filter((categoria) =>
                            item.kind === "income"
                              ? categoria.kind === "income"
                              : categoria.kind === "expense",
                          )
                          .map((categoria) => (
                            <option key={categoria.id} value={categoria.id}>
                              {categoria.name}
                            </option>
                          ))}
                      </select>
                    </Campo>

                    {item.method === "credit" && cartoes.length ? (
                      <Campo rotulo="Cartão">
                        <select name="cardId" required className={entrada}>
                          {cartoes.map((cartao) => (
                            <option key={cartao.id} value={cartao.id}>
                              {cartao.name}
                            </option>
                          ))}
                        </select>
                      </Campo>
                    ) : (
                      <Campo rotulo="Conta">
                        <select name="accountId" required className={entrada}>
                          {options.accounts.map((conta) => (
                            <option key={conta.id} value={conta.id}>
                              {conta.name}
                            </option>
                          ))}
                        </select>
                      </Campo>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={enviando === item.id}
                      className="inline-flex h-9 shrink-0 select-none items-center justify-center gap-2 rounded-md border border-transparent bg-accent px-3.5 text-body-sm font-medium text-accent-ink transition-colors hover:bg-accent-hover disabled:pointer-events-none disabled:opacity-45"
                    >
                      {enviando === item.id ? "Registrando…" : "Registrar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAberto(null)}
                      className="inline-flex h-9 shrink-0 select-none items-center justify-center gap-2 rounded-md border border-line-strong bg-surface px-3.5 text-body-sm font-medium text-ink transition-colors hover:bg-surface-inset disabled:pointer-events-none disabled:opacity-45"
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setAberto(item.id)}
                    className="inline-flex h-8 shrink-0 select-none items-center justify-center gap-1.5 rounded-md border border-transparent bg-accent px-2.5 text-body-sm font-medium text-accent-ink transition-colors hover:bg-accent-hover disabled:pointer-events-none disabled:opacity-45"
                  >
                    Conferir e registrar
                  </button>
                  <button
                    type="button"
                    disabled={enviando === item.id}
                    onClick={() => decidir(item.id, { decision: "ignorar" })}
                    className="rounded-md border border-line px-3 py-1.5 text-caption text-ink-muted hover:bg-surface-sunken disabled:opacity-50"
                  >
                    Ignorar
                  </button>
                  <button
                    type="button"
                    disabled={enviando === item.id}
                    onClick={() => decidir(item.id, { decision: "duplicado" })}
                    className="rounded-md border border-line px-3 py-1.5 text-caption text-ink-muted hover:bg-surface-sunken disabled:opacity-50"
                  >
                    É duplicada
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const entrada =
  "h-9 w-full rounded-md border border-line bg-surface px-2.5 text-body-sm text-ink outline-none focus:border-accent";

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-caption font-medium text-ink">{rotulo}</span>
      {children}
    </label>
  );
}
