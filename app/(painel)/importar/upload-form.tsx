"use client";

/**
 * Envio do arquivo.
 *
 * O arquivo é lido no navegador e enviado como texto — não há upload binário
 * nem armazenamento do arquivo em si. O que interessa é o conteúdo, e ele vira
 * um lote de revisão no banco imediatamente.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Card, SectionHeading } from "../../ui/primitives.tsx";

type Destino = "account" | "card";

const MAX_BYTES = 2_000_000;

export function UploadForm({
  accounts,
  cards,
}: {
  accounts: readonly { id: string; name: string }[];
  cards: readonly { id: string; name: string }[];
}) {
  const router = useRouter();
  const [destino, setDestino] = useState<Destino>(cards.length ? "card" : "account");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const hoje = new Date();
  const competenciaPadrao = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!arquivo) {
      setErro("Escolha um arquivo OFX ou CSV.");
      return;
    }
    if (arquivo.size > MAX_BYTES) {
      setErro("Arquivo grande demais. O limite é 2 MB.");
      return;
    }

    setEnviando(true);
    setErro(null);

    const dados = new FormData(evento.currentTarget);
    const content = await arquivo.text();

    const resposta = await fetch("/api/v1/imports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        filename: arquivo.name,
        content,
        ...(destino === "card"
          ? { cardId: dados.get("cardId"), competence: dados.get("competence") }
          : { accountId: dados.get("accountId") }),
      }),
    });

    setEnviando(false);

    if (!resposta.ok) {
      const corpo = (await resposta.json().catch(() => ({}))) as { error?: { message?: string } };
      setErro(corpo.error?.message ?? "Não foi possível ler este arquivo.");
      return;
    }

    const corpo = (await resposta.json()) as { data: { id: string } };
    router.replace(`/importar?lote=${corpo.data.id}`);
    router.refresh();
  }

  if (!accounts.length) {
    return (
      <Card>
        <SectionHeading title="Cadastre uma conta antes" />
        <p className="text-[0.875rem] text-ink-muted">
          A importação precisa saber para onde os lançamentos vão. Cadastre pelo menos uma conta.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <SectionHeading
        title="Novo arquivo"
        hint="OFX e CSV. O formato é detectado pelo conteúdo, não pela extensão."
      />

      <form onSubmit={enviar} className="space-y-4" noValidate>
        {cards.length ? (
          <fieldset>
            <legend className="mb-1.5 text-[0.8125rem] font-medium text-ink">Destino</legend>
            <div className="grid grid-cols-2 gap-1.5 sm:max-w-sm">
              {(
                [
                  ["card", "Fatura de cartão"],
                  ["account", "Extrato de conta"],
                ] as const
              ).map(([valor, rotulo]) => (
                <button
                  key={valor}
                  type="button"
                  onClick={() => setDestino(valor)}
                  aria-pressed={destino === valor}
                  className={`h-9 rounded-[--radius-control] border text-[0.8125rem] ${
                    destino === valor
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

        <div className="grid gap-3 sm:grid-cols-2">
          {destino === "card" && cards.length ? (
            <>
              <label className="block">
                <span className="mb-1.5 block text-[0.8125rem] font-medium text-ink">Cartão</span>
                <select name="cardId" required className={entrada}>
                  {cards.map((card) => (
                    <option key={card.id} value={card.id}>
                      {card.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[0.8125rem] font-medium text-ink">Competência da fatura</span>
                <input name="competence" type="month" defaultValue={competenciaPadrao} className={entrada} />
              </label>
            </>
          ) : (
            <label className="block">
              <span className="mb-1.5 block text-[0.8125rem] font-medium text-ink">Conta</span>
              <select name="accountId" required className={entrada}>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <label className="block">
          <span className="mb-1.5 block text-[0.8125rem] font-medium text-ink">Arquivo</span>
          <input
            type="file"
            accept=".ofx,.csv,.txt,text/csv,text/plain"
            onChange={(evento) => setArquivo(evento.target.files?.[0] ?? null)}
            className="block w-full text-[0.8125rem] text-ink-muted file:mr-3 file:rounded-[--radius-control] file:border file:border-line file:bg-surface-sunken file:px-3 file:py-2 file:text-[0.8125rem] file:text-ink"
          />
        </label>

        {erro ? (
          <p role="alert" className="rounded-[--radius-control] bg-negative-wash px-3 py-2 text-[0.8125rem] text-negative">
            {erro}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={enviando || !arquivo}
          className="h-11 rounded-[--radius-control] bg-accent px-5 text-[0.875rem] font-semibold text-accent-ink disabled:opacity-60"
        >
          {enviando ? "Lendo arquivo…" : "Ler e revisar"}
        </button>
      </form>
    </Card>
  );
}

const entrada =
  "h-10 w-full rounded-[--radius-control] border border-line bg-surface px-3 text-[0.875rem] text-ink outline-none focus:border-accent";
