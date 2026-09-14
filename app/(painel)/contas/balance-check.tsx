"use client";

/**
 * Acertar o saldo de uma conta.
 *
 * O Fluxo deduz o saldo somando lançamentos, e é assim que ele fecha com o
 * banco. Mas todo saldo deduzido acumula o que ficou de fora: uma compra em
 * dinheiro que ninguém registrou, um período que a importação não cobriu, uma
 * entrada que chegou depois do último extrato. A diferença não é grande, mas é
 * permanente — e um saldo que nunca fecha é um saldo em que não se confia.
 *
 * Aqui o dono informa **quanto tem de verdade**, e a diferença vira um
 * lançamento comum, com data de hoje, visível no extrato como qualquer outro.
 *
 * Isso é deliberado, e é a regra da casa: valor que existia sem o app saber
 * entra como lançamento, nunca embutido num saldo de abertura. Corrigir o
 * número por baixo faria o saldo bater e o histórico mentir — o extrato
 * mostraria um total que nenhuma soma das suas linhas produz.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Field, MoneyInput, Select } from "../../ui/controls.tsx";
import { Dialog } from "../../ui/dialog.tsx";
import { money } from "../../ui/format.ts";
import { Notice } from "../../ui/primitives.tsx";

type Categoria = { id: string; name: string; kind: "expense" | "income" };

export function BalanceCheck({
  accountId,
  accountName,
  balanceCents,
}: {
  accountId: string;
  accountName: string;
  balanceCents: number;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [real, setReal] = useState("");
  const [categorias, setCategorias] = useState<Categoria[] | null>(null);
  const [categoria, setCategoria] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function abrir() {
    setAberto(true);
    setReal((balanceCents / 100).toFixed(2).replace(".", ","));
    if (categorias) return;

    const resposta = await fetch("/api/v1/categories");
    if (!resposta.ok) {
      setCategorias([]);
      return;
    }
    const corpo = (await resposta.json()) as { data?: Categoria[] };
    setCategorias(corpo.data ?? []);
  }

  /**
   * A diferença, em centavos.
   *
   * Calculada aqui só para o texto de confirmação — quem converte o valor
   * digitado de verdade é `parseMoney`, no servidor. Um número aproximado numa
   * frase é aceitável; um número aproximado gravado, não.
   */
  const digitado = Number(real.replace(/\./g, "").replace(",", "."));
  const diferenca = Number.isFinite(digitado) ? Math.round(digitado * 100) - balanceCents : 0;
  const entrada = diferenca > 0;

  const visiveis = (categorias ?? []).filter((item) =>
    entrada ? item.kind === "income" : item.kind === "expense",
  );

  async function acertar() {
    if (diferenca === 0) {
      setErro("O saldo informado é igual ao que o Fluxo já tem.");
      return;
    }

    setEnviando(true);
    setErro(null);

    const resposta = await fetch("/api/v1/transactions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: entrada ? "income" : "expense",
        description: `Acerto de saldo · ${accountName}`,
        amount: (Math.abs(diferenca) / 100).toFixed(2),
        occurredOn: new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
        state: "confirmed",
        accountId,
        ...(categoria ? { categoryId: categoria } : {}),
      }),
    });

    setEnviando(false);

    if (!resposta.ok) {
      const corpo = (await resposta.json().catch(() => ({}))) as { error?: { message?: string } };
      setErro(corpo.error?.message ?? "Não foi possível acertar o saldo.");
      return;
    }

    setAberto(false);
    router.refresh();
  }

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => void abrir()}>
        Acertar saldo
      </Button>

      <Dialog
        open={aberto}
        onClose={() => setAberto(false)}
        title={`Acertar o saldo de ${accountName}`}
        description="O Fluxo soma os lançamentos para chegar ao saldo. Informe o que o banco mostra e a diferença entra como um lançamento."
        width="sm"
        footer={
          <Button variant="primary" busy={enviando} onClick={() => void acertar()} disabled={diferenca === 0}>
            {diferenca === 0
              ? "Sem diferença"
              : `Lançar ${entrada ? "entrada" : "saída"} de ${money(Math.abs(diferenca))}`}
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label="Saldo no Fluxo hoje" htmlFor={`atual-${accountId}`}>
            <MoneyInput id={`atual-${accountId}`} value={(balanceCents / 100).toFixed(2).replace(".", ",")} readOnly />
          </Field>

          <Field
            label="Saldo que o banco mostra"
            htmlFor={`real-${accountId}`}
            hint="O que está no aplicativo do banco, agora."
          >
            <MoneyInput
              id={`real-${accountId}`}
              value={real}
              autoFocus
              onChange={(evento) => setReal(evento.target.value)}
            />
          </Field>

          {diferenca !== 0 ? (
            <>
              <Field
                label="Categoria"
                htmlFor={`categoria-${accountId}`}
                hint={
                  entrada
                    ? "De onde veio o dinheiro que o Fluxo não viu."
                    : "Para onde foi o dinheiro que o Fluxo não viu."
                }
              >
                <Select
                  id={`categoria-${accountId}`}
                  value={categoria}
                  onChange={(evento) => setCategoria(evento.target.value)}
                >
                  <option value="">Sem categoria</option>
                  {visiveis.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Notice tone="info">
                Entra no extrato de hoje como {entrada ? "receita" : "despesa"} de{" "}
                {money(Math.abs(diferenca))}, com o nome “Acerto de saldo”. Dá para editar ou apagar
                depois como qualquer lançamento.
              </Notice>
            </>
          ) : null}

          {erro ? <Notice tone="negative">{erro}</Notice> : null}
        </div>
      </Dialog>
    </>
  );
}
