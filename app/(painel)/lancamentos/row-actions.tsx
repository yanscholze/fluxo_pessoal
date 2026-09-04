"use client";

/**
 * Corrigir e apagar um lançamento.
 *
 * Até aqui o extrato era só leitura: um valor digitado errado ficava errado
 * para sempre, e o produto inteiro existe para o saldo estar certo.
 *
 * As ações moram na própria linha, não num menu escondido atrás de um clique.
 * São duas, são as únicas, e a linha é o objeto que elas afetam — separá-las
 * dela obrigaria o usuário a confirmar mentalmente "é esta mesma?" a cada vez.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { StatementRow } from "../../../server/services/statement.ts";
import { Button, Field, Input, MoneyInput } from "../../ui/controls.tsx";
import { ConfirmDialog, Dialog } from "../../ui/dialog.tsx";
import { money } from "../../ui/format.ts";
import { Pencil, Trash2 } from "../../ui/icons.tsx";
import { Notice } from "../../ui/primitives.tsx";

type Modo = null | "editar" | "apagar";

/** Converte "1.234,56" no inteiro de centavos que a API espera. */
function centavosDe(texto: string): number {
  const limpo = texto.replace(/\./g, "").replace(",", ".");
  return Math.round(Number(limpo) * 100);
}

export function RowActions({ row }: { row: StatementRow }) {
  const router = useRouter();
  const [modo, setModo] = useState<Modo>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const [descricao, setDescricao] = useState(row.description);
  const [valor, setValor] = useState((row.amountCents / 100).toFixed(2).replace(".", ","));
  // Guardado como texto puro: o campo de data devolve `string`, e o formato
  // datado do domínio só volta a existir depois que o servidor valida.
  const [data, setData] = useState<string>(row.occurredOn);

  /**
   * Parcela e pagamento de fatura não se editam pelo extrato.
   *
   * Uma parcela isolada não tem existência própria: mudar o valor dela faria a
   * soma deixar de bater com o total da compra. O pagamento de fatura carrega a
   * amarração com a competência quitada. Nos dois casos a API recusa, e
   * oferecer o botão seria prometer o que não se cumpre.
   */
  const editavel = !row.installmentLabel && row.kind !== "invoice_payment";

  function fechar() {
    setModo(null);
    setErro(null);
  }

  async function chamar(metodo: "PATCH" | "DELETE", corpo?: Record<string, unknown>) {
    setEnviando(true);
    setErro(null);

    const resposta = await fetch(`/api/v1/transactions/${row.id}`, {
      method: metodo,
      ...(corpo
        ? { headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) }
        : {}),
    });

    setEnviando(false);

    if (!resposta.ok) {
      const dados = (await resposta.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      setErro(dados.error?.message ?? "Não foi possível concluir. Tente de novo.");
      return false;
    }

    fechar();
    router.refresh();
    return true;
  }

  return (
    <>
      <span className="flex items-center justify-end gap-0.5">
        {editavel ? (
          <button
            type="button"
            onClick={() => setModo("editar")}
            aria-label={`Corrigir ${row.description}`}
            className="rounded-md p-1.5 text-ink-subtle transition-colors hover:bg-surface-inset hover:text-ink"
          >
            <Pencil size={14} strokeWidth={1.5} aria-hidden />
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setModo("apagar")}
          aria-label={`Apagar ${row.description}`}
          className="rounded-md p-1.5 text-ink-subtle transition-colors hover:bg-negative-wash hover:text-negative"
        >
          <Trash2 size={14} strokeWidth={1.5} aria-hidden />
        </button>
      </span>

      <Dialog
        open={modo === "editar"}
        onClose={fechar}
        title="Corrigir lançamento"
        description="Mudar a data recalcula a competência e, no crédito, a fatura."
        width="sm"
        footer={
          <Button
            variant="primary"
            busy={enviando}
            onClick={() =>
              chamar("PATCH", {
                description: descricao,
                amount: centavosDe(valor),
                occurredOn: data,
              })
            }
          >
            Salvar
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label="Descrição" htmlFor={`descricao-${row.id}`}>
            <Input
              id={`descricao-${row.id}`}
              value={descricao}
              onChange={(evento) => setDescricao(evento.target.value)}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Valor" htmlFor={`valor-${row.id}`}>
              <MoneyInput
                id={`valor-${row.id}`}
                value={valor}
                onChange={(evento) => setValor(evento.target.value)}
              />
            </Field>

            <Field label="Data" htmlFor={`data-${row.id}`}>
              <Input
                id={`data-${row.id}`}
                type="date"
                value={data}
                onChange={(evento) => setData(evento.target.value)}
              />
            </Field>
          </div>

          {erro ? <Notice tone="negative">{erro}</Notice> : null}
        </div>
      </Dialog>

      <ConfirmDialog
        open={modo === "apagar"}
        onClose={fechar}
        onConfirm={() => chamar("DELETE")}
        busy={enviando}
        title="Apagar lançamento"
        consequence={`"${row.description}", de ${money(row.amountCents)}, sai do extrato e o valor volta para o saldo. ${
          row.installmentLabel ? "Esta é uma parcela: as demais continuam de pé." : ""
        }`}
      />
    </>
  );
}
