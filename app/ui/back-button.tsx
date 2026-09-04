"use client";

/**
 * Voltar para a tela anterior.
 *
 * Usa o histórico do navegador quando há para onde voltar, e cai num destino
 * declarado quando não há — o caso de quem abriu o link direto, de um
 * favorito ou de outra aba. Um botão que não faz nada ao ser clicado é pior
 * que a ausência dele.
 *
 * A decisão de mostrar ou não é de quem usa: o botão aparece nas telas de
 * detalhe, onde existe um "de onde eu vim" óbvio, e não nas telas de topo da
 * navegação, onde voltar não quer dizer nada.
 */

import { useRouter } from "next/navigation";

import { usePreferencia } from "./browser-preference.ts";
import { ArrowLeft } from "./icons.tsx";
import { join } from "./primitives.tsx";

export function BackButton({
  fallback,
  label = "Voltar",
  hideWhenEmpty,
  compact,
  className,
}: {
  /** Para onde ir quando não há histórico dentro do aplicativo. */
  fallback: string;
  label?: string;
  /** Some quando não há para onde voltar. Para a barra do celular. */
  hideWhenEmpty?: boolean;
  /** Só o ícone, sem o rótulo. */
  compact?: boolean;
  className?: string;
}) {
  const router = useRouter();

  // O histórico é do navegador, não do React: lido direto da fonte, com
  // `false` no servidor — lá não existe histórico para consultar, e chutar
  // faria o botão aparecer e sumir na hidratação.
  const temHistorico = usePreferencia(() => window.history.length > 1, false);

  if (hideWhenEmpty && !temHistorico) return null;

  return (
    <button
      type="button"
      onClick={() => (temHistorico ? router.back() : router.push(fallback))}
      aria-label={label}
      className={join(
        "inline-flex h-8 shrink-0 select-none items-center gap-1.5 rounded-md text-body-sm text-ink-muted transition-colors hover:bg-surface-inset hover:text-ink",
        compact ? "w-8 justify-center" : "px-2",
        className,
      )}
    >
      <ArrowLeft size={15} strokeWidth={1.5} aria-hidden />
      {compact ? null : <span>{label}</span>}
    </button>
  );
}
