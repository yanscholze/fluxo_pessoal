"use client";

/**
 * Contas a pagar: ligar cada recorrência à notificação que a paga.
 *
 * Uma recorrência sozinha só **prevê** o gasto. A notificação do banco sozinha
 * só **conta** que ele aconteceu. Ligadas, viram um contas a pagar de verdade:
 * confirmar a captura dá baixa na previsão em vez de criar um lançamento ao
 * lado dela — o mesmo boleto contado duas vezes, uma como previsto e outra como
 * pago.
 *
 * A tela põe as duas listas frente a frente porque **ninguém decora o texto da
 * notificação do banco**. Digitar "STAR PROTECAO" de cabeça erra o acento, o
 * espaço, a abreviação; escolher da lista das capturas que de fato chegaram
 * acerta por construção.
 *
 * O segundo texto — o que significa "ignore" — é o que faz isso funcionar mês
 * após mês. O banco notifica o mesmo boleto duas vezes, na emissão e na baixa,
 * e a emissão cita o credor: sem ele, a emissão daria baixa num pagamento que
 * ainda não aconteceu.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Field, Input, Select } from "../../ui/controls.tsx";
import { dateShort, money } from "../../ui/format.ts";
import { Badge, Empty, Notice } from "../../ui/primitives.tsx";
import { Link2, Zap } from "../../ui/icons.tsx";

export type PayableRecurrence = {
  id: string;
  description: string;
  amountCents: number;
  scheduleLabel: string;
  captureMatch: string | null;
  captureIgnore: string | null;
};

export type PayableCapture = {
  id: string;
  description: string;
  sourceApp: string;
  amountCents: number;
  occurredOn: string;
  status: string;
};

/** Sugestão de casador a partir de uma notificação. */
function sugerir(descricao: string): string {
  /*
   * O credor costuma ser o começo da descrição, antes do valor e das palavras
   * de ligação. Cortar em três palavras acerta "STAR PROTECAO VEICULAR" e
   * "PG *MEU INGRESSO" sem arrastar o resto da frase — e o campo continua
   * editável, porque nenhuma heurística acerta sempre.
   */
  return descricao
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 3)
    .join(" ");
}

export function PayableLinks({
  recurrences,
  captures,
}: {
  recurrences: readonly PayableRecurrence[];
  captures: readonly PayableCapture[];
}) {
  const router = useRouter();
  const [editando, setEditando] = useState<string | null>(null);
  const [casador, setCasador] = useState("");
  const [ignorar, setIgnorar] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function abrir(regra: PayableRecurrence) {
    setEditando(regra.id);
    setCasador(regra.captureMatch ?? "");
    setIgnorar(regra.captureIgnore ?? "");
    setErro(null);
  }

  async function salvar(recurrenceId: string) {
    setEnviando(true);
    setErro(null);

    const resposta = await fetch(`/api/v1/recurrences/${recurrenceId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        captureMatch: casador.trim() || null,
        captureIgnore: ignorar.trim() || null,
      }),
    });

    setEnviando(false);

    if (!resposta.ok) {
      const corpo = (await resposta.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setErro(
        corpo?.error?.message ?? `O servidor respondeu ${resposta.status}. Tente de novo.`,
      );
      return;
    }

    setEditando(null);
    router.refresh();
  }

  if (recurrences.length === 0) {
    return (
      <Empty
        icon={Zap}
        title="Nenhuma recorrência cadastrada"
        hint="Cadastre a conta fixa em Recorrências para poder dar baixa nela pela notificação do banco."
      />
    );
  }

  return (
    <div className="space-y-3">
      {recurrences.map((regra) => {
        const aberta = editando === regra.id;
        const ligada = Boolean(regra.captureMatch?.trim());

        return (
          <div
            key={regra.id}
            className="rounded-nested border border-line bg-surface-sunken p-3 sm:p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 truncate text-body text-ink">
                  {regra.description}
                  <Badge tone={ligada ? "positive" : "neutral"}>
                    {ligada ? "baixa automática" : "sem ligação"}
                  </Badge>
                </p>
                <p className="mt-0.5 truncate text-caption text-ink-subtle">
                  {money(regra.amountCents)} · {regra.scheduleLabel}
                </p>
                {ligada ? (
                  <p className="mt-1 truncate text-caption text-ink-muted">
                    casa com “{regra.captureMatch}”
                    {regra.captureIgnore ? ` · ignora “${regra.captureIgnore}”` : ""}
                  </p>
                ) : null}
              </div>

              <Button size="sm" variant="ghost" icon={Link2} onClick={() => (aberta ? setEditando(null) : abrir(regra))}>
                {aberta ? "Fechar" : ligada ? "Trocar" : "Ligar"}
              </Button>
            </div>

            {aberta ? (
              <div className="mt-4 space-y-4 border-t border-line pt-4">
                <Field
                  label="Escolha a notificação que paga esta conta"
                  htmlFor={`escolha-${regra.id}`}
                  hint="Vem das capturas que já chegaram. Escolher preenche o texto abaixo."
                >
                  <Select
                    id={`escolha-${regra.id}`}
                    value=""
                    onChange={(evento) => {
                      const captura = captures.find((item) => item.id === evento.target.value);
                      if (captura) setCasador(sugerir(captura.description));
                    }}
                  >
                    <option value="">
                      {captures.length ? "Escolher de uma captura…" : "Nenhuma captura recebida ainda"}
                    </option>
                    {captures.map((captura) => (
                      <option key={captura.id} value={captura.id}>
                        {dateShort(captura.occurredOn as never)} · {money(captura.amountCents)} ·{" "}
                        {captura.description}
                      </option>
                    ))}
                  </Select>
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Texto que identifica a cobrança"
                    htmlFor={`casa-${regra.id}`}
                    hint="Parte do nome do credor, como aparece na notificação."
                  >
                    <Input
                      id={`casa-${regra.id}`}
                      value={casador}
                      onChange={(evento) => setCasador(evento.target.value)}
                      placeholder="STAR PROTECAO"
                    />
                  </Field>

                  <Field
                    label="Texto que significa “ignore”"
                    htmlFor={`ign-${regra.id}`}
                    hint="O aviso de boleto emitido não é pagamento."
                    className={casador.trim() ? undefined : "opacity-50"}
                  >
                    <Input
                      id={`ign-${regra.id}`}
                      value={ignorar}
                      onChange={(evento) => setIgnorar(evento.target.value)}
                      placeholder="emitido"
                      disabled={!casador.trim()}
                    />
                  </Field>
                </div>

                {casador.trim() ? (
                  <Notice tone="info">
                    Uma notificação que contiver “{casador.trim()}”
                    {ignorar.trim() ? ` e não contiver “${ignorar.trim()}”` : ""} vai dar baixa em{" "}
                    {regra.description} quando você confirmar a captura — sem criar lançamento novo.
                    {ignorar.trim()
                      ? ` As que contiverem “${ignorar.trim()}” nem entram na fila.`
                      : ""}
                  </Notice>
                ) : null}

                {erro ? <Notice tone="negative">{erro}</Notice> : null}

                <div className="flex gap-2">
                  <Button variant="primary" size="sm" busy={enviando} onClick={() => void salvar(regra.id)}>
                    Salvar ligação
                  </Button>
                  {ligada ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={enviando}
                      onClick={() => {
                        setCasador("");
                        setIgnorar("");
                      }}
                    >
                      Desligar
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
