"use client";

/**
 * Leitura de cupom pela foto.
 *
 * A foto é reduzida no navegador antes de subir: cupom fiscal é texto de alto
 * contraste, e mandar 12 megapixels de uma câmera moderna gasta banda e cota
 * sem melhorar a leitura.
 *
 * O resultado abre o formulário de lançamento preenchido — nada é gravado sem
 * o usuário conferir.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "../../ui/primitives.tsx";
import { date, money, percent } from "../../ui/format.ts";

type Item = { description: string; quantity: number; unitCents: number; totalCents: number };

type Leitura = {
  merchant: string;
  description: string;
  occurredOn: string | null;
  totalCents: number;
  categoryName: string | null;
  paymentHint: "credit" | "debit" | "cash" | "unknown";
  items: Item[];
  confidence: number;
  warnings: string[];
  remaining: number;
};

/** Lado maior da imagem enviada. Suficiente para ler texto de cupom. */
const MAX_LADO = 1600;

export function ReceiptReader({ remaining }: { remaining: number }) {
  const router = useRouter();
  const [lendo, setLendo] = useState(false);
  const [leitura, setLeitura] = useState<Leitura | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [restantes, setRestantes] = useState(remaining);

  async function enviar(arquivo: File) {
    setLendo(true);
    setErro(null);
    setLeitura(null);

    try {
      const dataUrl = await reduzir(arquivo);
      const http = await fetch("/api/v1/receipts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });

      if (!http.ok) {
        const corpo = (await http.json().catch(() => ({}))) as { error?: { message?: string } };
        setErro(corpo.error?.message ?? "Não foi possível ler o cupom.");
        return;
      }

      const corpo = (await http.json()) as { data: Leitura };
      setLeitura(corpo.data);
      setRestantes(corpo.data.remaining);
    } catch {
      setErro("Não foi possível processar a foto.");
    } finally {
      setLendo(false);
    }
  }

  const semCota = restantes <= 0;
  const confiancaBaixa = leitura !== null && leitura.confidence < 0.6;

  return (
    <div>
      <label className="block">
        <span className="sr-only">Foto do cupom</span>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          disabled={lendo || semCota}
          onChange={(evento) => {
            const arquivo = evento.target.files?.[0];
            if (arquivo) enviar(arquivo);
          }}
          className="block w-full text-body-sm text-ink-muted file:mr-3 file:rounded-md file:border file:border-line file:bg-surface-sunken file:px-4 file:py-2.5 file:text-body-sm file:text-ink disabled:opacity-60"
        />
      </label>

      {lendo ? <p className="mt-3 text-body-sm text-ink-muted">Lendo o cupom…</p> : null}

      {erro ? (
        <p role="alert" className="mt-3 rounded-md bg-negative-wash px-3 py-2 text-body-sm text-negative">
          {erro}
        </p>
      ) : null}

      {leitura ? (
        <article className="mt-4 rounded-md border border-line bg-surface-sunken p-4">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="flex items-center gap-2 text-heading font-semibold text-ink">
                {leitura.merchant || leitura.description}
                <Badge tone={confiancaBaixa ? "caution" : "positive"}>
                  {percent(leitura.confidence * 100)} de confiança
                </Badge>
              </h3>
              <p className="mt-0.5 text-caption text-ink-subtle">
                {leitura.occurredOn ? date(leitura.occurredOn as never) : "data ilegível"}
                {leitura.categoryName ? ` · ${leitura.categoryName}` : " · sem categoria"}
              </p>
            </div>
            <p className="tabular text-figure-sm font-semibold text-ink">{money(leitura.totalCents)}</p>
          </header>

          {leitura.warnings.length ? (
            <ul className="mt-3 space-y-1 rounded-md bg-caution-wash px-3 py-2">
              {leitura.warnings.map((aviso) => (
                <li key={aviso} className="text-caption text-caution">
                  {aviso}
                </li>
              ))}
            </ul>
          ) : null}

          {leitura.items.length ? (
            <details className="mt-3">
              <summary className="cursor-pointer text-body-sm text-ink-muted">
                {leitura.items.length} {leitura.items.length === 1 ? "item lido" : "itens lidos"}
              </summary>
              <ul className="mt-2 border-t border-line">
                {leitura.items.map((item, indice) => (
                  <li
                    key={`${item.description}-${indice}`}
                    className="flex items-center justify-between gap-3 border-b border-line py-1.5 text-body-sm last:border-0"
                  >
                    <span className="truncate text-ink">
                      {item.quantity > 1 ? `${item.quantity}× ` : ""}
                      {item.description}
                    </span>
                    <span className="tabular shrink-0 text-ink-muted">{money(item.totalCents)}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                // Leva os campos para o formulário de lançamento. A gravação
                // continua sendo decisão do usuário.
                const parametros = new URLSearchParams({
                  descricao: leitura.description,
                  valor: String(leitura.totalCents / 100).replace(".", ","),
                  ...(leitura.occurredOn ? { data: leitura.occurredOn } : {}),
                  ...(leitura.categoryName ? { categoria: leitura.categoryName } : {}),
                });
                router.push(`/lancamentos?${parametros.toString()}`);
              }}
              disabled={leitura.totalCents === 0}
              className="inline-flex h-9 shrink-0 select-none items-center justify-center gap-2 rounded-md border border-transparent bg-accent px-3.5 text-body-sm font-medium text-accent-ink transition-colors hover:bg-accent-hover disabled:pointer-events-none disabled:opacity-45"
            >
              Registrar lançamento
            </button>
            <button
              type="button"
              onClick={() => setLeitura(null)}
              className="h-10 rounded-md border border-line px-4 text-body-sm text-ink-muted"
            >
              Descartar
            </button>
          </div>
        </article>
      ) : null}

      {semCota ? (
        <p className="mt-3 text-body-sm text-caution">
          Você usou todas as leituras de hoje. A cota volta amanhã.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Reduz a foto antes de subir.
 *
 * Cupom é texto de alto contraste: 1600px no lado maior já lê bem, e mandar a
 * foto crua de uma câmera moderna gastaria banda e cota sem ganhar precisão.
 */
async function reduzir(arquivo: File): Promise<string> {
  const bitmap = await createImageBitmap(arquivo);
  const escala = Math.min(1, MAX_LADO / Math.max(bitmap.width, bitmap.height));

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);

  const contexto = canvas.getContext("2d");
  if (!contexto) throw new Error("canvas indisponível");
  contexto.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return canvas.toDataURL("image/jpeg", 0.82);
}
