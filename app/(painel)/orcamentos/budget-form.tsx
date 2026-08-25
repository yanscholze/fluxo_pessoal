"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function BudgetForm({ categories }: { categories: readonly { id: string; name: string }[] }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);

    const dados = new FormData(evento.currentTarget);
    const resposta = await fetch("/api/v1/budgets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ categoryId: dados.get("categoryId"), amount: dados.get("amount") }),
    });

    setEnviando(false);

    if (!resposta.ok) {
      const corpo = (await resposta.json().catch(() => ({}))) as { error?: { message?: string } };
      setErro(corpo.error?.message ?? "Não foi possível salvar o orçamento.");
      return;
    }

    setAberto(false);
    router.refresh();
  }

  if (!categories.length) {
    return <p className="text-body-sm text-ink-subtle">Cadastre uma categoria de saída primeiro.</p>;
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="inline-flex h-9 shrink-0 select-none items-center justify-center gap-2 rounded-md border border-transparent bg-accent px-3.5 text-body-sm font-medium text-accent-ink transition-colors hover:bg-accent-hover disabled:pointer-events-none disabled:opacity-45"
      >
        Definir orçamento
      </button>
    );
  }

  return (
    <form
      onSubmit={enviar}
      className="flex w-full flex-wrap items-end gap-2 rounded-lg border border-line bg-surface p-4 sm:w-auto"
    >
      <label className="block">
        <span className="mb-1.5 block text-caption font-medium text-ink">Categoria</span>
        <select name="categoryId" required className={entrada}>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1.5 block text-caption font-medium text-ink">Teto mensal</span>
        <input name="amount" required inputMode="decimal" placeholder="0,00" className={`${entrada} tabular w-32`} />
      </label>

      <button
        type="submit"
        disabled={enviando}
        className="inline-flex h-9 shrink-0 select-none items-center justify-center gap-2 rounded-md border border-transparent bg-accent px-3.5 text-body-sm font-medium text-accent-ink transition-colors hover:bg-accent-hover disabled:pointer-events-none disabled:opacity-45"
      >
        {enviando ? "Salvando…" : "Salvar"}
      </button>
      <button
        type="button"
        onClick={() => setAberto(false)}
        className="inline-flex h-9 shrink-0 select-none items-center justify-center gap-2 rounded-md border border-line-strong bg-surface px-3.5 text-body-sm font-medium text-ink transition-colors hover:bg-surface-inset disabled:pointer-events-none disabled:opacity-45"
      >
        Cancelar
      </button>

      {erro ? <p className="w-full text-caption text-negative">{erro}</p> : null}
    </form>
  );
}

const entrada =
  "h-9 rounded-md border border-line bg-surface px-3 text-body-sm text-ink outline-none focus:border-accent";
