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
    return <p className="text-[0.8125rem] text-ink-subtle">Cadastre uma categoria de saída primeiro.</p>;
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="h-10 rounded-[--radius-control] bg-accent px-4 text-[0.875rem] font-semibold text-accent-ink"
      >
        Definir orçamento
      </button>
    );
  }

  return (
    <form
      onSubmit={enviar}
      className="flex w-full flex-wrap items-end gap-2 rounded-[--radius-card] border border-line bg-surface p-4 sm:w-auto"
    >
      <label className="block">
        <span className="mb-1.5 block text-[0.75rem] font-medium text-ink">Categoria</span>
        <select name="categoryId" required className={entrada}>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1.5 block text-[0.75rem] font-medium text-ink">Teto mensal</span>
        <input name="amount" required inputMode="decimal" placeholder="0,00" className={`${entrada} tabular w-32`} />
      </label>

      <button
        type="submit"
        disabled={enviando}
        className="h-9 rounded-[--radius-control] bg-accent px-4 text-[0.8125rem] font-semibold text-accent-ink disabled:opacity-60"
      >
        {enviando ? "Salvando…" : "Salvar"}
      </button>
      <button
        type="button"
        onClick={() => setAberto(false)}
        className="h-9 rounded-[--radius-control] border border-line px-3 text-[0.8125rem] text-ink-muted"
      >
        Cancelar
      </button>

      {erro ? <p className="w-full text-[0.75rem] text-negative">{erro}</p> : null}
    </form>
  );
}

const entrada =
  "h-9 rounded-[--radius-control] border border-line bg-surface px-3 text-[0.8125rem] text-ink outline-none focus:border-accent";
