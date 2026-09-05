"use client";

/**
 * Cadastro de cartão.
 *
 * O formulário mostra a face do cartão sendo montada em tempo real. Não é
 * enfeite: cor e apelido são justamente o que a pessoa vai usar para
 * reconhecer o cartão depois, na lista e no carrossel — e escolher uma cor sem
 * ver o resultado é escolher no escuro.
 *
 * Recompensa fica atrás de um interruptor porque a maioria dos cartões não tem,
 * e quatro campos de pontuação sempre visíveis fariam um cadastro de dois
 * minutos parecer de dez.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Field, Input, MoneyInput, Select } from "../../ui/controls.tsx";
import { CreditCard, Plus, X } from "../../ui/icons.tsx";
import { Notice, Panel } from "../../ui/primitives.tsx";
import { CardFace } from "./card-face.tsx";

/**
 * Paleta de partida. O usuário ainda pode digitar qualquer cor no seletor.
 *
 * Todas passam em 4,5:1 contra a tinta que a face escolhe para elas — o roxo
 * de antes ficava em 4,35:1 com branco e 4,22:1 com preto, ou seja, reprovava
 * nas duas e não havia tinta que resolvesse. Para a cor digitada à mão, a face
 * ainda escolhe a melhor das duas; aqui o padrão já nasce legível.
 */
const CORES = [
  ["#6d4bd8", "Roxo"],
  ["#0d9668", "Verde"],
  ["#2563eb", "Azul"],
  ["#dc2626", "Vermelho"],
  ["#f59e0b", "Âmbar"],
  ["#0891b2", "Ciano"],
  ["#db2777", "Rosa"],
  ["#1f2937", "Grafite"],
] as const;

const BANDEIRAS = ["Visa", "Mastercard", "Elo", "American Express", "Hipercard"] as const;

type Recompensa = "none" | "points" | "cashback" | "both";

/**
 * O cartão que está sendo corrigido, quando é correção.
 *
 * Um formulário só para os dois modos porque os campos são os mesmos, e porque
 * o dia de fechamento é o campo mais fácil de errar e o mais caro de ter
 * errado: é ele que decide em qual fatura cada compra cai.
 */
export type CardToEdit = {
  readonly id: string;
  readonly name: string;
  readonly kind: "credit" | "debit";
  readonly brand: string;
  readonly tier: string;
  readonly last4: string;
  readonly color: string;
  readonly paymentAccountId: string;
  readonly limitCents: number;
  readonly closingDay: number;
  readonly dueDay: number;
  readonly dueAdjustment: "previous" | "next";
  readonly rewardMode: Recompensa;
  readonly pointsPerDollarMilli: number;
  readonly cashbackBasisPoints: number;
  readonly pointsGoal: number;
};

function reais(centavos: number): string {
  return centavos ? (centavos / 100).toFixed(2).replace(".", ",") : "";
}

export function NewCard({
  accounts,
  card,
  open,
  onClose,
}: {
  accounts: readonly { id: string; name: string }[];
  /** Preenchido, o formulário corrige; ausente, cadastra. */
  card?: CardToEdit;
  /** Controlado de fora quando o gatilho vive noutro componente. */
  open?: boolean;
  onClose?: () => void;
}) {
  const router = useRouter();
  const controlado = open !== undefined;
  const [abertoLocal, setAbertoLocal] = useState(false);
  const aberto = controlado ? open : abertoLocal;
  const fechar = () => (controlado ? onClose?.() : setAbertoLocal(false));

  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [issues, setIssues] = useState<Record<string, string>>({});

  // O que a face precisa para se desenhar enquanto o formulário é preenchido.
  const [nome, setNome] = useState(card?.name ?? "");
  const [tipo, setTipo] = useState<"credit" | "debit">(card?.kind ?? "credit");
  const [cor, setCor] = useState<string>(card?.color || CORES[0][0]);
  const [ultimos, setUltimos] = useState(card?.last4 ?? "");
  const [bandeira, setBandeira] = useState<string>(card?.brand || "Mastercard");
  const [recompensa, setRecompensa] = useState<Recompensa>(card?.rewardMode ?? "none");

  const editando = card !== undefined;

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);
    setIssues({});

    const dados = new FormData(evento.currentTarget);
    const resposta = await fetch(editando ? `/api/v1/cards/${card.id}` : "/api/v1/cards", {
      method: editando ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: dados.get("name"),
        ...(editando ? {} : { kind: tipo }),
        paymentAccountId: dados.get("paymentAccountId"),
        closingDay: dados.get("closingDay"),
        dueDay: dados.get("dueDay"),
        dueAdjustment: dados.get("dueAdjustment"),
        limit: dados.get("limit") || null,
        brand: dados.get("brand") || null,
        tier: dados.get("tier") || null,
        last4: dados.get("last4") || null,
        color: cor,
        ...(editando && dados.get("isPrimary") !== "on" ? {} : { isPrimary: dados.get("isPrimary") === "on" }),
        rewardMode: recompensa,
        ...(recompensa === "points" || recompensa === "both"
          ? {
              pointsPerDollarMilli: Math.round(Number(dados.get("pontosPorDolar") ?? 0) * 1000),
              pointsGoal: Number(dados.get("metaDePontos") ?? 0) || null,
            }
          : {}),
        ...(recompensa === "cashback" || recompensa === "both"
          ? { cashbackBasisPoints: Math.round(Number(dados.get("cashback") ?? 0) * 100) }
          : {}),
      }),
    });

    setEnviando(false);

    if (!resposta.ok) {
      const corpo = (await resposta.json().catch(() => ({}))) as {
        error?: { message?: string; issues?: { path: string; message: string }[] };
      };
      setErro(corpo.error?.message ?? `Não foi possível ${editando ? "salvar" : "cadastrar"} o cartão.`);
      setIssues(Object.fromEntries((corpo.error?.issues ?? []).map((issue) => [issue.path, issue.message])));
      return;
    }

    fechar();
    if (!editando) {
      setNome("");
      setUltimos("");
    }
    router.refresh();
  }

  const temPontos = recompensa === "points" || recompensa === "both";
  const temCashback = recompensa === "cashback" || recompensa === "both";

  // Controlado de fora, o gatilho é de quem chama: aqui só o formulário.
  if (!aberto) {
    return controlado ? null : (
      <Button variant="primary" icon={Plus} onClick={() => setAbertoLocal(true)}>
        Novo cartão
      </Button>
    );
  }

  // Sobreposição, e não expansão no lugar: o gatilho vive no cabeçalho da
  // página, e um formulário de dez campos crescendo dentro do slot de ações
  // ficaria espremido contra o título.
  return (
    <>
      {controlado ? null : (
        <Button variant="primary" icon={Plus} onClick={() => setAbertoLocal(true)}>
          Novo cartão
        </Button>
      )}

      <div className="fixed inset-0 z-50 overflow-y-auto bg-canvas/80 p-4 backdrop-blur-sm sm:p-8">
        <button
          type="button"
          aria-label="Fechar"
          onClick={fechar}
          className="fixed inset-0 -z-10 cursor-default"
        />

        <Panel
          variant="raised"
          className="mx-auto w-full max-w-[56rem] animate-rise"
          role="dialog"
          aria-modal="true"
          aria-label={editando ? "Editar cartão" : "Novo cartão"}
        >
      <header className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-heading text-ink">
            <CreditCard size={15} strokeWidth={1.5} className="text-ink-subtle" aria-hidden />
            {editando ? "Editar cartão" : "Novo cartão"}
          </h2>
          <p className="mt-0.5 text-caption text-ink-muted">
            O dia de fechamento é o que decide em qual fatura cada compra cai.
          </p>
        </div>
        <Button variant="ghost" icon={X} onClick={fechar}>
          Cancelar
        </Button>
      </header>

      <div className="grid gap-6 lg:grid-cols-[19rem_1fr] lg:items-start">
        {/* A face acompanha o preenchimento: é assim que se escolhe uma cor. */}
        <div className="mx-auto lg:mx-0">
          <CardFace
            data={{
              name: nome.trim() || "Sem apelido",
              brand: bandeira,
              last4: ultimos || null,
              color: cor,
              kind: tipo,
              isPrimary: false,
              closingOn: null,
              dueOn: null,
              invoice: null,
              overdueCount: 0,
            }}
          />
        </div>

        <form onSubmit={enviar} className="min-w-0 space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Apelido" htmlFor="card-name" error={issues.name}>
              <Input
                id="card-name"
                name="name"
                value={nome}
                onChange={(evento) => setNome(evento.target.value)}
                placeholder="Nubank Roxinho"
                maxLength={60}
                required
              />
            </Field>

            <Field
              label="Tipo"
              htmlFor="card-kind"
              hint={editando ? "não muda depois de cadastrado" : undefined}
            >
              <Select
                id="card-kind"
                value={tipo}
                // Crédito tem fatura; débito sai do saldo na hora. Trocar depois
                // de haver lançamentos reinterpretaria o passado inteiro.
                disabled={editando}
                onChange={(evento) => setTipo(evento.target.value as "credit" | "debit")}
              >
                <option value="credit">Crédito</option>
                <option value="debit">Débito</option>
              </Select>
            </Field>
          </div>

          <Field
            label="Paga por"
            htmlFor="card-account"
            hint="A conta de onde a fatura é debitada"
            error={issues.paymentAccountId}
          >
            <Select id="card-account" name="paymentAccountId" required defaultValue={card?.paymentAccountId ?? accounts[0]?.id}>
              {accounts.map((conta) => (
                <option key={conta.id} value={conta.id}>
                  {conta.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Fecha dia" htmlFor="card-closing" error={issues.closingDay}>
              <Input id="card-closing" name="closingDay" type="number" min={1} max={31} defaultValue={card?.closingDay ?? 13} required />
            </Field>

            <Field label="Vence dia" htmlFor="card-due" error={issues.dueDay}>
              <Input id="card-due" name="dueDay" type="number" min={1} max={31} defaultValue={card?.dueDay ?? 20} required />
            </Field>

            <Field label="Se cair em feriado" htmlFor="card-adjust">
              <Select id="card-adjust" name="dueAdjustment" defaultValue={card?.dueAdjustment ?? "next"}>
                <option value="next">Vence no próximo dia útil</option>
                <option value="previous">Vence no dia útil anterior</option>
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Limite" htmlFor="card-limit" hint="Deixe vazio se não souber">
              <MoneyInput id="card-limit" name="limit" placeholder="0,00" defaultValue={reais(card?.limitCents ?? 0)} />
            </Field>

            <Field label="Bandeira" htmlFor="card-brand">
              <Select
                id="card-brand"
                name="brand"
                value={bandeira}
                onChange={(evento) => setBandeira(evento.target.value)}
              >
                {BANDEIRAS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Final" htmlFor="card-last4" hint="4 dígitos">
              <Input
                id="card-last4"
                name="last4"
                value={ultimos}
                onChange={(evento) => setUltimos(evento.target.value.replace(/\D/g, "").slice(0, 4))}
                inputMode="numeric"
                maxLength={4}
                placeholder="4417"
                className="tabular"
              />
            </Field>
          </div>

          <Field label="Cor" hint="É por ela que você vai reconhecer o cartão na lista">
            <div className="flex flex-wrap items-center gap-2">
              {CORES.map(([valor, rotulo]) => (
                <button
                  key={valor}
                  type="button"
                  onClick={() => setCor(valor)}
                  aria-label={rotulo}
                  aria-pressed={cor === valor}
                  title={rotulo}
                  className={`size-7 rounded-md transition-transform ${
                    cor === valor ? "scale-110 ring-2 ring-accent ring-offset-2 ring-offset-surface" : "hover:scale-105"
                  }`}
                  style={{ backgroundColor: valor }}
                />
              ))}
              <label className="ml-1 flex cursor-pointer items-center gap-1.5 text-caption text-ink-muted">
                <input
                  type="color"
                  value={cor}
                  onChange={(evento) => setCor(evento.target.value)}
                  className="size-7 cursor-pointer rounded-md border border-line-strong bg-surface-sunken"
                />
                outra
              </label>
            </div>
          </Field>

          <Field label="Recompensa" htmlFor="card-reward" hint="Só preencha se o cartão realmente pontua">
            <Select
              id="card-reward"
              value={recompensa}
              onChange={(evento) => setRecompensa(evento.target.value as Recompensa)}
            >
              <option value="none">Nenhuma</option>
              <option value="points">Pontos</option>
              <option value="cashback">Cashback</option>
              <option value="both">Pontos e cashback</option>
            </Select>
          </Field>

          {temPontos || temCashback ? (
            <div className="grid gap-4 rounded-md border border-line bg-surface-sunken p-4 sm:grid-cols-3">
              {temPontos ? (
                <>
                  <Field label="Pontos por dólar" htmlFor="card-points">
                    <Input
                      id="card-points"
                      name="pontosPorDolar"
                      type="number"
                      step="0.1"
                      min={0}
                      defaultValue={card?.pointsPerDollarMilli ? card.pointsPerDollarMilli / 1000 : ""}
                      placeholder="1,5"
                      className="tabular"
                    />
                  </Field>
                  <Field label="Meta de pontos" htmlFor="card-goal">
                    <Input
                      id="card-goal"
                      name="metaDePontos"
                      type="number"
                      min={0}
                      defaultValue={card?.pointsGoal || ""}
                      placeholder="40000"
                      className="tabular"
                    />
                  </Field>
                </>
              ) : null}

              {temCashback ? (
                <Field label="Cashback (%)" htmlFor="card-cashback">
                  <Input
                    id="card-cashback"
                    name="cashback"
                    type="number"
                    step="0.01"
                    min={0}
                    defaultValue={card?.cashbackBasisPoints ? card.cashbackBasisPoints / 100 : ""}
                    placeholder="1,00"
                    className="tabular"
                  />
                </Field>
              ) : null}
            </div>
          ) : null}

          <label className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              name="isPrimary"
              className="size-4 shrink-0 cursor-pointer rounded-xs border-line-strong bg-surface-sunken accent-accent"
            />
            <span className="text-body-sm text-ink">
              Cartão principal
              <span className="ml-1.5 text-caption text-ink-subtle">
                usado como padrão em novos lançamentos
              </span>
            </span>
          </label>

          {erro ? <Notice tone="negative">{erro}</Notice> : null}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="submit" variant="primary" busy={enviando}>
              {editando ? "Salvar cartão" : "Cadastrar cartão"}
            </Button>
            <Button variant="ghost" onClick={fechar}>
              Cancelar
            </Button>
          </div>
          </form>
        </div>
        </Panel>
      </div>
    </>
  );
}
