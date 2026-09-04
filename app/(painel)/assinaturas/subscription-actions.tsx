"use client";

/**
 * Editar, pausar e cancelar uma assinatura.
 *
 * Pausar e cancelar respondem coisas diferentes, e por isso não são o mesmo
 * botão. Pausada, a assinatura sai do custo do mês mas continua na tela: é o
 * serviço que se suspendeu e talvez volte, e apagá-lo perderia a classificação
 * e o histórico de quanto custava. Cancelada, some da lista — mas o que já foi
 * cobrado fica no razão, porque saiu da conta de verdade.
 *
 * Cancelar pede confirmação com o nome à vista: é a única ação daqui que não
 * dá para desfazer.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "../../ui/controls.tsx";
import { Dialog } from "../../ui/dialog.tsx";
import { Pause, Pencil, Play, Trash2 } from "../../ui/icons.tsx";
import { Notice } from "../../ui/primitives.tsx";
import { type Assinatura, type Opcoes, SubscriptionForm } from "./subscription-form.tsx";

export function SubscriptionActions({
  assinatura,
  isActive,
  opcoes,
}: {
  assinatura: Assinatura;
  isActive: boolean;
  opcoes: Opcoes;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function pedir(init: RequestInit) {
    setEnviando(true);
    setErro(null);

    const resposta = await fetch(`/api/v1/recurrences/${assinatura.id}`, init);

    setEnviando(false);

    if (!resposta.ok) {
      const corpo = (await resposta.json().catch(() => ({}))) as { error?: { message?: string } };
      setErro(corpo.error?.message ?? "Não foi possível concluir.");
      return false;
    }

    router.refresh();
    return true;
  }

  return (
    <span className="flex items-center justify-end gap-1">
      {erro ? (
        <span role="alert" className="mr-1 text-caption text-negative">
          {erro}
        </span>
      ) : null}

      <button
        type="button"
        aria-label={`Editar ${assinatura.description}`}
        onClick={() => setEditando(true)}
        className="rounded-md p-1.5 text-ink-subtle transition-colors hover:bg-surface-sunken hover:text-ink"
      >
        <Pencil className="size-4" />
      </button>

      <button
        type="button"
        disabled={enviando}
        aria-label={`${isActive ? "Pausar" : "Retomar"} ${assinatura.description}`}
        onClick={() =>
          pedir({
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ isActive: isActive ? "false" : "true" }),
          })
        }
        className="rounded-md p-1.5 text-ink-subtle transition-colors hover:bg-surface-sunken hover:text-ink disabled:opacity-50"
      >
        {isActive ? <Pause className="size-4" /> : <Play className="size-4" />}
      </button>

      <button
        type="button"
        aria-label={`Cancelar ${assinatura.description}`}
        onClick={() => setConfirmando(true)}
        className="rounded-md p-1.5 text-ink-subtle transition-colors hover:bg-surface-sunken hover:text-negative"
      >
        <Trash2 className="size-4" />
      </button>

      <SubscriptionForm
        open={editando}
        onClose={() => setEditando(false)}
        opcoes={opcoes}
        assinatura={assinatura}
      />

      <Dialog
        open={confirmando}
        onClose={() => setConfirmando(false)}
        title={`Cancelar ${assinatura.description}?`}
        description="A assinatura sai da lista e do custo mensal. As cobranças já lançadas continuam no extrato, porque saíram da conta de verdade."
        width="sm"
        footer={
          <Button
            variant="danger"
            busy={enviando}
            onClick={async () => {
              if (await pedir({ method: "DELETE" })) setConfirmando(false);
            }}
          >
            Cancelar assinatura
          </Button>
        }
      >
        <Notice tone="caution">
          Se for uma pausa temporária, use o botão de pausar: ele tira do custo do mês e preserva o
          valor, a classificação e o cartão para quando voltar.
        </Notice>
      </Dialog>
    </span>
  );
}
