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
import { useRef, useState } from "react";

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
  const requisicaoEmCurso = useRef(false);

  const [descricao, setDescricao] = useState(recurrence.description);
  const [valor, setValor] = useState(() => (recurrence.amountCents / 100).toFixed(2).replace(".", ","));
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
  /*
   * O modo de valor é o campo mais fácil de errar no cadastro, e o mais caro:
   * `per_business_day` multiplica o valor pelos dias úteis do mês. Um seguro de
   * R$ 91,50 cadastrado assim projeta R$ 1.921,50 e derruba a conta de quanto
   * sobra — e até agora ele era imutável.
   */
  const [modoDoValor, setModoDoValor] = useState(recurrence.amountMode);
  /*
   * O que transforma esta regra num contas a pagar de verdade.
   *
   * Com o casador preenchido, a notificação de pagamento do boleto deixa de
   * virar um lançamento solto ao lado da previsão — ela **dá baixa** nela. Sem
   * ele, o mesmo dinheiro apareceria duas vezes: uma como previsto, outra como
   * pago.
   */
  const [casador, setCasador] = useState(recurrence.captureMatch ?? "");
  const [ignorar, setIgnorar] = useState(recurrence.captureIgnore ?? "");

  const categoriasVisiveis = options.categories.filter((item) =>
    recurrence.kind === "income" ? item.kind === "income" : item.kind === "expense",
  );

  async function chamar(metodo: "PATCH" | "DELETE", corpo?: Record<string, unknown>) {
    if (requisicaoEmCurso.current) return;
    requisicaoEmCurso.current = true;
    setEnviando(true);
    setErro(null);

    try {
      const resposta = await fetch(`/api/v1/recurrences/${recurrence.id}`, {
        method: metodo,
        ...(corpo
          ? { headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) }
          : {}),
      });

      if (!resposta.ok) {
        const dados = (await resposta.json().catch(() => ({}))) as { error?: { message?: string } };
        setErro(dados.error?.message ?? "Não foi possível concluir. Tente de novo.");
        return;
      }

      setModo(null);
      router.refresh();
    } catch {
      setErro("Não foi possível falar com o Fluxo. Confira sua conexão e tente de novo.");
    } finally {
      requisicaoEmCurso.current = false;
      setEnviando(false);
    }
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
      amountMode: modoDoValor,
      captureMatch: casador.trim() || null,
      captureIgnore: ignorar.trim() || null,
      ...(tipo === "cartao" ? { cardId: id } : { accountId: id }),
      categoryId: categoria || null,
    });
  }

  return (
    <>
      <span className="flex flex-wrap items-center justify-end gap-1">
        <Button
          variant="ghost"
          size="sm"
          icon={Pencil}
          disabled={enviando}
          onClick={() => {
            setErro(null);
            setModo("editar");
          }}
        >
          Editar
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={recurrence.isActive ? Pause : Play}
          disabled={enviando}
          onClick={() => void chamar("PATCH", { isActive: !recurrence.isActive })}
        >
          {recurrence.isActive ? "Pausar" : "Retomar"}
        </Button>
        <Button
          variant="danger"
          size="sm"
          icon={Trash2}
          disabled={enviando}
          onClick={() => {
            setErro(null);
            setModo("apagar");
          }}
        >
          Excluir
        </Button>
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

          <Field
            label="Como o valor é calculado"
            htmlFor={`rec-modo-${recurrence.id}`}
            hint={
              modoDoValor === "fixed"
                ? "O valor acima, igual todo mês."
                : "O valor acima multiplicado pelos dias úteis do mês — é como funciona vale-alimentação."
            }
          >
            <Select
              id={`rec-modo-${recurrence.id}`}
              value={modoDoValor}
              onChange={(evento) => setModoDoValor(evento.target.value as typeof modoDoValor)}
            >
              <option value="fixed">Valor fixo</option>
              <option value="per_business_day">Valor por dia útil</option>
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={recurrence.kind === "income" ? "Entra em" : "Sai de"}
              htmlFor={`rec-origem-${recurrence.id}`}
            >
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

          {/*
            A ligação com a captura fecha o ciclo do contas a pagar: a regra
            prevê, a notificação do banco avisa, e a confirmação dá baixa.
          */}
          <div className="rounded-nested border border-line bg-surface-sunken p-3">
            <p className="text-body-sm font-medium text-ink">Baixa automática pela notificação</p>
            <p className="mt-0.5 text-caption text-ink-subtle">
              Quando a notificação do banco contiver este texto, confirmar a captura dá baixa nesta
              regra em vez de criar um lançamento novo.
            </p>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field
                label="Texto que identifica a cobrança"
                htmlFor={`rec-casa-${recurrence.id}`}
                hint="Ex.: STAR PROTECAO"
              >
                <Input
                  id={`rec-casa-${recurrence.id}`}
                  value={casador}
                  onChange={(evento) => setCasador(evento.target.value)}
                  placeholder="nome do credor na notificação"
                />
              </Field>

              <Field
                label="Texto que significa “ignore”"
                htmlFor={`rec-ign-${recurrence.id}`}
                hint="Ex.: emitido — o aviso de boleto gerado não é pagamento."
              >
                <Input
                  id={`rec-ign-${recurrence.id}`}
                  value={ignorar}
                  onChange={(evento) => setIgnorar(evento.target.value)}
                  placeholder="emitido"
                  disabled={!casador.trim()}
                />
              </Field>
            </div>
          </div>

          {recurrence.amountMode !== "fixed" && modoDoValor !== "fixed" ? (
            <Notice tone="caution">
              Hoje esta regra projeta{" "}
              <strong>{money(recurrence.next?.amountCents ?? recurrence.amountCents)}</strong> por
              mês, não {money(recurrence.amountCents)}. Se o valor é sempre o mesmo, troque para
              “Valor fixo”.
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
        error={erro}
        title="Apagar recorrência"
        consequence={`"${recurrence.description}" sai da projeção dos próximos meses. Os lançamentos que ela já gerou ficam no extrato — eles aconteceram.`}
      />
    </>
  );
}
