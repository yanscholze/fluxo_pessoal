"use client";

/**
 * Gestão de categorias.
 *
 * Renomear é edição em linha porque é a operação mais frequente e abrir um
 * modal para trocar uma palavra é atrito puro. Os dois sinalizadores mudam
 * cálculo em outras telas, então a tela explica o que cada um faz.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge, Empty } from "../../ui/primitives.tsx";

type Categoria = {
  id: string;
  name: string;
  kind: "expense" | "income";
  color: string;
  isEssential: boolean;
  excludeFromFreeToSpend: boolean;
};

export function CategoryManager({ categories }: { categories: readonly Categoria[] }) {
  const router = useRouter();
  const [fluxo, setFluxo] = useState<"expense" | "income">("expense");
  const [editando, setEditando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);

  const visiveis = categories.filter((category) => category.kind === fluxo);

  async function atualizar(id: string, corpo: Record<string, unknown>) {
    setErro(null);
    const resposta = await fetch(`/api/v1/categories/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo),
    });

    if (!resposta.ok) {
      const body = (await resposta.json().catch(() => ({}))) as { error?: { message?: string } };
      setErro(body.error?.message ?? "Não foi possível salvar.");
      return;
    }
    setEditando(null);
    router.refresh();
  }

  async function criar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);

    const dados = new FormData(evento.currentTarget);
    const resposta = await fetch("/api/v1/categories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: dados.get("name"), kind: fluxo }),
    });

    if (!resposta.ok) {
      const body = (await resposta.json().catch(() => ({}))) as { error?: { message?: string } };
      setErro(body.error?.message ?? "Não foi possível criar a categoria.");
      return;
    }
    setCriando(false);
    router.refresh();
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(
          [
            ["expense", "Saídas"],
            ["income", "Entradas"],
          ] as const
        ).map(([valor, rotulo]) => (
          <button
            key={valor}
            type="button"
            onClick={() => setFluxo(valor)}
            aria-pressed={fluxo === valor}
            className={`rounded-full border px-3 py-1 text-[0.75rem] ${
              fluxo === valor ? "border-accent bg-accent-wash text-accent" : "border-line text-ink-muted"
            }`}
          >
            {rotulo}
          </button>
        ))}

        <button
          type="button"
          onClick={() => setCriando((valor) => !valor)}
          className="ml-auto rounded-[--radius-control] border border-line px-3 py-1.5 text-[0.8125rem] text-ink-muted hover:bg-surface-sunken"
        >
          {criando ? "Cancelar" : "Nova categoria"}
        </button>
      </div>

      {criando ? (
        <form onSubmit={criar} className="mb-4 flex gap-2">
          <input
            name="name"
            required
            maxLength={60}
            placeholder={fluxo === "expense" ? "Ex.: Educação" : "Ex.: Freelance"}
            className="h-9 flex-1 rounded-[--radius-control] border border-line bg-surface px-3 text-[0.8125rem] text-ink outline-none focus:border-accent"
          />
          <button
            type="submit"
            className="h-9 rounded-[--radius-control] bg-accent px-4 text-[0.8125rem] font-semibold text-accent-ink"
          >
            Criar
          </button>
        </form>
      ) : null}

      {erro ? (
        <p role="alert" className="mb-3 rounded-[--radius-control] bg-negative-wash px-3 py-2 text-[0.8125rem] text-negative">
          {erro}
        </p>
      ) : null}

      {visiveis.length ? (
        <ul className="border-t border-line">
          {visiveis.map((category) => (
            <li key={category.id} className="border-b border-line py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                {editando === category.id ? (
                  <form
                    onSubmit={(evento) => {
                      evento.preventDefault();
                      const nome = new FormData(evento.currentTarget).get("name");
                      atualizar(category.id, { name: nome });
                    }}
                    className="flex flex-1 gap-2"
                  >
                    <input
                      name="name"
                      defaultValue={category.name}
                      autoFocus
                      maxLength={60}
                      className="h-8 flex-1 rounded-[--radius-control] border border-accent bg-surface px-2 text-[0.8125rem] text-ink outline-none"
                    />
                    <button type="submit" className="text-[0.75rem] font-semibold text-accent">
                      Salvar
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditando(null)}
                      className="text-[0.75rem] text-ink-muted"
                    >
                      Cancelar
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditando(category.id)}
                    className="flex items-center gap-2 text-left text-[0.875rem] text-ink hover:underline"
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: category.color }}
                      aria-hidden
                    />
                    {category.name}
                    {category.isEssential ? <Badge tone="accent">essencial</Badge> : null}
                    {category.excludeFromFreeToSpend ? <Badge>fora do livre</Badge> : null}
                  </button>
                )}
              </div>

              {editando !== category.id ? (
                <div className="mt-1.5 flex flex-wrap gap-4 pl-[1.125rem]">
                  {category.kind === "expense" ? (
                    <label className="flex items-center gap-1.5 text-[0.75rem] text-ink-muted">
                      <input
                        type="checkbox"
                        checked={category.isEssential}
                        onChange={(evento) =>
                          atualizar(category.id, { isEssential: String(evento.target.checked) })
                        }
                      />
                      Gasto essencial
                    </label>
                  ) : null}
                  <label className="flex items-center gap-1.5 text-[0.75rem] text-ink-muted">
                    <input
                      type="checkbox"
                      checked={category.excludeFromFreeToSpend}
                      onChange={(evento) =>
                        atualizar(category.id, { excludeFromFreeToSpend: String(evento.target.checked) })
                      }
                    />
                    Não pesar no livre para gastar
                  </label>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <Empty title={`Nenhuma categoria de ${fluxo === "expense" ? "saída" : "entrada"}`} />
      )}

      <p className="mt-3 text-[0.75rem] text-ink-subtle">
        <strong className="font-medium text-ink-muted">Gasto essencial</strong> entra na média que define o
        alvo da reserva de emergência.{" "}
        <strong className="font-medium text-ink-muted">Não pesar no livre</strong> é para movimentação de
        caixa que não é consumo, como empréstimo de cartão.
      </p>
    </div>
  );
}
