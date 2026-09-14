"use client";

/**
 * Dar baixa numa parcela.
 *
 * Há dois jeitos de a parcela ser paga, e confundi-los custa caro:
 *
 * - **O dinheiro entra agora.** A baixa cria a receita no razão, e por isso
 *   precisa saber em que conta caiu. Sem essa pergunta o valor entraria em
 *   lugar nenhum e o saldo continuaria mentindo.
 * - **O dinheiro já tinha entrado.** É o caso de quem importou o extrato ou
 *   lançou à mão antes de cadastrar o projeto. Aqui a receita já existe, e
 *   criar outra dobraria a renda do mês, o patrimônio e o livre para gastar.
 *
 * Por isso a escolha aparece no topo do diálogo, e não escondida: é a decisão
 * que define se o número vai fechar com o banco.
 */

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button, Field, Input, Select } from "../../../ui/controls.tsx";
import { Dialog } from "../../../ui/dialog.tsx";
import { dateShort, money } from "../../../ui/format.ts";
import { Notice } from "../../../ui/primitives.tsx";

type Conta = { id: string; name: string };

type Receita = {
  id: string;
  description: string;
  occurredOn: string;
  amountCents: number;
};

type Modo = "criar" | "vincular";

export function PaymentActions({
  paymentId,
  description,
}: {
  paymentId: string;
  description: string;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [modo, setModo] = useState<Modo>("criar");

  const [contas, setContas] = useState<Conta[]>([]);
  const [conta, setConta] = useState("");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));

  // `null` é "ainda não busquei", e é diferente de "busquei e não há nenhuma".
  // Sem essa distinção a lista vazia pediria a busca de novo a cada render.
  const [receitas, setReceitas] = useState<Receita[] | null>(null);
  const [receita, setReceita] = useState("");

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

  // As receitas disponíveis só são buscadas ao escolher vincular. Quem vai
  // criar o lançamento nunca precisa dessa lista, e ela é a mais cara das duas.
  useEffect(() => {
    if (!aberto || modo !== "vincular" || receitas !== null) return;

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
  }, [aberto, modo, receitas]);

  async function confirmar() {
    setEnviando(true);
    setErro(null);

    const resposta =
      modo === "criar"
        ? await fetch(`/api/v1/payments/${paymentId}/receive`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ accountId: conta, receivedOn: data }),
          })
        : await fetch(`/api/v1/payments/${paymentId}/link`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ transactionId: receita }),
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

  const pronto = modo === "criar" ? Boolean(conta) : Boolean(receita);

  return (
    <>
      <Button size="sm" onClick={() => setAberto(true)}>
        Dar baixa
      </Button>

      <Dialog
        open={aberto}
        onClose={() => setAberto(false)}
        title="Registrar recebimento"
        description={`Como "${description}" foi pago.`}
        width="sm"
        footer={
          <Button variant="primary" busy={enviando} onClick={confirmar} disabled={!pronto}>
            {modo === "criar" ? "Confirmar recebimento" : "Vincular lançamento"}
          </Button>
        }
      >
        <div className="space-y-4">
          <div
            role="radiogroup"
            aria-label="Como a parcela foi paga"
            className="grid gap-2 sm:grid-cols-2"
          >
            <OpcaoDeModo
              ativo={modo === "criar"}
              titulo="O dinheiro entra agora"
              detalhe="Cria a receita no extrato"
              onClick={() => setModo("criar")}
            />
            <OpcaoDeModo
              ativo={modo === "vincular"}
              titulo="Já tinha entrado"
              detalhe="Aponta para um lançamento existente"
              onClick={() => setModo("vincular")}
            />
          </div>

          {modo === "criar" ? (
            <>
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
            </>
          ) : (
            <Field
              label="Receita que pagou esta parcela"
              htmlFor={`receita-${paymentId}`}
              hint="Só aparecem receitas que ainda não quitaram outra parcela."
            >
              <Select
                id={`receita-${paymentId}`}
                value={receita}
                onChange={(evento) => setReceita(evento.target.value)}
              >
                {receitas === null ? <option value="">Carregando…</option> : null}
                {receitas?.length === 0 ? <option value="">Nenhuma receita disponível</option> : null}
                {(receitas ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {dateShort(item.occurredOn as never)} · {money(item.amountCents)} ·{" "}
                    {item.description}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {erro ? <Notice tone="negative">{erro}</Notice> : null}
        </div>
      </Dialog>
    </>
  );
}

function OpcaoDeModo({
  ativo,
  titulo,
  detalhe,
  onClick,
}: {
  ativo: boolean;
  titulo: string;
  detalhe: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={ativo}
      onClick={onClick}
      className={[
        "rounded-nested border p-3 text-left transition-colors",
        ativo
          ? "border-accent bg-accent-wash text-ink"
          : "border-line bg-surface-sunken text-ink-muted hover:border-line-strong",
      ].join(" ")}
    >
      <span className="block text-body-sm font-medium text-ink">{titulo}</span>
      <span className="mt-0.5 block text-caption text-ink-subtle">{detalhe}</span>
    </button>
  );
}
