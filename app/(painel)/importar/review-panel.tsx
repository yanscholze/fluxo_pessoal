"use client";

/**
 * Revisão do lote.
 *
 * A tela abre com o resumo — quantas encontradas, novas, duplicadas — porque é
 * isso que decide se vale conferir linha a linha ou aceitar tudo. Duplicadas
 * já vêm marcadas para ignorar: o padrão seguro é não gravar de novo.
 */

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { BatchSummary, ReviewItemView } from "../../../server/services/imports.ts";
import { Badge, Card, SectionHeading } from "../../ui/primitives.tsx";
import { dateShort, money } from "../../ui/format.ts";

type Categoria = { id: string; name: string; kind: "expense" | "income" };

const VEREDITO: Record<ReviewItemView["verdict"], { texto: string; tom: "positive" | "negative" | "caution" | "neutral" }> = {
  novo: { texto: "Novo", tom: "positive" },
  duplicado: { texto: "Duplicado", tom: "negative" },
  possivel_transferencia: { texto: "Possível transferência", tom: "caution" },
  sem_categoria: { texto: "Sem categoria", tom: "neutral" },
};

export function ReviewPanel({
  batch,
  items,
  categories,
}: {
  batch: BatchSummary;
  items: readonly ReviewItemView[];
  categories: readonly Categoria[];
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<"todos" | ReviewItemView["verdict"]>("todos");

  const visiveis = filtro === "todos" ? items : items.filter((item) => item.verdict === filtro);
  const aceitas = items.filter((item) => item.decision === "aceitar").length;
  const pendentes = items.filter((item) => item.decision === "pendente").length;

  async function chamar(body: Record<string, unknown>, method: "PATCH" | "POST" | "DELETE" = "PATCH") {
    setErro(null);
    const resposta = await fetch(`/api/v1/imports/${batch.id}`, {
      method,
      headers: { "content-type": "application/json" },
      ...(method === "DELETE" ? {} : { body: JSON.stringify(body) }),
    });

    if (!resposta.ok) {
      const corpo = (await resposta.json().catch(() => ({}))) as { error?: { message?: string } };
      setErro(corpo.error?.message ?? "Não foi possível concluir.");
      return false;
    }
    startTransition(() => router.refresh());
    return true;
  }

  async function confirmar() {
    if (await chamar({}, "POST")) {
      startTransition(() => {
        router.replace("/importar");
        router.refresh();
      });
    }
  }

  async function descartar() {
    if (await chamar({}, "DELETE")) {
      startTransition(() => {
        router.replace("/importar");
        router.refresh();
      });
    }
  }

  return (
    <Card>
      <SectionHeading
        title={`Revisando ${batch.filename}`}
        hint={`${batch.targetName}${batch.competence ? ` · fatura ${batch.competence}` : ""}`}
      />

      <dl className="mb-4 flex flex-wrap gap-x-5 gap-y-1 text-[0.8125rem]">
        <Contagem rotulo="encontradas" valor={batch.counts.found} />
        <Contagem rotulo="novas" valor={batch.counts.fresh} tom="text-positive" />
        <Contagem rotulo="duplicadas" valor={batch.counts.duplicates} tom="text-negative" />
        <Contagem rotulo="sem categoria" valor={batch.counts.withoutCategory} />
        <Contagem rotulo="possíveis transferências" valor={batch.counts.possibleTransfers} tom="text-caution" />
        <Contagem rotulo="descartadas pelo formato" valor={batch.counts.discarded} />
      </dl>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(["todos", "novo", "duplicado", "possivel_transferencia", "sem_categoria"] as const).map((valor) => (
          <button
            key={valor}
            type="button"
            onClick={() => setFiltro(valor)}
            aria-pressed={filtro === valor}
            className={`rounded-full border px-3 py-1 text-[0.75rem] ${
              filtro === valor ? "border-accent bg-accent-wash text-accent" : "border-line text-ink-muted"
            }`}
          >
            {valor === "todos" ? "Todos" : VEREDITO[valor].texto}
          </button>
        ))}

        <span className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() => chamar({ acceptAll: true })}
            disabled={pendente || pendentes === 0}
            className="rounded-[--radius-control] border border-line px-3 py-1.5 text-[0.8125rem] text-ink-muted hover:bg-surface-sunken disabled:opacity-50"
          >
            Aceitar {pendentes} pendentes
          </button>
          <button
            type="button"
            onClick={descartar}
            disabled={pendente}
            className="rounded-[--radius-control] border border-line px-3 py-1.5 text-[0.8125rem] text-ink-muted hover:bg-surface-sunken"
          >
            Descartar lote
          </button>
        </span>
      </div>

      {erro ? (
        <p role="alert" className="mb-3 rounded-[--radius-control] bg-negative-wash px-3 py-2 text-[0.8125rem] text-negative">
          {erro}
        </p>
      ) : null}

      <ul className="border-t border-line">
        {visiveis.map((item) => {
          const rotulo = VEREDITO[item.verdict];
          const opcoes = categories.filter((category) =>
            item.kind === "income" ? category.kind === "income" : category.kind === "expense",
          );

          return (
            <li key={item.id} className="border-b border-line py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-[0.875rem] text-ink">
                    {item.description}
                    <Badge tone={rotulo.tom}>{rotulo.texto}</Badge>
                    {item.installment ? (
                      <Badge>
                        {item.installment.current}/{item.installment.total}
                      </Badge>
                    ) : null}
                  </p>
                  <p className="truncate text-[0.75rem] text-ink-subtle" title={item.rawText}>
                    {dateShort(item.occurredOn)} · {item.rawText}
                  </p>
                </div>

                <p
                  className={`tabular shrink-0 text-[0.875rem] font-medium ${
                    item.kind === "income" ? "text-positive" : "text-ink"
                  }`}
                >
                  {item.kind === "income" ? "+" : "−"} {money(Math.abs(item.amountCents))}
                </p>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select
                  value={item.categoryId ?? ""}
                  onChange={(evento) =>
                    chamar(
                      evento.target.value
                        ? { itemId: item.id, categoryId: evento.target.value }
                        : { itemId: item.id, clearCategory: true },
                    )
                  }
                  className="h-8 rounded-[--radius-control] border border-line bg-surface px-2 text-[0.75rem] text-ink"
                >
                  <option value="">Sem categoria</option>
                  {opcoes.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>

                {(["aceitar", "ignorar"] as const).map((decisao) => (
                  <button
                    key={decisao}
                    type="button"
                    onClick={() => chamar({ itemId: item.id, decision: decisao })}
                    aria-pressed={item.decision === decisao}
                    className={`rounded-[--radius-control] border px-3 py-1 text-[0.75rem] ${
                      item.decision === decisao
                        ? decisao === "aceitar"
                          ? "border-positive bg-positive-wash text-positive"
                          : "border-line bg-surface-sunken text-ink-muted"
                        : "border-line text-ink-muted"
                    }`}
                  >
                    {decisao === "aceitar" ? "Aceitar" : "Ignorar"}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>

      <footer className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[0.8125rem] text-ink-muted">
          {aceitas} linha{aceitas === 1 ? "" : "s"} será{aceitas === 1 ? "" : "ão"} gravada
          {aceitas === 1 ? "" : "s"}
          {pendentes > 0 ? ` · ${pendentes} ainda sem decisão` : ""}
        </p>
        <button
          type="button"
          onClick={confirmar}
          disabled={pendente || aceitas === 0}
          className="h-11 rounded-[--radius-control] bg-accent px-5 text-[0.875rem] font-semibold text-accent-ink disabled:opacity-60"
        >
          Confirmar {aceitas} lançamento{aceitas === 1 ? "" : "s"}
        </button>
      </footer>
    </Card>
  );
}

function Contagem({ rotulo, valor, tom }: { rotulo: string; valor: number; tom?: string }) {
  // O número vem antes do rótulo na leitura, então `dd` primeiro e `dt` visível
  // depois — um rótulo `sr-only` aqui faria o leitor de tela ouvir o texto duas
  // vezes.
  return (
    <span className="flex items-baseline gap-1">
      <dd className={`tabular font-semibold ${tom ?? "text-ink"}`}>{valor}</dd>
      <dt className="text-ink-subtle">{rotulo}</dt>
    </span>
  );
}
