"use client";

/**
 * Propostas do projeto.
 *
 * A proposta é o documento que vira contrato. Por isso aceitar não é só mudar
 * um rótulo: quando o projeto ainda não tem valor contratado, aceitar **o
 * preenche** com o valor da proposta. Pedir para o usuário digitar o mesmo
 * número duas vezes é pedir para os dois divergirem.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Field, Input, MoneyInput, Textarea } from "../../../ui/controls.tsx";
import { Dialog } from "../../../ui/dialog.tsx";
import { dateShort, money } from "../../../ui/format.ts";
import { FileText, Plus } from "../../../ui/icons.tsx";
import { Badge, Empty, Notice, Panel, PanelHeader, type Tone } from "../../../ui/primitives.tsx";
import type { LocalDate } from "../../../../core/time/local-date.ts";

const SITUACAO: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "rascunho", tone: "neutral" },
  sent: { label: "enviada", tone: "info" },
  accepted: { label: "aceita", tone: "positive" },
  rejected: { label: "recusada", tone: "negative" },
  expired: { label: "expirada", tone: "caution" },
};

export type ProposalView = {
  readonly id: string;
  readonly title: string;
  readonly amountCents: number;
  readonly status: string;
  readonly sentOn: string | null;
  readonly decidedOn: string | null;
  readonly deadlineDays: number | null;
};

function centavosDe(texto: string): number {
  return Math.round(Number(texto.trim().replace(/\./g, "").replace(",", ".")) * 100);
}

export function ProposalsPanel({
  projectId,
  proposals,
}: {
  projectId: string;
  proposals: readonly ProposalView[];
}) {
  const router = useRouter();
  const [aberta, setAberta] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [titulo, setTitulo] = useState("");
  const [valor, setValor] = useState("");
  const [prazoDias, setPrazoDias] = useState("");
  const [escopo, setEscopo] = useState("");

  async function decidir(proposalId: string, status: string) {
    const resposta = await fetch(`/api/v1/proposals/${proposalId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (resposta.ok) router.refresh();
  }

  async function criar() {
    setEnviando(true);
    setErro(null);

    const resposta = await fetch(`/api/v1/projects/${projectId}/proposals`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: titulo,
        amount: centavosDe(valor),
        ...(prazoDias ? { deadlineDays: Number(prazoDias) } : {}),
        ...(escopo ? { scope: escopo } : {}),
      }),
    });

    setEnviando(false);

    if (!resposta.ok) {
      const dados = (await resposta.json().catch(() => ({}))) as { error?: { message?: string } };
      setErro(dados.error?.message ?? "Não foi possível registrar a proposta.");
      return;
    }

    setAberta(false);
    setTitulo("");
    setValor("");
    setPrazoDias("");
    setEscopo("");
    router.refresh();
  }

  return (
    <Panel>
      <PanelHeader
        title="Propostas"
        hint={proposals.length ? `${proposals.length} registrada${proposals.length > 1 ? "s" : ""}` : undefined}
        action={
          <Button size="sm" icon={Plus} onClick={() => setAberta(true)}>
            Nova
          </Button>
        }
      />

      {proposals.length ? (
        <ul className="mt-1 divide-y divide-line">
          {proposals.map((proposta) => {
            const situacao = SITUACAO[proposta.status] ?? { label: proposta.status, tone: "neutral" as Tone };
            const pendente = proposta.status === "draft" || proposta.status === "sent";

            return (
              <li key={proposta.id} className="py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-body text-ink">{proposta.title}</span>
                    <Badge tone={situacao.tone}>{situacao.label}</Badge>
                  </span>
                  <span className="tabular shrink-0 text-body font-medium text-ink">
                    {money(proposta.amountCents)}
                  </span>
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-ink-subtle">
                  {proposta.sentOn ? <span>enviada {dateShort(proposta.sentOn as LocalDate)}</span> : null}
                  {proposta.decidedOn ? (
                    <span>decidida {dateShort(proposta.decidedOn as LocalDate)}</span>
                  ) : null}
                  {proposta.deadlineDays ? <span>{proposta.deadlineDays} dias de prazo</span> : null}
                </div>

                {pendente ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {proposta.status === "draft" ? (
                      <Button size="sm" onClick={() => decidir(proposta.id, "sent")}>
                        Marcar como enviada
                      </Button>
                    ) : null}
                    <Button size="sm" variant="primary" onClick={() => decidir(proposta.id, "accepted")}>
                      Aceita
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => decidir(proposta.id, "rejected")}>
                      Recusada
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty
          icon={FileText}
          title="Nenhuma proposta"
          hint="Registre a proposta para acompanhar o que foi oferecido e o que virou contrato."
        />
      )}

      <Dialog
        open={aberta}
        onClose={() => setAberta(false)}
        title="Nova proposta"
        description="Ao ser aceita, o valor preenche o contrato do projeto se ele ainda estiver zerado."
        width="sm"
        footer={
          <Button variant="primary" busy={enviando} onClick={criar}>
            Registrar
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label="Título" htmlFor="proposta-titulo">
            <Input
              id="proposta-titulo"
              value={titulo}
              onChange={(evento) => setTitulo(evento.target.value)}
              placeholder="Site institucional — escopo fechado"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Valor" htmlFor="proposta-valor">
              <MoneyInput
                id="proposta-valor"
                value={valor}
                onChange={(evento) => setValor(evento.target.value)}
              />
            </Field>

            <Field label="Prazo (dias)" htmlFor="proposta-prazo" hint="Opcional">
              <Input
                id="proposta-prazo"
                type="number"
                min={1}
                value={prazoDias}
                onChange={(evento) => setPrazoDias(evento.target.value)}
              />
            </Field>
          </div>

          <Field label="Escopo" htmlFor="proposta-escopo" hint="Opcional">
            <Textarea
              id="proposta-escopo"
              rows={4}
              value={escopo}
              onChange={(evento) => setEscopo(evento.target.value)}
              placeholder="O que está incluído e o que não está."
            />
          </Field>

          {erro ? <Notice tone="negative">{erro}</Notice> : null}
        </div>
      </Dialog>
    </Panel>
  );
}
