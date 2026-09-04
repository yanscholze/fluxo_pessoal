"use client";

/**
 * Dar baixa numa parcela.
 *
 * Receber não é só marcar uma caixa: cria a receita no razão, e por isso
 * precisa saber **em que conta** o dinheiro caiu. Sem essa pergunta o valor
 * entraria em lugar nenhum, e o saldo continuaria mentindo.
 */

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button, Field, Input, Select } from "../../../ui/controls.tsx";
import { Dialog } from "../../../ui/dialog.tsx";
import { Notice } from "../../../ui/primitives.tsx";

type Conta = { id: string; name: string };

export function PaymentActions({
  paymentId,
  description,
}: {
  paymentId: string;
  description: string;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [contas, setContas] = useState<Conta[]>([]);
  const [conta, setConta] = useState("");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // As contas só são buscadas quando o diálogo abre: carregá-las junto da
  // página faria uma requisição por parcela listada, para nada.
  useEffect(() => {
    if (!aberto || contas.length) return;

    let ativo = true;
    fetch("/api/v1/accounts")
      .then((resposta) => (resposta.ok ? resposta.json() : { data: [] }))
      .then((corpo: { data?: { id: string; name: string }[] }) => {
        if (!ativo) return;
        const lista = corpo.data ?? [];
        setContas(lista);
        setConta((atual) => atual || (lista[0]?.id ?? ""));
      })
      .catch(() => undefined);

    return () => {
      ativo = false;
    };
  }, [aberto, contas.length]);

  async function receber() {
    setEnviando(true);
    setErro(null);

    const resposta = await fetch(`/api/v1/payments/${paymentId}/receive`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accountId: conta, receivedOn: data }),
    });

    setEnviando(false);

    if (!resposta.ok) {
      const dados = (await resposta.json().catch(() => ({}))) as { error?: { message?: string } };
      setErro(dados.error?.message ?? "Não foi possível dar baixa.");
      return;
    }

    setAberto(false);
    router.refresh();
  }

  return (
    <>
      <Button size="sm" onClick={() => setAberto(true)}>
        Dar baixa
      </Button>

      <Dialog
        open={aberto}
        onClose={() => setAberto(false)}
        title="Registrar recebimento"
        description={`"${description}" vira uma receita no extrato, na conta escolhida.`}
        width="sm"
        footer={
          <Button variant="primary" busy={enviando} onClick={receber} disabled={!conta}>
            Confirmar recebimento
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label="Conta que recebeu" htmlFor={`conta-${paymentId}`}>
            <Select
              id={`conta-${paymentId}`}
              value={conta}
              onChange={(evento) => setConta(evento.target.value)}
            >
              {contas.length ? null : <option value="">Carregando…</option>}
              {contas.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Data do recebimento" htmlFor={`data-${paymentId}`}>
            <Input
              id={`data-${paymentId}`}
              type="date"
              value={data}
              onChange={(evento) => setData(evento.target.value)}
            />
          </Field>

          {erro ? <Notice tone="negative">{erro}</Notice> : null}
        </div>
      </Dialog>
    </>
  );
}
