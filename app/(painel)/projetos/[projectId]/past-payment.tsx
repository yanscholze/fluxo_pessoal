"use client";

/**
 * Registrar um recebimento que já aconteceu.
 *
 * Dar baixa pressupõe uma parcela esperando, e há um caso anterior a isso: o
 * dinheiro entrou antes de o projeto existir no Fluxo. É o projeto cadastrado
 * depois do pagamento — o cliente pagou, o extrato registrou, e o projeto nasce
 * já com zero a receber e nada em aberto para dar baixa.
 *
 * Sem este caminho o usuário ficava sem saída: criar a parcela e receber pelo
 * fluxo normal criaria uma **segunda** receita, dobrando a renda daquele mês. O
 * dinheiro já está no razão; o que falta é dizer de qual projeto ele veio.
 *
 * A parcela nasce já quitada, com o valor e a data do lançamento. Quem manda
 * sobre quanto e quando entrou é o extrato, não o que foi combinado.
 */

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button, Field, Input, Select } from "../../../ui/controls.tsx";
import { Dialog } from "../../../ui/dialog.tsx";
import { dateShort, money } from "../../../ui/format.ts";
import { Notice } from "../../../ui/primitives.tsx";

type Receita = {
  id: string;
  description: string;
  occurredOn: string;
  amountCents: number;
};

export function PastPayment({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  // `null` é "ainda não busquei", diferente de "busquei e não há nenhuma".
  const [receitas, setReceitas] = useState<Receita[] | null>(null);
  const [receita, setReceita] = useState("");
  const [descricao, setDescricao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto || receitas !== null) return;

    let ativo = true;
    fetch("/api/v1/payments/unlinked-income")
      .then((resposta) => (resposta.ok ? resposta.json() : { data: { transactions: [] } }))
      .then((corpo: { data?: { transactions?: Receita[] } }) => {
        if (!ativo) return;
        const lista = corpo.data?.transactions ?? [];
        setReceitas(lista);
        setReceita((atual) => atual || (lista[0]?.id ?? ""));
      })
      .catch(() => {
        if (ativo) setReceitas([]);
      });

    return () => {
      ativo = false;
    };
  }, [aberto, receitas]);

  const escolhida = (receitas ?? []).find((item) => item.id === receita) ?? null;

  async function registrar() {
    setEnviando(true);
    setErro(null);

    const resposta = await fetch(`/api/v1/projects/${projectId}/payments/past`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        transactionId: receita,
        ...(descricao.trim() ? { description: descricao.trim() } : {}),
      }),
    });

    setEnviando(false);

    if (!resposta.ok) {
      const corpo = (await resposta.json().catch(() => ({}))) as { error?: { message?: string } };
      setErro(corpo.error?.message ?? "Não foi possível registrar.");
      return;
    }

    setAberto(false);
    setDescricao("");
    setReceitas(null);
    router.refresh();
  }

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setAberto(true)}>
        Recebimento anterior
      </Button>

      <Dialog
        open={aberto}
        onClose={() => setAberto(false)}
        title="Registrar recebimento anterior"
        description="Para dinheiro que entrou antes de o projeto existir aqui. A receita já está no extrato — falta dizer de qual projeto ela veio."
        width="sm"
        footer={
          <Button variant="primary" busy={enviando} onClick={() => void registrar()} disabled={!receita}>
            {escolhida ? `Vincular ${money(escolhida.amountCents)}` : "Vincular"}
          </Button>
        }
      >
        <div className="space-y-4">
          <Field
            label="Receita que pagou este projeto"
            htmlFor={`past-receita-${projectId}`}
            hint="Só aparecem receitas confirmadas que ainda não quitaram outra parcela."
          >
            <Select
              id={`past-receita-${projectId}`}
              value={receita}
              onChange={(evento) => setReceita(evento.target.value)}
            >
              {receitas === null ? <option value="">Carregando…</option> : null}
              {receitas?.length === 0 ? <option value="">Nenhuma receita disponível</option> : null}
              {(receitas ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {dateShort(item.occurredOn as never)} · {money(item.amountCents)} · {item.description}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Nome da parcela"
            htmlFor={`past-desc-${projectId}`}
            hint="Opcional. Em branco, usa a descrição do lançamento."
          >
            <Input
              id={`past-desc-${projectId}`}
              value={descricao}
              onChange={(evento) => setDescricao(evento.target.value)}
              placeholder="Entrada · primeira parcela"
            />
          </Field>

          {escolhida ? (
            <Notice tone="info">
              Entra na cobrança do projeto como parcela já recebida de{" "}
              {money(escolhida.amountCents)}, com a data de {dateShort(escolhida.occurredOn as never)}.
              Nenhuma receita nova é criada — a que existe passa a contar para este projeto.
            </Notice>
          ) : null}

          {erro ? <Notice tone="negative">{erro}</Notice> : null}
        </div>
      </Dialog>
    </>
  );
}
