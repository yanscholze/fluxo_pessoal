"use client";

/**
 * Cadastro de assinatura.
 *
 * Faltava: a única forma de registrar uma era ir em Recorrências e escolher o
 * papel certo — a tela que fala de assinatura não deixava criar uma.
 *
 * O cartão é obrigatório na prática e por isso vem antes da categoria: quase
 * toda assinatura é debitada num cartão, e é o cartão que decide em qual fatura
 * a cobrança cai. Sem ele, a assinatura vira um valor que não sai de lugar
 * nenhum.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Field, Input, MoneyInput, Select } from "../../ui/controls.tsx";
import { Dialog } from "../../ui/dialog.tsx";
import { Plus } from "../../ui/icons.tsx";
import { Notice } from "../../ui/primitives.tsx";

export type Opcao = { readonly id: string; readonly name: string };

/** Converte "89,90" no inteiro de centavos que a API espera. */
function centavosDe(texto: string): number {
  return Math.round(Number(texto.trim().replace(/\./g, "").replace(",", ".")) * 100);
}

export function NewSubscription({
  cards,
  accounts,
  labels,
  categories,
}: {
  cards: readonly Opcao[];
  accounts: readonly Opcao[];
  labels: readonly Opcao[];
  categories: readonly Opcao[];
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [nome, setNome] = useState("");
  const [valor, setValor] = useState("");
  const [dia, setDia] = useState("1");
  const [origem, setOrigem] = useState(cards[0] ? `cartao:${cards[0].id}` : "");
  const [classificacao, setClassificacao] = useState("");
  const [categoria, setCategoria] = useState("");
  const [intervalo, setIntervalo] = useState<"monthly" | "yearly">("monthly");

  async function criar() {
    setEnviando(true);
    setErro(null);

    const [tipo, id] = origem.split(":");

    const resposta = await fetch("/api/v1/subscriptions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        description: nome,
        amount: centavosDe(valor),
        scheduleDay: Number(dia),
        interval: intervalo,
        ...(tipo === "cartao" ? { cardId: id } : { accountId: id }),
        ...(classificacao ? { labelId: classificacao } : {}),
        ...(categoria ? { categoryId: categoria } : {}),
      }),
    });

    setEnviando(false);

    if (!resposta.ok) {
      const dados = (await resposta.json().catch(() => ({}))) as { error?: { message?: string } };
      setErro(dados.error?.message ?? "Não foi possível cadastrar a assinatura.");
      return;
    }

    setAberto(false);
    setNome("");
    setValor("");
    router.refresh();
  }

  const anual = intervalo === "yearly";
  const centavos = valor.trim() ? centavosDe(valor) : 0;

  return (
    <>
      <Button variant="primary" icon={Plus} onClick={() => setAberto(true)}>
        Nova assinatura
      </Button>

      <Dialog
        open={aberto}
        onClose={() => setAberto(false)}
        title="Nova assinatura"
        description="O cartão escolhido é o que será debitado — e é ele que decide em qual fatura a cobrança cai."
        footer={
          <Button variant="primary" busy={enviando} onClick={criar} disabled={!origem}>
            Cadastrar
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label="Nome" htmlFor="assinatura-nome">
            <Input
              id="assinatura-nome"
              value={nome}
              onChange={(evento) => setNome(evento.target.value)}
              placeholder="Netflix, Spotify, Claude…"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Valor"
              htmlFor="assinatura-valor"
              hint={
                anual && centavos > 0
                  ? `equivale a ${(centavos / 12 / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} por mês`
                  : undefined
              }
            >
              <MoneyInput
                id="assinatura-valor"
                value={valor}
                onChange={(evento) => setValor(evento.target.value)}
              />
            </Field>

            <Field label="Cobrança" htmlFor="assinatura-intervalo">
              <Select
                id="assinatura-intervalo"
                value={intervalo}
                onChange={(evento) => setIntervalo(evento.target.value as "monthly" | "yearly")}
              >
                <option value="monthly">Mensal</option>
                <option value="yearly">Anual</option>
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Debitado em" htmlFor="assinatura-origem">
              <Select
                id="assinatura-origem"
                value={origem}
                onChange={(evento) => setOrigem(evento.target.value)}
              >
                {cards.length ? (
                  <optgroup label="Cartões">
                    {cards.map((cartao) => (
                      <option key={cartao.id} value={`cartao:${cartao.id}`}>
                        {cartao.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                <optgroup label="Contas">
                  {accounts.map((conta) => (
                    <option key={conta.id} value={`conta:${conta.id}`}>
                      {conta.name}
                    </option>
                  ))}
                </optgroup>
              </Select>
            </Field>

            <Field label="Dia da cobrança" htmlFor="assinatura-dia">
              <Input
                id="assinatura-dia"
                type="number"
                min={1}
                max={31}
                value={dia}
                onChange={(evento) => setDia(evento.target.value)}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Classificação" htmlFor="assinatura-classificacao" hint="Para o relatório">
              <Select
                id="assinatura-classificacao"
                value={classificacao}
                onChange={(evento) => setClassificacao(evento.target.value)}
              >
                <option value="">Sem classificação</option>
                {labels.map((rotulo) => (
                  <option key={rotulo.id} value={rotulo.id}>
                    {rotulo.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Categoria" htmlFor="assinatura-categoria" hint="Para o orçamento">
              <Select
                id="assinatura-categoria"
                value={categoria}
                onChange={(evento) => setCategoria(evento.target.value)}
              >
                <option value="">Sem categoria</option>
                {categories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {erro ? <Notice tone="negative">{erro}</Notice> : null}
        </div>
      </Dialog>
    </>
  );
}
