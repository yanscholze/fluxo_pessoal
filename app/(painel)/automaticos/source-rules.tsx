"use client";

/**
 * Regras por app.
 *
 * O padrão é ignorar. Ler notificação de todo app instalado seria invasivo, e
 * a lista de bancos conhecidos já cobre o caso comum sem o usuário configurar
 * nada — estas regras existem para o que ficou de fora.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { CapturesView } from "../../../server/services/captures.ts";
import { Badge, Empty } from "../../ui/primitives.tsx";

export function SourceRules({
  sources,
  options,
}: {
  sources: CapturesView["sources"];
  options: CapturesView["options"];
}) {
  const router = useRouter();
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const cartoes = options.cards.filter((card) => card.kind === "credit");

  async function salvar(corpo: Record<string, unknown>) {
    setErro(null);
    const resposta = await fetch("/api/v1/captures", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo),
    });

    if (!resposta.ok) {
      const body = (await resposta.json().catch(() => ({}))) as { error?: { message?: string } };
      setErro(body.error?.message ?? "Não foi possível salvar a regra.");
      return;
    }

    setCriando(false);
    router.refresh();
  }

  return (
    <div>
      {erro ? (
        <p role="alert" className="mb-3 rounded-md bg-negative-wash px-3 py-2 text-body-sm text-negative">
          {erro}
        </p>
      ) : null}

      {sources.length ? (
        <ul className="mb-4 border-t border-line">
          {sources.map((fonte) => (
            <li
              key={fonte.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-2.5 last:border-0"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 truncate text-body text-ink">
                  {fonte.label ?? fonte.sourceApp}
                  <Badge tone={fonte.action === "allow" ? "positive" : "neutral"}>
                    {fonte.action === "allow" ? "lendo" : "ignorando"}
                  </Badge>
                </p>
                <p className="truncate text-caption text-ink-subtle">{fonte.sourceApp}</p>
              </div>

              <button
                type="button"
                onClick={() =>
                  salvar({
                    sourceApp: fonte.sourceApp,
                    label: fonte.label,
                    action: fonte.action === "allow" ? "ignore" : "allow",
                    defaultAccountId: fonte.defaultAccountId,
                    defaultCardId: fonte.defaultCardId,
                    defaultCategoryId: fonte.defaultCategoryId,
                  })
                }
                className="rounded-md border border-line px-3 py-1.5 text-caption text-ink-muted hover:bg-surface-sunken"
              >
                {fonte.action === "allow" ? "Parar de ler" : "Passar a ler"}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mb-4">
          <Empty
            title="Nenhuma regra definida"
            hint="Nubank, Caju, Mercado Pago, Itaú, Bradesco, BB, Santander, PicPay, C6, Inter e XP já são lidos sem configuração."
          />
        </div>
      )}

      {criando ? (
        <form
          onSubmit={(evento) => {
            evento.preventDefault();
            const dados = new FormData(evento.currentTarget);
            const cardId = dados.get("defaultCardId");
            salvar({
              sourceApp: dados.get("sourceApp"),
              label: dados.get("label") || null,
              action: "allow",
              defaultCategoryId: dados.get("defaultCategoryId") || null,
              ...(cardId ? { defaultCardId: cardId } : { defaultAccountId: dados.get("defaultAccountId") || null }),
            });
          }}
          className="space-y-3 rounded-md border border-line p-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Pacote do app" dica="Ex.: com.banco.app — o aplicativo mostra o pacote">
              <input name="sourceApp" required maxLength={120} className={entrada} />
            </Campo>
            <Campo rotulo="Nome" dica="Opcional, só para você reconhecer">
              <input name="label" maxLength={80} className={entrada} />
            </Campo>
            <Campo rotulo="Conta padrão">
              <select name="defaultAccountId" className={entrada}>
                <option value="">Nenhuma</option>
                {options.accounts.map((conta) => (
                  <option key={conta.id} value={conta.id}>
                    {conta.name}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Cartão padrão" dica="Usado quando a notificação diz crédito">
              <select name="defaultCardId" className={entrada}>
                <option value="">Nenhum</option>
                {cartoes.map((cartao) => (
                  <option key={cartao.id} value={cartao.id}>
                    {cartao.name}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Categoria padrão">
              <select name="defaultCategoryId" className={entrada}>
                <option value="">Nenhuma</option>
                {options.categories
                  .filter((categoria) => categoria.kind === "expense")
                  .map((categoria) => (
                    <option key={categoria.id} value={categoria.id}>
                      {categoria.name}
                    </option>
                  ))}
              </select>
            </Campo>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              className="inline-flex h-9 shrink-0 select-none items-center justify-center gap-2 rounded-md border border-transparent bg-accent px-3.5 text-body-sm font-medium text-accent-ink transition-colors hover:bg-accent-hover disabled:pointer-events-none disabled:opacity-45"
            >
              Salvar
            </button>
            <button
              type="button"
              onClick={() => setCriando(false)}
              className="inline-flex h-9 shrink-0 select-none items-center justify-center gap-2 rounded-md border border-line-strong bg-surface px-3.5 text-body-sm font-medium text-ink transition-colors hover:bg-surface-inset disabled:pointer-events-none disabled:opacity-45"
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setCriando(true)}
          className="rounded-md border border-line px-4 py-2 text-body-sm text-ink-muted hover:bg-surface-sunken"
        >
          Permitir outro app
        </button>
      )}
    </div>
  );
}

const entrada =
  "h-9 w-full rounded-md border border-line bg-surface px-2.5 text-body-sm text-ink outline-none focus:border-accent";

function Campo({
  rotulo,
  dica,
  children,
}: {
  rotulo: string;
  dica?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-caption font-medium text-ink">{rotulo}</span>
      {children}
      {dica ? <span className="mt-1 block text-caption text-ink-subtle">{dica}</span> : null}
    </label>
  );
}
