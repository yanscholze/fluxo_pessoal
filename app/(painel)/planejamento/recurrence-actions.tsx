"use client";

/**
 * Corrigir, pausar e apagar uma recorrência.
 *
 * A tela de Recorrências só sabia **criar**. Uma regra cadastrada com o valor
 * errado, no dia errado, ou no modo de cálculo errado ficava assim para sempre
 * — e recorrência errada é pior que recorrência ausente: ela se multiplica por
 * todos os meses da projeção. Um seguro de R$ 91,50 lançado como "por dia útil"
 * virava R$ 1.921,50 por mês na conta de quanto sobra.
 *
 * Pausar e apagar respondem coisas diferentes, e as duas existem por isso.
 * Pausada, a regra para de projetar mas continua na tela: é o serviço que se
 * cancelou e talvez volte. Apagada, some — e o que ela já lançou fica, porque
 * virou fato no razão.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { PlanningView, RecurrenceView } from "../../../server/services/planning.ts";
import { Button, Field, Input, MoneyInput, Select } from "../../ui/controls.tsx";
import { ConfirmDialog, Dialog } from "../../ui/dialog.tsx";
import { money } from "../../ui/format.ts";
import { Pause, Pencil, Play, Trash2 } from "../../ui/icons.tsx";
import { Notice } from "../../ui/primitives.tsx";

type Modo = null | "editar" | "apagar";

export function RecurrenceActions({
  recurrence,
  options,
}: {
  recurrence: RecurrenceView;
  options: PlanningView["options"];
}) {
  const router = useRouter();
  const [modo, setModo] = useState<Modo>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [descricao, setDescricao] = useState(recurrence.description);
  const [valor, setValor] = useState((recurrence.amountCents / 100).toFixed(2).replace(".", ","));
  const [dia, setDia] = useState(String(recurrence.scheduleDay));
  const [intervalo, setIntervalo] = useState(recurrence.interval);
  /*
   * Origem num campo só, com o tipo embutido — duas listas separadas deixariam
   * escolher conta e cartão ao mesmo tempo, e a API recusa os dois juntos.
   */
  const [origem, setOrigem] = useState(
    recurrence.cardId ? `cartao:${recurrence.cardId}` : `conta:${recurrence.accountId ?? ""}`,
  );
  const [categoria, setCategoria] = useState(recurrence.categoryId ?? "");

  const categoriasVisiveis = options.categories.filter((item) =>
    recurrence.kind === "income" ? item.kind === "income" : item.kind === "expense",
  );

  async function chamar(metodo: "PATCH" | "DELETE", corpo?: Record<string, unknown>) {
    setEnviando(true);
    setErro(null);

    const resposta = await fetch(`/api/v1/recurrences/${recurrence.id}`, {
      method: metodo,
      ...(corpo
        ? { headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) }
        : {}),
    });

    setEnviando(false);

    if (!resposta.ok) {
      const dados = (await resposta.json().catch(() => ({}))) as { error?: { message?: string } };
      setErro(dados.error?.message ?? "Não foi possível concluir. Tente de novo.");
      return;
    }

    setModo(null);
    router.refresh();
  }

  function salvar() {
    const [tipo, id] = origem.split(":");
    void chamar("PATCH", {
      description: descricao,
      // Texto cru: `parseMoney` resolve no servidor, e é o mesmo parser do resto
      // do produto. Converter aqui seria a segunda implementação da regra.
      amount: valor,
      scheduleDay: Number(dia) || recurrence.scheduleDay,
      interval: intervalo,
      ...(tipo === "cartao" ? { cardId: id } : { accountId: id }),
      categoryId: categoria || null,
    });
  }

  return (
    <>
      <span className="flex items-center justify-end gap-0.5">
        <button
          type="button"
          onClick={() => setModo("editar")}
          aria-label={`Corrigir ${recurrence.description}`}
          className="rounded-md p-1.5 text-ink-subtle transition-colors hover:bg-surface-inset hover:text-ink"
        >
          <Pencil size={14} strokeWidth={1.5} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => void chamar("PATCH", { isActive: !recurrence.isActive })}
          aria-label={`${recurrence.isActive ? "Pausar" : "Retomar"} ${recurrence.description}`}
          className="rounded-md p-1.5 text-ink-subtle transition-colors hover:bg-surface-inset hover:text-ink"
        >
          {recurrence.isActive ? (
            <Pause size={14} strokeWidth={1.5} aria-hidden />
          ) : (
            <Play size={14} strokeWidth={1.5} aria-hidden />
          )}
        </button>
        <button
          type="button"
          onClick={() => setModo("apagar")}
          aria-label={`Apagar ${recurrence.description}`}
          className="rounded-md p-1.5 text-ink-subtle transition-colors hover:bg-negative-wash hover:text-negative"
        >
          <Trash2 size={14} strokeWidth={1.5} aria-hidden />
        </button>
      </span>

      <Dialog
        open={modo === "editar"}
        onClose={() => setModo(null)}
        title="Corrigir recorrência"
        description="A mudança vale para as próximas ocorrências. O que já foi lançado fica como está."
        width="md"
        footer={
          <Button variant="primary" busy={enviando} onClick={salvar}>
            Salvar
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label="Descrição" htmlFor={`rec-desc-${recurrence.id}`}>
            <Input
              id={`rec-desc-${recurrence.id}`}
              value={descricao}
              onChange={(evento) => setDescricao(evento.target.value)}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Valor" htmlFor={`rec-valor-${recurrence.id}`}>
              <MoneyInput
                id={`rec-valor-${recurrence.id}`}
                value={valor}
                onChange={(evento) => setValor(evento.target.value)}
              />
            </Field>

            <Field label="Dia" htmlFor={`rec-dia-${recurrence.id}`} hint={recurrence.scheduleLabel}>
              <Input
                id={`rec-dia-${recurrence.id}`}
                type="number"
                min={1}
                max={31}
                value={dia}
                onChange={(evento) => setDia(evento.target.value)}
              />
            </Field>

            <Field label="Repete" htmlFor={`rec-int-${recurrence.id}`}>
              <Select
                id={`rec-int-${recurrence.id}`}
                value={intervalo}
                onChange={(evento) => setIntervalo(evento.target.value as typeof intervalo)}
              >
                <option value="monthly">Todo mês</option>
                <option value="yearly">Todo ano</option>
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Sai de" htmlFor={`rec-origem-${recurrence.id}`}>
              <Select
                id={`rec-origem-${recurrence.id}`}
                value={origem}
                onChange={(evento) => setOrigem(evento.target.value)}
              >
                {options.accounts.map((conta) => (
                  <option key={conta.id} value={`conta:${conta.id}`}>
                    {conta.name}
                  </option>
                ))}
                {recurrence.kind === "expense"
                  ? options.cards.map((cartao) => (
                      <option key={cartao.id} value={`cartao:${cartao.id}`}>
                        {cartao.name}
                      </option>
                    ))
                  : null}
              </Select>
            </Field>

            <Field label="Categoria" htmlFor={`rec-cat-${recurrence.id}`}>
              <Select
                id={`rec-cat-${recurrence.id}`}
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
          </div>

          {recurrence.amountMode !== "fixed" ? (
            <Notice tone="caution">
              Esta regra usa <strong>valor por dia útil</strong>: o valor acima é multiplicado pelos
              dias úteis do mês. Para um valor fixo, apague e cadastre de novo — a próxima ocorrência
              hoje seria {money(recurrence.next?.amountCents ?? recurrence.amountCents)}.
            </Notice>
          ) : null}

          {erro ? <Notice tone="negative">{erro}</Notice> : null}
        </div>
      </Dialog>

      <ConfirmDialog
        open={modo === "apagar"}
        onClose={() => setModo(null)}
        onConfirm={() => void chamar("DELETE")}
        busy={enviando}
        title="Apagar recorrência"
        consequence={`"${recurrence.description}" sai da projeção dos próximos meses. Os lançamentos que ela já gerou ficam no extrato — eles aconteceram.`}
      />
    </>
  );
}
