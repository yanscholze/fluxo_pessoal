"use client";

/**
 * Cadastro de recorrência.
 *
 * O papel (salário, benefício, assinatura) muda só como a regra aparece — o
 * agendamento é o mesmo para todas. Na versão anterior salário e VA eram
 * identificadores reservados no código, o que impedia ter duas fontes de renda.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { PlanningView } from "../../../server/services/planning.ts";

const PAPEIS = [
  ["standard", "Recorrente"],
  ["salary", "Salário"],
  ["benefit", "Benefício"],
  ["subscription", "Assinatura"],
] as const;

type Papel = (typeof PAPEIS)[number][0];
type Tipo = "expense" | "income";
type Agenda = "day_of_month" | "business_day_of_month";

export function NewRecurrence({ options }: { options: PlanningView["options"] }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [papel, setPapel] = useState<Papel>("standard");
  const [tipo, setTipo] = useState<Tipo>("expense");
  const [agenda, setAgenda] = useState<Agenda>("day_of_month");
  const [porDiaUtil, setPorDiaUtil] = useState(false);
  const [noCartao, setNoCartao] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [issues, setIssues] = useState<Record<string, string>>({});

  const categorias = options.categories.filter((item) =>
    tipo === "income" ? item.kind === "income" : item.kind === "expense",
  );
  const podeUsarCartao = tipo === "expense" && options.cards.length > 0;

  function trocarPapel(novo: Papel) {
    setPapel(novo);
    // Salário e benefício são entradas; assinatura é sempre saída.
    if (novo === "salary" || novo === "benefit") setTipo("income");
    if (novo === "subscription") setTipo("expense");
    if (novo === "salary") setAgenda("business_day_of_month");
    if (novo === "benefit") setPorDiaUtil(true);
  }

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);
    setIssues({});

    const dados = new FormData(evento.currentTarget);
    const corpo: Record<string, unknown> = {
      role: papel,
      kind: tipo,
      description: dados.get("description"),
      amount: dados.get("amount"),
      amountMode: porDiaUtil ? "per_business_day" : "fixed",
      scheduleMode: agenda,
      scheduleDay: Number(dados.get("scheduleDay")),
      dayAdjustment: dados.get("dayAdjustment"),
      interval: dados.get("interval"),
      categoryId: dados.get("categoryId") || null,
      startsOn: dados.get("startsOn") || null,
    };

    if (noCartao && podeUsarCartao) corpo.cardId = dados.get("cardId");
    else corpo.accountId = dados.get("accountId");

    const resposta = await fetch("/api/v1/recurrences", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo),
    });

    setEnviando(false);

    if (!resposta.ok) {
      const body = (await resposta.json().catch(() => ({}))) as {
        error?: { message?: string; issues?: { path: string; message: string }[] };
      };
      setErro(body.error?.message ?? "Não foi possível cadastrar a recorrência.");
      setIssues(Object.fromEntries((body.error?.issues ?? []).map((issue) => [issue.path, issue.message])));
      return;
    }

    setAberto(false);
    router.refresh();
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="h-10 rounded-[--radius-control] bg-accent px-4 text-[0.875rem] font-semibold text-accent-ink"
      >
        Nova recorrência
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Nova recorrência"
        className="max-h-dvh w-full max-w-lg overflow-y-auto rounded-t-[--radius-card] border border-line bg-surface p-5 shadow-[--shadow-raised] sm:rounded-[--radius-card]"
      >
        <header className="mb-4 flex items-center justify-between">
          <h2 className="text-[1.0625rem] font-semibold text-ink">Nova recorrência</h2>
          <button
            type="button"
            onClick={() => setAberto(false)}
            className="rounded-[--radius-control] px-2 py-1 text-[0.8125rem] text-ink-muted hover:bg-surface-sunken"
          >
            Fechar
          </button>
        </header>

        <form onSubmit={enviar} className="space-y-4" noValidate>
          <fieldset>
            <legend className="mb-1.5 text-[0.8125rem] font-medium text-ink">Papel</legend>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {PAPEIS.map(([valor, rotulo]) => (
                <button
                  key={valor}
                  type="button"
                  onClick={() => trocarPapel(valor)}
                  aria-pressed={papel === valor}
                  className={`h-9 rounded-[--radius-control] border text-[0.8125rem] ${
                    papel === valor
                      ? "border-accent bg-accent-wash font-medium text-accent"
                      : "border-line text-ink-muted"
                  }`}
                >
                  {rotulo}
                </button>
              ))}
            </div>
          </fieldset>

          <Campo rotulo="Descrição" erro={issues.description}>
            <input name="description" required maxLength={160} className={entrada(issues.description)} />
          </Campo>

          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Tipo">
              <select
                value={tipo}
                onChange={(evento) => setTipo(evento.target.value as Tipo)}
                className={entrada()}
              >
                <option value="expense">Saída</option>
                <option value="income">Entrada</option>
              </select>
            </Campo>
            <Campo rotulo="Frequência">
              <select name="interval" className={entrada()} defaultValue="monthly">
                <option value="monthly">Mensal</option>
                <option value="yearly">Anual</option>
              </select>
            </Campo>
          </div>

          <Campo
            rotulo={porDiaUtil ? "Valor por dia útil" : "Valor"}
            erro={issues.amount}
            dica={porDiaUtil ? "Será multiplicado pelos dias úteis de cada mês" : undefined}
          >
            <input
              name="amount"
              required
              inputMode="decimal"
              placeholder="0,00"
              className={`${entrada(issues.amount)} tabular`}
            />
          </Campo>

          <label className="flex items-start gap-2.5">
            <input
              type="checkbox"
              checked={porDiaUtil}
              onChange={(evento) => setPorDiaUtil(evento.target.checked)}
              className="mt-0.5"
            />
            <span className="text-[0.8125rem] text-ink">
              Valor por dia útil
              <span className="mt-0.5 block text-[0.75rem] text-ink-subtle">
                É como funciona o vale-alimentação: um mês com feriado credita menos.
              </span>
            </span>
          </label>

          <fieldset>
            <legend className="mb-1.5 text-[0.8125rem] font-medium text-ink">Quando cai</legend>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setAgenda("day_of_month")}
                aria-pressed={agenda === "day_of_month"}
                className={`h-9 rounded-[--radius-control] border text-[0.8125rem] ${
                  agenda === "day_of_month"
                    ? "border-accent bg-accent-wash font-medium text-accent"
                    : "border-line text-ink-muted"
                }`}
              >
                Dia do mês
              </button>
              <button
                type="button"
                onClick={() => setAgenda("business_day_of_month")}
                aria-pressed={agenda === "business_day_of_month"}
                className={`h-9 rounded-[--radius-control] border text-[0.8125rem] ${
                  agenda === "business_day_of_month"
                    ? "border-accent bg-accent-wash font-medium text-accent"
                    : "border-line text-ink-muted"
                }`}
              >
                N-ésimo dia útil
              </button>
            </div>
          </fieldset>

          <div className="grid grid-cols-2 gap-3">
            <Campo
              rotulo={agenda === "business_day_of_month" ? "Qual dia útil" : "Dia"}
              erro={issues.scheduleDay}
            >
              <input
                name="scheduleDay"
                type="number"
                min={1}
                max={agenda === "business_day_of_month" ? 23 : 31}
                defaultValue={agenda === "business_day_of_month" ? 5 : 10}
                className={`${entrada(issues.scheduleDay)} tabular`}
              />
            </Campo>
            {agenda === "day_of_month" ? (
              <Campo rotulo="Se cair em dia não útil">
                <select name="dayAdjustment" className={entrada()} defaultValue="next">
                  <option value="next">Próximo dia útil</option>
                  <option value="previous">Dia útil anterior</option>
                </select>
              </Campo>
            ) : null}
          </div>

          {podeUsarCartao ? (
            <label className="flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={noCartao}
                onChange={(evento) => setNoCartao(evento.target.checked)}
              />
              <span className="text-[0.8125rem] text-ink">Cobrança no cartão de crédito</span>
            </label>
          ) : null}

          {noCartao && podeUsarCartao ? (
            <Campo rotulo="Cartão" erro={issues.cardId}>
              <select name="cardId" required className={entrada(issues.cardId)}>
                {options.cards.map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.name}
                  </option>
                ))}
              </select>
            </Campo>
          ) : (
            <Campo rotulo="Conta" erro={issues.accountId}>
              <select name="accountId" required className={entrada(issues.accountId)}>
                {options.accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </Campo>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Categoria">
              <select name="categoryId" className={entrada()}>
                <option value="">Sem categoria</option>
                {categorias.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Começa em" dica="Deixe vazio para hoje">
              <input name="startsOn" type="date" className={entrada()} />
            </Campo>
          </div>

          {erro ? (
            <p role="alert" className="rounded-[--radius-control] bg-negative-wash px-3 py-2 text-[0.8125rem] text-negative">
              {erro}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={enviando}
            className="h-11 w-full rounded-[--radius-control] bg-accent text-[0.875rem] font-semibold text-accent-ink disabled:opacity-60"
          >
            {enviando ? "Cadastrando…" : "Cadastrar recorrência"}
          </button>
        </form>
      </div>
    </div>
  );
}

function entrada(erro?: string): string {
  return `h-10 w-full rounded-[--radius-control] border bg-surface px-3 text-[0.875rem] text-ink outline-none ${
    erro ? "border-negative" : "border-line focus:border-accent"
  }`;
}

function Campo({
  rotulo,
  erro,
  dica,
  children,
}: {
  rotulo: string;
  erro?: string;
  dica?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[0.8125rem] font-medium text-ink">{rotulo}</span>
      {children}
      {erro ? <span className="mt-1 block text-[0.75rem] text-negative">{erro}</span> : null}
      {!erro && dica ? <span className="mt-1 block text-[0.75rem] text-ink-subtle">{dica}</span> : null}
    </label>
  );
}
