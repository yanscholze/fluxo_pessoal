"use client";

/**
 * Editar uma conta: nome e cor.
 *
 * Cadastrar era possível; corrigir, não — nem aqui, nem no celular. Um nome
 * digitado errado ficava errado, e a única saída seria apagar a conta e perder
 * o histórico junto, que é o oposto do que um razão existe para fazer.
 *
 * A cor não é enfeite. É por ela que a conta é reconhecida antes de o nome ser
 * lido: no ponto ao lado do saldo, na fatia do gráfico, na linha do extrato.
 * Duas contas do mesmo banco com o mesmo cinza obrigam a ler o nome toda vez.
 *
 * Nove cores prontas e, ao lado delas, a paleta do sistema. As nove são a
 * mesma paleta dos gráficos: escolhendo entre elas, a cor continua legível na
 * fatia e na linha, sem sorte nenhuma envolvida. O seletor livre fica por
 * último porque é o caso raro — quem quer exatamente o azul do banco — e
 * porque ali a legibilidade passa a ser escolha de quem escolheu.
 *
 * O saldo não se edita aqui, e é deliberado: quem soma é o razão. A diferença
 * entre o que o Fluxo calculou e o que o banco mostra vira **lançamento**, no
 * botão "Acertar saldo" ao lado do número — corrigir por baixo faria o total
 * fechar e o histórico mentir.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Field, Input } from "../../ui/controls.tsx";
import { Dialog } from "../../ui/dialog.tsx";
import { Pencil } from "../../ui/icons.tsx";
import { Notice, join } from "../../ui/primitives.tsx";

/** As mesmas cores dos gráficos, mais um cinza para quem não quer distinguir. */
const CORES = [
  "#6d4aff",
  "#2563eb",
  "#0891b2",
  "#0d9668",
  "#65a30d",
  "#b45309",
  "#db2777",
  "#9333ea",
  "#64748b",
] as const;

export function EditAccount({
  accountId,
  name,
  color,
}: {
  accountId: string;
  name: string;
  color: string;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState(name);
  const [cor, setCor] = useState(color || CORES[8]);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    if (!nome.trim()) {
      setErro("A conta precisa de um nome.");
      return;
    }

    setEnviando(true);
    setErro(null);

    const resposta = await fetch(`/api/v1/accounts/${accountId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: nome.trim(), color: cor }),
    });

    setEnviando(false);

    if (!resposta.ok) {
      const corpo = (await resposta.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setErro(corpo?.error?.message ?? `O servidor respondeu ${resposta.status}.`);
      return;
    }

    setAberto(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-label={`Editar ${name}`}
        className="rounded-md p-1.5 text-ink-subtle transition-colors hover:bg-surface-inset hover:text-ink"
      >
        <Pencil size={14} strokeWidth={1.5} aria-hidden />
      </button>

      <Dialog
        open={aberto}
        onClose={() => setAberto(false)}
        title="Editar conta"
        description="O saldo continua vindo dos lançamentos — para corrigi-lo, use “Acertar saldo”."
        width="sm"
        footer={
          <Button variant="primary" busy={enviando} onClick={() => void salvar()}>
            Salvar
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label="Nome" htmlFor={`conta-nome-${accountId}`}>
            <Input
              id={`conta-nome-${accountId}`}
              value={nome}
              maxLength={60}
              autoFocus
              onChange={(evento) => setNome(evento.target.value)}
            />
          </Field>

          <Field
            label="Cor"
            hint="É por ela que a conta é reconhecida antes de o nome ser lido."
          >
            <div className="flex flex-wrap items-center gap-2">
              <div role="radiogroup" aria-label="Cor da conta" className="flex flex-wrap gap-2">
                {CORES.map((opcao) => {
                  const escolhida = cor.toLowerCase() === opcao.toLowerCase();
                  return (
                    <button
                      key={opcao}
                      type="button"
                      role="radio"
                      aria-checked={escolhida}
                      aria-label={`Cor ${opcao}`}
                      onClick={() => setCor(opcao)}
                      style={{ backgroundColor: opcao }}
                      className={join(
                        "size-8 rounded-full transition-transform hover:scale-105",
                        // O anel marca a escolha por fora: um "✓" dentro do
                        // círculo precisaria de contraste contra nove cores, e em
                        // duas delas ficaria ilegível.
                        escolhida ? "ring-2 ring-ink ring-offset-2 ring-offset-surface" : "",
                      )}
                    />
                  );
                })}
              </div>

              {/*
                A paleta do sistema, como no cadastro de cartão.

                As nove são atalho, não cerca: elas cobrem o caso comum e já
                nascem legíveis contra os gráficos. Quem quer o azul exato do
                banco abre o seletor do sistema aqui e escolhe, que é o mesmo
                gesto que o cartão sempre teve.
              */}
              <label className="ml-1 flex cursor-pointer items-center gap-1.5 text-caption text-ink-muted">
                <input
                  type="color"
                  value={cor}
                  aria-label="Outra cor"
                  onChange={(evento) => setCor(evento.target.value)}
                  className="size-8 cursor-pointer rounded-full border border-line-strong bg-surface-sunken"
                />
                outra
              </label>
            </div>
          </Field>

          {erro ? <Notice tone="negative">{erro}</Notice> : null}
        </div>
      </Dialog>
    </>
  );
}
