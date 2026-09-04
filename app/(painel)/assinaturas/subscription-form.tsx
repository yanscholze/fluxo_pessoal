"use client";

/**
 * Cadastro e edição de assinatura.
 *
 * O mesmo formulário serve aos dois: os campos são idênticos, e manter duas
 * cópias garantiria que uma ganhasse a classificação e a outra não.
 *
 * O cartão é obrigatório na prática e por isso vem antes da categoria: quase
 * toda assinatura é debitada num cartão, e é o cartão que decide em qual fatura
 * a cobrança cai. Sem ele, a assinatura vira um valor que não sai de lugar
 * nenhum.
 *
 * Classificação e categoria convivem porque respondem perguntas diferentes.
 * Categoria é "que tipo de gasto é isto" para o orçamento; classificação é
 * "que tipo de assinatura é" dentro do bolo de assinaturas. Streaming e IA
 * caem na mesma categoria de orçamento e precisam se separar no relatório.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Field, Input, MoneyInput, Select } from "../../ui/controls.tsx";
import { Dialog } from "../../ui/dialog.tsx";
import { Notice } from "../../ui/primitives.tsx";

export type Opcao = { readonly id: string; readonly name: string };

export type Assinatura = {
  readonly id: string;
  readonly description: string;
  readonly amountCents: number;
  readonly scheduleDay: number;
  readonly interval: "monthly" | "yearly";
  readonly cardId: string | null;
  readonly accountId: string | null;
  readonly categoryId: string | null;
  readonly labelId: string | null;
};

export type Opcoes = {
  readonly cards: readonly Opcao[];
  readonly accounts: readonly Opcao[];
  readonly labels: readonly Opcao[];
  readonly categories: readonly Opcao[];
};

/** Converte "89,90" no inteiro de centavos que a API espera. */
export function centavosDe(texto: string): number {
  return Math.round(Number(texto.trim().replace(/\./g, "").replace(",", ".")) * 100);
}

function reais(centavos: number): string {
  return (centavos / 100).toFixed(2).replace(".", ",");
}

function origemDe(assinatura: Assinatura | null, opcoes: Opcoes): string {
  if (assinatura?.cardId) return `cartao:${assinatura.cardId}`;
  if (assinatura?.accountId) return `conta:${assinatura.accountId}`;
  if (opcoes.cards[0]) return `cartao:${opcoes.cards[0].id}`;
  return opcoes.accounts[0] ? `conta:${opcoes.accounts[0].id}` : "";
}

export function SubscriptionForm({
  open,
  onClose,
  opcoes,
  assinatura = null,
}: {
  open: boolean;
  onClose: () => void;
  opcoes: Opcoes;
  /** Preenchida, o formulário edita; nula, cadastra. */
  assinatura?: Assinatura | null;
}) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [nome, setNome] = useState(assinatura?.description ?? "");
  const [valor, setValor] = useState(assinatura ? reais(assinatura.amountCents) : "");
  const [dia, setDia] = useState(String(assinatura?.scheduleDay ?? 1));
  const [origem, setOrigem] = useState(origemDe(assinatura, opcoes));
  const [classificacao, setClassificacao] = useState(assinatura?.labelId ?? "");
  const [categoria, setCategoria] = useState(assinatura?.categoryId ?? "");
  const [intervalo, setIntervalo] = useState<"monthly" | "yearly">(assinatura?.interval ?? "monthly");

  const editando = assinatura !== null;

  async function salvar() {
    setEnviando(true);
    setErro(null);

    const [tipo, id] = origem.split(":");

    const corpo = {
      description: nome,
      amount: centavosDe(valor),
      scheduleDay: Number(dia),
      interval: intervalo,
      ...(tipo === "cartao" ? { cardId: id } : { accountId: id }),
      // String vazia é intencional na edição: significa "tirar a classificação".
      ...(editando ? { labelId: classificacao, categoryId: categoria } : {}),
      ...(!editando && classificacao ? { labelId: classificacao } : {}),
      ...(!editando && categoria ? { categoryId: categoria } : {}),
    };

    const resposta = await fetch(
      editando ? `/api/v1/recurrences/${assinatura.id}` : "/api/v1/subscriptions",
      {
        method: editando ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(corpo),
      },
    );

    setEnviando(false);

    if (!resposta.ok) {
      const dados = (await resposta.json().catch(() => ({}))) as { error?: { message?: string } };
      setErro(dados.error?.message ?? "Não foi possível salvar a assinatura.");
      return;
    }

    onClose();
    if (!editando) {
      setNome("");
      setValor("");
    }
    router.refresh();
  }

  const anual = intervalo === "yearly";
  const centavos = valor.trim() ? centavosDe(valor) : 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editando ? "Editar assinatura" : "Nova assinatura"}
      description="O cartão escolhido é o que será debitado — e é ele que decide em qual fatura a cobrança cai."
      footer={
        <Button variant="primary" busy={enviando} onClick={salvar} disabled={!origem}>
          {editando ? "Salvar" : "Cadastrar"}
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
              {opcoes.cards.length ? (
                <optgroup label="Cartões">
                  {opcoes.cards.map((cartao) => (
                    <option key={cartao.id} value={`cartao:${cartao.id}`}>
                      {cartao.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              <optgroup label="Contas">
                {opcoes.accounts.map((conta) => (
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
              {opcoes.labels.map((rotulo) => (
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
              {opcoes.categories.map((item) => (
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
  );
}
