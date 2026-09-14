"use client";

/**
 * Trocar a foto da face do cartão.
 *
 * A imagem vai como `data:` URL dentro de JSON, o mesmo caminho do cupom e do
 * documento de projeto — evita `multipart` e um segundo pedido só para o
 * arquivo.
 *
 * O redimensionamento acontece **aqui**, antes de subir. Uma foto de câmera tem
 * vários megabytes e a face do cartão ocupa poucos centímetros: subir o
 * original gastaria banda do celular para desenhar algo que ninguém enxerga em
 * detalhe. O servidor recusa acima de 400 KB, e chegar lá com o arquivo cru
 * daria um erro que o usuário não teria como resolver sozinho.
 */

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "../../ui/controls.tsx";
import { Notice } from "../../ui/primitives.tsx";

/** Largura máxima da face. Acima disso é detalhe que a tela não mostra. */
const LARGURA = 900;
/** Qualidade do JPEG. 0,82 é onde o artefato ainda não aparece num degradê. */
const QUALIDADE = 0.82;

async function reduzir(arquivo: File): Promise<string> {
  const bitmap = await createImageBitmap(arquivo);
  const escala = Math.min(1, LARGURA / bitmap.width);
  const largura = Math.round(bitmap.width * escala);
  const altura = Math.round(bitmap.height * escala);

  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;

  const contexto = canvas.getContext("2d");
  if (!contexto) throw new Error("navegador sem canvas");
  contexto.drawImage(bitmap, 0, 0, largura, altura);
  bitmap.close();

  return canvas.toDataURL("image/jpeg", QUALIDADE);
}

export function CardPhoto({ cardId, hasPhoto }: { cardId: string; hasPhoto: boolean }) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function escolher(arquivo: File | undefined) {
    if (!arquivo) return;
    setEnviando(true);
    setErro(null);

    try {
      const dataUrl = await reduzir(arquivo);
      const resposta = await fetch(`/api/v1/cards/${cardId}/image`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dataUrl }),
      });

      if (!resposta.ok) {
        const corpo = (await resposta.json().catch(() => ({}))) as { error?: { message?: string } };
        setErro(corpo.error?.message ?? "Não foi possível enviar a foto.");
        return;
      }
      router.refresh();
    } catch {
      setErro("Não foi possível ler a imagem escolhida.");
    } finally {
      setEnviando(false);
      if (entrada.current) entrada.current.value = "";
    }
  }

  async function remover() {
    setEnviando(true);
    setErro(null);
    const resposta = await fetch(`/api/v1/cards/${cardId}/image`, { method: "DELETE" });
    setEnviando(false);
    if (resposta.ok) router.refresh();
    else setErro("Não foi possível remover a foto.");
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={entrada}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(evento) => void escolher(evento.target.files?.[0])}
      />

      <Button variant="ghost" busy={enviando} onClick={() => entrada.current?.click()}>
        {hasPhoto ? "Trocar foto" : "Adicionar foto"}
      </Button>

      {hasPhoto ? (
        <Button variant="ghost" disabled={enviando} onClick={() => void remover()}>
          Remover foto
        </Button>
      ) : null}

      {erro ? <Notice tone="negative">{erro}</Notice> : null}
    </div>
  );
}
