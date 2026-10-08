"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { Competence } from "../../../core/time/competence.ts";
import type { OccurrenceTransaction } from "../../../server/services/recurrences.ts";
import { Button, Field, Input, MoneyInput, Select } from "../../ui/controls.tsx";
import { Dialog } from "../../ui/dialog.tsx";
import { dateShort, money } from "../../ui/format.ts";
import { Notice } from "../../ui/primitives.tsx";

/** A baixa pode reconhecer um movimento existente ou criar um fato novo. */
export function ConfirmOccurrence({ recurrenceId, competence, amountCents, description, scheduledFor }: {
  recurrenceId: string;
  competence: Competence;
  amountCents: number;
  description: string;
  scheduledFor: string;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [modo, setModo] = useState<"vincular" | "criar">("vincular");
  const [lancamentos, setLancamentos] = useState<OccurrenceTransaction[]>([]);
  const [transactionId, setTransactionId] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [valor, setValor] = useState(() => (amountCents / 100).toFixed(2).replace(".", ","));
  const [data, setData] = useState(scheduledFor);
  const escolhido = lancamentos.find((item) => item.id === transactionId);

  async function carregar() {
    setCarregando(true);
    setErro(null);
    try {
      const query = new URLSearchParams({ recurrenceId, competence });
      const resposta = await fetch(`/api/v1/recurrences/confirm?${query}`);
      const corpo = await resposta.json();
      if (!resposta.ok) throw new Error(corpo.error?.message ?? "Não foi possível carregar os lançamentos.");
      setLancamentos(corpo.data.transactions);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Confira a conexão e tente novamente.");
    } finally {
      setCarregando(false);
    }
  }

  function abrir() {
    setModo("vincular");
    setTransactionId("");
    setLancamentos([]);
    setValor((amountCents / 100).toFixed(2).replace(".", ","));
    setData(scheduledFor);
    setAberto(true);
    void carregar();
  }

  async function confirmar() {
    setEnviando(true);
    setErro(null);
    try {
      const resposta = await fetch("/api/v1/recurrences/confirm", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ recurrenceId, competence,
          ...(modo === "vincular" ? { transactionId } : { amount: valor, occurredOn: data }) }),
      });
      const corpo = await resposta.json();
      if (!resposta.ok) throw new Error(corpo.error?.message ?? "Não foi possível dar baixa.");
      setAberto(false);
      router.refresh();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Confira a conexão e tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return <>
    <Button size="sm" onClick={abrir} aria-label={`Dar baixa em ${description}`}>Dar baixa</Button>
    <Dialog open={aberto} onClose={() => { if (!enviando) setAberto(false); }} title="Dar baixa no compromisso"
      description={`${description} · previsto ${money(amountCents)}`} width="md"
      footer={<Button variant="primary" busy={enviando} onClick={() => void confirmar()}
        disabled={modo === "vincular" ? !escolhido || carregando : !valor.trim() || !data}>
        {modo === "vincular" ? "Vincular lançamento" : "Criar e dar baixa"}
      </Button>}>
      <div className="space-y-4">
        <fieldset className="space-y-2" disabled={enviando}>
          <legend className="mb-2 text-body-sm font-medium text-ink">Como este compromisso foi realizado?</legend>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-line p-3">
            <input type="radio" name={`baixa-${recurrenceId}`} checked={modo === "vincular"} onChange={() => { setModo("vincular"); setErro(null); }} className="accent-[var(--color-accent)]" />
            <span><span className="block text-body-sm font-medium text-ink">Já está no extrato</span><span className="text-caption text-ink-muted">Usar um lançamento existente, sem movimentar o saldo.</span></span>
          </label>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-line p-3">
            <input type="radio" name={`baixa-${recurrenceId}`} checked={modo === "criar"} onChange={() => { setModo("criar"); setErro(null); }} className="accent-[var(--color-accent)]" />
            <span><span className="block text-body-sm font-medium text-ink">Ainda não foi lançado</span><span className="text-caption text-ink-muted">Criar um novo lançamento na conta ou cartão da recorrência.</span></span>
          </label>
        </fieldset>
        {modo === "vincular" ? <>
          <Field label="Lançamento existente" htmlFor={`vinculo-${recurrenceId}`} hint="Movimentos confirmados da mesma natureza, ainda sem vínculo. A conta ou cartão real será preservado.">
            <Select id={`vinculo-${recurrenceId}`} value={transactionId} onChange={(event) => setTransactionId(event.target.value)} disabled={carregando || enviando}>
              <option value="">{carregando ? "Carregando…" : "Selecione o lançamento"}</option>
              {lancamentos.map((item) => <option key={item.id} value={item.id}>{dateShort(item.occurredOn)} · {item.description} · {item.originName} · {money(item.amountCents)}</option>)}
            </Select>
          </Field>
          {!carregando && !lancamentos.length && !erro ? <Notice tone="info">Nenhum movimento disponível. Se ainda não está no extrato, escolha “Ainda não foi lançado”.</Notice> : null}
          {escolhido ? <Notice tone="info">A previsão será baixada pelo valor real de {money(escolhido.amountCents)}, em {dateShort(escolhido.occurredOn)}. O lançamento e o saldo serão preservados.</Notice> : null}
        </> : <>
          <Notice tone="caution">Esta opção cria um novo movimento. Use somente se o pagamento ou recebimento ainda não estiver no extrato.</Notice>
          <Field label="Valor realizado" htmlFor={`valor-${recurrenceId}`}><MoneyInput id={`valor-${recurrenceId}`} value={valor} onChange={(event) => setValor(event.target.value)} disabled={enviando} /></Field>
          <Field label="Data" htmlFor={`data-${recurrenceId}`}><Input id={`data-${recurrenceId}`} type="date" value={data} onChange={(event) => setData(event.target.value)} disabled={enviando} /></Field>
        </>}
        {erro ? <div role="alert"><p className="text-body-sm text-negative">{erro}</p>{modo === "vincular" ? <Button size="sm" variant="ghost" onClick={() => void carregar()} disabled={carregando}>Atualizar lista</Button> : null}</div> : null}
      </div>
    </Dialog>
  </>;
}
