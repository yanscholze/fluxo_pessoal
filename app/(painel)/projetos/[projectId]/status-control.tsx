"use client";

/**
 * A situação do projeto.
 *
 * O botão de avançar existe porque a fase muda quase sempre para a seguinte —
 * desenvolvimento vira testes, testes vira ajustes, ajustes vira entregue — e
 * abrir um menu para escolher o óbvio é atrito num gesto que se repete.
 * O seletor completo fica ao lado, para os desvios: pausar, voltar uma fase,
 * marcar que está esperando o cliente.
 *
 * **Concluir** é separado, e pede confirmação. Encerrar não é a fase seguinte
 * de entregar: entre uma coisa e outra existe o período em que ainda se conserta
 * o que o cliente encontrou, e é ele que consome as horas que ninguém orçou.
 * Um projeto encerrado sai da lista de abertos e do painel inicial — por isso a
 * decisão é explícita, e não um clique a mais no mesmo botão.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  isClosedStatus,
  nextPhase,
  PROJECT_STATUS_LABEL,
  PROJECT_STATUSES,
  type ProjectStatus,
} from "../../../../core/domain/work/status.ts";
import { Button, Select } from "../../../ui/controls.tsx";
import { Dialog } from "../../../ui/dialog.tsx";
import { Check, ChevronRight, RefreshCw } from "../../../ui/icons.tsx";
import { Notice } from "../../../ui/primitives.tsx";

export function StatusControl({
  projectId,
  status,
  hasOpenPayments,
}: {
  projectId: string;
  status: ProjectStatus;
  /** Há parcela em aberto. Concluir com dinheiro a receber merece um aviso. */
  hasOpenPayments: boolean;
}) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const proxima = nextPhase(status);
  const encerrado = isClosedStatus(status);

  async function mudar(destino: ProjectStatus): Promise<boolean> {
    setEnviando(true);
    setErro(null);

    const resposta = await fetch(`/api/v1/projects/${projectId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: destino }),
    });

    setEnviando(false);

    if (!resposta.ok) {
      const corpo = (await resposta.json().catch(() => ({}))) as { error?: { message?: string } };
      setErro(corpo.error?.message ?? "Não foi possível mudar a situação.");
      return false;
    }

    router.refresh();
    return true;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {erro ? (
        <span role="alert" className="text-caption text-negative">
          {erro}
        </span>
      ) : null}

      <Select
        aria-label="Situação do projeto"
        value={status}
        disabled={enviando}
        onChange={(evento) => mudar(evento.target.value as ProjectStatus)}
        className="w-auto"
      >
        {PROJECT_STATUSES.map((situacao) => (
          <option key={situacao} value={situacao}>
            {PROJECT_STATUS_LABEL[situacao]}
          </option>
        ))}
      </Select>

      {proxima ? (
        <Button
          variant="secondary"
          icon={ChevronRight}
          busy={enviando}
          onClick={() => mudar(proxima)}
        >
          {PROJECT_STATUS_LABEL[proxima]}
        </Button>
      ) : null}

      {encerrado ? (
        <Button
          variant="secondary"
          icon={RefreshCw}
          busy={enviando}
          onClick={() => mudar("active")}
        >
          Reabrir
        </Button>
      ) : (
        <Button variant="primary" icon={Check} onClick={() => setConfirmando(true)}>
          Concluir
        </Button>
      )}

      <Dialog
        open={confirmando}
        onClose={() => setConfirmando(false)}
        title="Concluir o projeto?"
        description="Ele sai da lista de abertos e do painel inicial, e passa a contar como histórico. As horas, as parcelas e os documentos continuam onde estão."
        width="sm"
        footer={
          <Button
            variant="primary"
            busy={enviando}
            onClick={async () => {
              if (await mudar("done")) setConfirmando(false);
            }}
          >
            Concluir
          </Button>
        }
      >
        <div className="space-y-3">
          {hasOpenPayments ? (
            <Notice tone="caution">
              Ainda há parcela em aberto neste projeto. Concluir não cancela a cobrança — ela
              continua no fluxo futuro — mas o projeto some da lista de abertos.
            </Notice>
          ) : null}

          <Notice tone="info">
            Se o trabalho acabou mas o cliente ainda vai responder, <strong>Entregue</strong> é a
            situação certa: o projeto continua visível e o tempo de suporte ainda pode ser lançado.
          </Notice>
        </div>
      </Dialog>
    </div>
  );
}
