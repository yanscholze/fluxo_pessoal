"use client";

/**
 * Proposta e contrato do projeto.
 *
 * Guarda o arquivo, e não um link para ele. Link some: a proposta que mora no
 * Drive de alguém deixa de abrir quando a pasta é reorganizada, e é justamente
 * no dia da discussão sobre escopo que ela precisa abrir. O que se combinou por
 * escrito é a única defesa contra "mas isso estava incluído".
 *
 * Proposta e contrato aparecem separados, com rótulo próprio, porque são papéis
 * diferentes: a proposta é o que se ofereceu, o contrato é o que se assinou, e
 * quando divergem é a diferença entre os dois que importa.
 */

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Button, Field, Input, Select } from "../../../ui/controls.tsx";
import { Dialog } from "../../../ui/dialog.tsx";
import { dateShort } from "../../../ui/format.ts";
import { Download, FileText, Paperclip, Plus, Trash2 } from "../../../ui/icons.tsx";
import { Badge, Empty, Notice, Panel, PanelHeader } from "../../../ui/primitives.tsx";

/** O mesmo teto do servidor. Barrar aqui evita subir 2 MB para receber erro. */
const MAX_BYTES = 2_000_000;

const ACEITOS =
  ".pdf,.doc,.docx,.jpg,.jpeg,.png,.txt,.md,application/pdf,image/jpeg,image/png,text/plain";

const PAPEL: Record<string, { label: string; tone: "accent" | "info" | "neutral" }> = {
  proposal: { label: "Proposta", tone: "info" },
  contract: { label: "Contrato", tone: "accent" },
  other: { label: "Documento", tone: "neutral" },
};

export type DocumentoView = {
  readonly id: string;
  readonly kind: string;
  readonly name: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly notes: string | null;
  readonly uploadedAt: string;
};

function tamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Lê o arquivo como data URL, que é o formato que a rota espera. */
function lerComoDataUrl(arquivo: File): Promise<string> {
  return new Promise((resolver, rejeitar) => {
    const leitor = new FileReader();
    leitor.onload = () => resolver(String(leitor.result));
    leitor.onerror = () => rejeitar(new Error("Não foi possível ler o arquivo"));
    leitor.readAsDataURL(arquivo);
  });
}

export function DocumentsPanel({
  projectId,
  documents,
}: {
  projectId: string;
  documents: readonly DocumentoView[];
}) {
  const router = useRouter();
  const campoArquivo = useRef<HTMLInputElement>(null);

  const [aberto, setAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [papel, setPapel] = useState("contract");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [observacao, setObservacao] = useState("");

  async function enviar() {
    if (!arquivo) return;

    if (arquivo.size > MAX_BYTES) {
      setErro(`O arquivo tem ${tamanho(arquivo.size)}. O limite é ${tamanho(MAX_BYTES)}.`);
      return;
    }

    setEnviando(true);
    setErro(null);

    try {
      const dataUrl = await lerComoDataUrl(arquivo);

      const resposta = await fetch(`/api/v1/projects/${projectId}/documents`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: papel,
          name: arquivo.name,
          // O tipo vem do cabeçalho do data URL: alguns navegadores deixam
          // `arquivo.type` vazio para extensões que não conhecem, e aí o que
          // o servidor recebe não bate com o que o conteúdo declara.
          contentType: dataUrl.slice("data:".length, dataUrl.indexOf(";base64,")),
          dataUrl,
          ...(observacao.trim() ? { notes: observacao.trim() } : {}),
        }),
      });

      if (!resposta.ok) {
        const corpo = (await resposta.json().catch(() => ({}))) as { error?: { message?: string } };
        setErro(corpo.error?.message ?? "Não foi possível anexar o arquivo.");
        return;
      }

      setAberto(false);
      setArquivo(null);
      setObservacao("");
      if (campoArquivo.current) campoArquivo.current.value = "";
      router.refresh();
    } catch {
      setErro("Não foi possível ler o arquivo.");
    } finally {
      setEnviando(false);
    }
  }

  async function remover(documentId: string) {
    setErro(null);
    const resposta = await fetch(`/api/v1/documents/${documentId}`, { method: "DELETE" });

    if (!resposta.ok) {
      setErro("Não foi possível remover o documento.");
      return;
    }
    router.refresh();
  }

  return (
    <Panel>
      <PanelHeader
        title="Proposta e contrato"
        icon={FileText}
        hint={documents.length ? `${documents.length} arquivo${documents.length === 1 ? "" : "s"}` : undefined}
        action={
          <Button size="sm" icon={Plus} onClick={() => setAberto(true)}>
            Anexar
          </Button>
        }
      />

      {erro && !aberto ? <Notice tone="negative">{erro}</Notice> : null}

      {documents.length ? (
        <ul className="divide-y divide-line">
          {documents.map((documento) => {
            const papelDele = PAPEL[documento.kind] ?? PAPEL.other;

            return (
              <li key={documento.id} className="flex items-center gap-3 py-2.5">
                <Paperclip className="size-4 shrink-0 text-ink-subtle" aria-hidden />

                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-body-sm text-ink">{documento.name}</span>
                    <Badge tone={papelDele.tone}>{papelDele.label}</Badge>
                  </p>
                  <p className="truncate text-caption text-ink-subtle">
                    {tamanho(documento.sizeBytes)} · {dateShort(documento.uploadedAt.slice(0, 10) as never)}
                    {documento.notes ? ` · ${documento.notes}` : ""}
                  </p>
                </div>

                <a
                  href={`/api/v1/documents/${documento.id}`}
                  className="shrink-0 rounded-md p-1.5 text-ink-subtle transition-colors hover:bg-surface-sunken hover:text-ink"
                  aria-label={`Baixar ${documento.name}`}
                >
                  <Download className="size-4" />
                </a>

                <button
                  type="button"
                  onClick={() => remover(documento.id)}
                  aria-label={`Remover ${documento.name}`}
                  className="shrink-0 rounded-md p-1.5 text-ink-subtle transition-colors hover:bg-surface-sunken hover:text-negative"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty
          icon={FileText}
          title="Nenhum documento anexado"
          hint="Guarde aqui a proposta enviada e o contrato assinado — é o que se abre quando surge dúvida sobre o que estava combinado."
          compact
        />
      )}

      <Dialog
        open={aberto}
        onClose={() => setAberto(false)}
        title="Anexar documento"
        description="O arquivo fica guardado no Fluxo, não um link para ele."
        width="sm"
        footer={
          <Button variant="primary" busy={enviando} onClick={enviar} disabled={!arquivo}>
            Anexar
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label="O que é" htmlFor="documento-papel">
            <Select id="documento-papel" value={papel} onChange={(evento) => setPapel(evento.target.value)}>
              <option value="contract">Contrato</option>
              <option value="proposal">Proposta</option>
              <option value="other">Outro documento</option>
            </Select>
          </Field>

          <Field
            label="Arquivo"
            htmlFor="documento-arquivo"
            hint={`PDF, Word, imagem ou texto · até ${tamanho(MAX_BYTES)}`}
          >
            <input
              id="documento-arquivo"
              ref={campoArquivo}
              type="file"
              accept={ACEITOS}
              onChange={(evento) => {
                setArquivo(evento.target.files?.[0] ?? null);
                setErro(null);
              }}
              className="block w-full text-body-sm text-ink-muted file:mr-3 file:rounded-md file:border file:border-line-strong file:bg-surface file:px-3 file:py-1.5 file:text-body-sm file:text-ink hover:file:bg-surface-inset"
            />
          </Field>

          <Field label="Observação" htmlFor="documento-observacao" hint="Opcional">
            <Input
              id="documento-observacao"
              value={observacao}
              onChange={(evento) => setObservacao(evento.target.value)}
              placeholder="Assinado em 02/09, versão 2"
              maxLength={500}
            />
          </Field>

          {arquivo ? (
            <p className="text-caption text-ink-subtle">
              {arquivo.name} · {tamanho(arquivo.size)}
            </p>
          ) : null}

          {erro ? <Notice tone="negative">{erro}</Notice> : null}
        </div>
      </Dialog>
    </Panel>
  );
}
