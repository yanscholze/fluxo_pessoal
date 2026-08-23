/**
 * Primitivas visuais.
 *
 * Peças pequenas e sem estado, compostas pelas telas. Nenhuma delas conhece
 * domínio financeiro — recebem texto e número já prontos. É o que permite
 * mudar a interface inteira sem tocar em uma linha de regra.
 */

import type { ReactNode } from "react";

function join(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export type Tone = "neutral" | "positive" | "negative" | "caution" | "accent";

const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-ink",
  positive: "text-positive",
  negative: "text-negative",
  caution: "text-caution",
  accent: "text-accent",
};

const TONE_WASH: Record<Tone, string> = {
  neutral: "bg-surface-sunken text-ink-muted",
  positive: "bg-positive-wash text-positive",
  negative: "bg-negative-wash text-negative",
  caution: "bg-caution-wash text-caution",
  accent: "bg-accent-wash text-accent",
};

export function Card({
  children,
  className,
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "article" | "div";
}) {
  return (
    <Tag
      className={join(
        "rounded-[--radius-card] border border-line bg-surface p-5 shadow-[--shadow-card]",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/** Rótulo pequeno em versalete. Nomeia o número sem competir com ele. */
export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={join("text-label uppercase text-ink-subtle", className)}>{children}</span>
  );
}

/** O número que responde a pergunta da tela. */
export function Figure({
  value,
  tone = "neutral",
  size = "lg",
  className,
}: {
  value: string;
  tone?: Tone;
  size?: "lg" | "sm";
  className?: string;
}) {
  return (
    <p
      className={join(
        "tabular",
        size === "lg" ? "text-figure" : "text-figure-sm",
        TONE_TEXT[tone],
        className,
      )}
    >
      {value}
    </p>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span
      className={join(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold",
        TONE_WASH[tone],
      )}
    >
      {children}
    </span>
  );
}

export function SectionHeading({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-4 flex items-baseline justify-between gap-4">
      <div>
        <h2 className="text-[0.9375rem] font-semibold text-ink">{title}</h2>
        {hint ? <p className="mt-0.5 text-[0.8125rem] text-ink-muted">{hint}</p> : null}
      </div>
      {action}
    </header>
  );
}

/**
 * Barra de proporção.
 *
 * `value` e `total` em centavos; a barra nunca passa de 100% para que uma
 * fatura estourada não desenhe fora do card.
 */
export function Meter({
  value,
  total,
  tone = "accent",
  label,
}: {
  value: number;
  total: number;
  tone?: Tone;
  label?: string;
}) {
  const ratio = total > 0 ? Math.min(100, Math.max(0, (value / total) * 100)) : 0;
  const fill: Record<Tone, string> = {
    neutral: "bg-ink-subtle",
    positive: "bg-positive",
    negative: "bg-negative",
    caution: "bg-caution",
    accent: "bg-accent",
  };

  return (
    <div
      role="meter"
      aria-valuenow={Math.round(ratio)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken"
    >
      <div className={join("h-full rounded-full transition-[width]", fill[tone])} style={{ width: `${ratio}%` }} />
    </div>
  );
}

/** Linha de lista: rótulo à esquerda, valor à direita. */
export function Row({
  title,
  subtitle,
  value,
  valueTone = "neutral",
  meta,
}: {
  title: string;
  subtitle?: string;
  value: string;
  valueTone?: Tone;
  meta?: string;
}) {
  return (
    <li className="flex items-center justify-between gap-4 border-b border-line py-2.5 last:border-0">
      <div className="min-w-0">
        <p className="truncate text-[0.875rem] text-ink">{title}</p>
        {subtitle ? <p className="truncate text-[0.75rem] text-ink-subtle">{subtitle}</p> : null}
      </div>
      <div className="shrink-0 text-right">
        <p className={join("tabular text-[0.875rem] font-medium", TONE_TEXT[valueTone])}>{value}</p>
        {meta ? <p className="text-[0.75rem] text-ink-subtle">{meta}</p> : null}
      </div>
    </li>
  );
}

/**
 * Estado vazio.
 *
 * Um card vazio sem explicação parece defeito. Aqui ele diz o que falta e o
 * que fazer a respeito.
 */
export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-[--radius-control] border border-dashed border-line px-4 py-8 text-center">
      <p className="text-[0.875rem] text-ink-muted">{title}</p>
      {hint ? <p className="mt-1 text-[0.8125rem] text-ink-subtle">{hint}</p> : null}
    </div>
  );
}
