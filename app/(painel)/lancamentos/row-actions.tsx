"use client";

/**
 * Corrigir e apagar um lançamento.
 *
 * Até aqui o extrato era só leitura: um valor digitado errado ficava errado
 * para sempre, e o produto inteiro existe para o saldo estar certo.
 *
 * A primeira versão desta tela corrigia três campos — descrição, valor e data.
 * Era pouco: o erro mais comum de um extrato importado não é o valor, é a
 * **categoria**, e depois dela a conta que pagou. Sem esses dois o usuário
 * conseguia arrumar o saldo e continuar com o relatório errado, que é o pior
 * dos dois mundos — os números batem e a leitura mente.
 *
 * Agora o diálogo cobre tudo o que a API aceita mudar. A situação
 * (previsto/confirmado) entra junto porque é o gesto de "isto aconteceu de
 * verdade", e ele acontece justamente aqui, olhando o extrato.
 *
 * As ações moram na própria linha, não num menu escondido atrás de um clique.
 * São duas, são as únicas, e a linha é o objeto que elas afetam — separá-las
 * dela obrigaria o usuário a confirmar mentalmente "é esta mesma?" a cada vez.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { Statement, StatementRow } from "../../../server/services/statement.ts";
import { Button, Field, Input, MoneyInput, Select, Textarea } from "../../ui/controls.tsx";
import { ConfirmDialog, Dialog } from "../../ui/dialog.tsx";
import { money } from "../../ui/format.ts";
import { Pencil, Trash2 } from "../../ui/icons.tsx";
import { Notice } from "../../ui/primitives.tsx";

type Modo = null | "editar" | "apagar";
type Opcoes = Statement["options"];

/** Converte "1.234,56" no inteiro de centavos que a API espera. */
function centavosDe(texto: string): number {
  const limpo = texto.replace(/\./g, "").replace(",", ".");
  return Math.round(Number(limpo) * 100);
}

export function RowActions({ row, options }: { row: StatementRow; options: Opcoes }) {
  const router = useRouter();
  const [modo, setModo] = useState<Modo>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const [descricao, setDescricao] = useState(row.description);
  const [valor, setValor] = useState((row.amountCents / 100).toFixed(2).replace(".", ","));
  // Guardado como texto puro: o campo de data devolve `string`, e o formato
  // datado do domínio só volta a existir depois que o servidor valida.
  const [data, setData] = useState<string>(row.occurredOn);
  const [categoria, setCategoria] = useState(row.categoryId ?? "");
  /*
   * A origem é um valor só, com o tipo embutido ("conta:123" / "cartao:456").
   *
   * Dois seletores separados deixariam escolher conta *e* cartão ao mesmo
   * tempo, e a API recusa a edição inteira quando recebe os dois. Um campo
   * único torna o estado inválido impossível de expressar.
   */
  const [origem, setOrigem] = useState(
    `${row.originKind === "card" ? "cartao" : "conta"}:${row.originId}`,
  );
  const [destino, setDestino] = useState(row.destinationId ?? "");
  const [situacao, setSituacao] = useState<"confirmed" | "planned">(
    row.state === "planned" ? "planned" : "confirmed",
  );
  const [observacao, setObservacao] = useState(row.notes ?? "");

  /**
   * Parcela e pagamento de fatura não se editam pelo extrato.
   *
   * Uma parcela isolada não tem existência própria: mudar o valor dela faria a
   * soma deixar de bater com o total da compra. O pagamento de fatura carrega a
   * amarração com a competência quitada. Nos dois casos a API recusa, e
   * oferecer o botão seria prometer o que não se cumpre.
   */
  const editavel = !row.installmentLabel && row.kind !== "invoice_payment";

  /*
   * A transferência é a única que tem destino, e a única em que ele importa:
   * nas demais o dinheiro sai e acabou. Mostrar o campo sempre convidaria a
   * preenchê-lo onde ele não significa nada.
   */
  const temDestino = row.kind === "transfer";

  /* Receita não usa categoria de despesa, e vice-versa. */
  const categoriasVisiveis = options.categories.filter((item) =>
    row.kind === "income" ? item.kind === "income" : item.kind === "expense",
  );

  /*
   * Transferência sai sempre de conta. Um cartão de crédito não transfere
   * dinheiro — ele empresta, e isso é outra natureza de lançamento.
   */
  const podeSerCartao = row.kind === "expense";

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

  function salvar() {
    const [tipo, id] = origem.split(":");
    void chamar("PATCH", {
      description: descricao,
      amount: centavosDe(valor),
      occurredOn: data,
      state: situacao,
      // String vazia é "sem categoria", e `null` é o que a API entende por
      // isso; mandar "" faria a validação de referência recusar.
      categoryId: categoria || null,
      ...(tipo === "cartao" ? { cardId: id, accountId: null } : { accountId: id, cardId: null }),
      ...(temDestino ? { destinationAccountId: destino || null } : {}),
      notes: observacao.trim() || null,
    });
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
        width="md"
        footer={
          <Button variant="primary" busy={enviando} onClick={salvar}>
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

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={row.kind === "transfer" ? "Sai de" : "Pago com"}
              htmlFor={`origem-${row.id}`}
            >
              <Select
                id={`origem-${row.id}`}
                value={origem}
                onChange={(evento) => setOrigem(evento.target.value)}
              >
                {options.accounts.map((conta) => (
                  <option key={conta.id} value={`conta:${conta.id}`}>
                    {conta.name}
                  </option>
                ))}
                {podeSerCartao
                  ? options.cards.map((cartao) => (
                      <option key={cartao.id} value={`cartao:${cartao.id}`}>
                        {cartao.name}
                      </option>
                    ))
                  : null}
              </Select>
            </Field>

            {temDestino ? (
              <Field label="Vai para" htmlFor={`destino-${row.id}`}>
                <Select
                  id={`destino-${row.id}`}
                  value={destino}
                  onChange={(evento) => setDestino(evento.target.value)}
                >
                  <option value="">—</option>
                  {options.accounts.map((conta) => (
                    <option key={conta.id} value={conta.id}>
                      {conta.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <Field label="Categoria" htmlFor={`categoria-${row.id}`}>
                <Select
                  id={`categoria-${row.id}`}
                  value={categoria}
                  onChange={(evento) => setCategoria(evento.target.value)}
                >
                  <option value="">Sem categoria</option>
                  {categoriasVisiveis.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>

          <Field
            label="Situação"
            htmlFor={`situacao-${row.id}`}
            hint="Previsto não conta no saldo; confirmado, sim."
          >
            <Select
              id={`situacao-${row.id}`}
              value={situacao}
              onChange={(evento) => setSituacao(evento.target.value as "confirmed" | "planned")}
            >
              <option value="confirmed">Confirmado</option>
              <option value="planned">Previsto</option>
            </Select>
          </Field>

          <Field label="Observação" htmlFor={`observacao-${row.id}`}>
            <Textarea
              id={`observacao-${row.id}`}
              rows={2}
              value={observacao}
              onChange={(evento) => setObservacao(evento.target.value)}
              placeholder="O que este lançamento tem de especial"
            />
          </Field>

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
