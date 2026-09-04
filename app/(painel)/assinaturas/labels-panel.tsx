"use client";

/**
 * As classificações de assinatura.
 *
 * Existe porque quem pode criar precisa poder desfazer: uma classificação
 * criada com o nome errado ficaria para sempre no formulário de toda
 * assinatura futura.
 *
 * Arquivar, e não apagar. As assinaturas que já apontam para ela continuariam
 * apontando para um identificador inexistente, e o relatório do mês passado
 * perderia a divisão que tinha quando foi lido.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Input } from "../../ui/controls.tsx";
import { Layers, Plus, X } from "../../ui/icons.tsx";
import { Notice, Panel, PanelHeader } from "../../ui/primitives.tsx";

export type Classificacao = {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  /** Quantas assinaturas ativas usam esta classificação. */
  readonly count: number;
};

export function LabelsPanel({ labels }: { labels: readonly Classificacao[] }) {
  const router = useRouter();
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function pedir(caminho: string, init: RequestInit): Promise<boolean> {
    setEnviando(true);
    setErro(null);

    const resposta = await fetch(caminho, init);

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
    <Panel>
      <PanelHeader
        title="Classificações"
        icon={Layers}
        hint="Separam o gasto no relatório do mês"
        action={
          criando ? null : (
            <Button size="sm" variant="secondary" icon={Plus} onClick={() => setCriando(true)}>
              Nova
            </Button>
          )
        }
      />

      {criando ? (
        <div className="mb-3 flex gap-1.5">
          <Input
            value={nome}
            onChange={(evento) => setNome(evento.target.value)}
            placeholder="Jogos, Notícias, Nuvem…"
            maxLength={60}
            aria-label="Nome da nova classificação"
          />
          <Button
            size="sm"
            variant="primary"
            busy={enviando}
            disabled={!nome.trim()}
            onClick={async () => {
              const ok = await pedir("/api/v1/subscription-labels", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ name: nome }),
              });
              if (ok) {
                setNome("");
                setCriando(false);
              }
            }}
          >
            Criar
          </Button>
          <button
            type="button"
            aria-label="Cancelar"
            onClick={() => {
              setCriando(false);
              setNome("");
            }}
            className="rounded-md p-1.5 text-ink-subtle transition-colors hover:bg-surface-sunken hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : null}

      {erro ? <Notice tone="negative">{erro}</Notice> : null}

      <ul className="space-y-1.5">
        {labels.map((rotulo) => (
          <li key={rotulo.id} className="flex items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: rotulo.color }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-body-sm text-ink">{rotulo.name}</span>
            <span className="shrink-0 text-caption text-ink-subtle">
              {rotulo.count ? `${rotulo.count}×` : "não usada"}
            </span>
            <button
              type="button"
              disabled={enviando}
              aria-label={`Arquivar ${rotulo.name}`}
              onClick={() => pedir(`/api/v1/subscription-labels/${rotulo.id}`, { method: "DELETE" })}
              className="shrink-0 rounded-md p-1 text-ink-subtle transition-colors hover:bg-surface-sunken hover:text-negative disabled:opacity-50"
            >
              <X className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>

      {labels.length === 0 ? (
        <p className="text-caption text-ink-subtle">
          Nenhuma classificação. Sem elas, o relatório do mês mostra o total de assinaturas mas não
          diz quanto é streaming e quanto é ferramenta de trabalho.
        </p>
      ) : null}
    </Panel>
  );
}
