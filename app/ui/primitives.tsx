/**
 * Primitivas visuais.
 *
 * Peças pequenas, sem estado e sem domínio: recebem texto e número já prontos.
 * É o que permite refazer a interface inteira sem tocar em uma linha de regra
 * financeira — e, na direção contrária, o que impede uma tela de inventar um
 * cinza, um raio ou um espaçamento que não existe no sistema.
 *
 * Regra de ouro deste arquivo: **nada aqui aceita `style` nem classe de cor
 * crua**. Se uma tela precisa de algo que não está aqui, a peça entra aqui.
 */

import type { ComponentPropsWithoutRef, ReactNode } from "react";

import type { LucideIcon } from "./icons.tsx";

export function join(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

/** Tom semântico. `accent` veste cromo; os demais vestem valor. */
export type Tone = "neutral" | "positive" | "negative" | "caution" | "info" | "accent";

const TEXT: Record<Tone, string> = {
  neutral: "text-ink",
  positive: "text-positive",
  negative: "text-negative",
  caution: "text-caution",
  info: "text-info",
  accent: "text-accent",
};

const WASH: Record<Tone, string> = {
  neutral: "bg-surface-inset text-ink-muted",
  positive: "bg-positive-wash text-positive",
  negative: "bg-negative-wash text-negative",
  caution: "bg-caution-wash text-caution",
  info: "bg-info-wash text-info",
  accent: "bg-accent-wash text-accent",
};

const FILL: Record<Tone, string> = {
  neutral: "bg-ink-subtle",
  positive: "bg-positive",
  negative: "bg-negative",
  caution: "bg-caution",
  info: "bg-info",
  accent: "bg-accent",
};

export const toneText = (tone: Tone) => TEXT[tone];
export const toneWash = (tone: Tone) => WASH[tone];
export const toneFill = (tone: Tone) => FILL[tone];

// ---------------------------------------------------------------------------
// Superfícies
// ---------------------------------------------------------------------------

/**
 * Superfície de conteúdo.
 *
 * `bare` existe e é importante: nem toda seção merece uma caixa. Um painel que
 * embrulha tudo é como uma tela perde hierarquia — quando tudo tem moldura,
 * nada tem destaque. Use `bare` para agrupar sem emoldurar, e reserve a
 * moldura para o que é de fato uma unidade separada.
 */
export function Panel({
  children,
  variant = "plain",
  padding = "md",
  className,
  as: Tag = "section",
  ...rest
}: {
  children: ReactNode;
  variant?: "plain" | "inset" | "raised" | "bare";
  padding?: "none" | "sm" | "md" | "lg";
  className?: string;
  as?: "section" | "article" | "div" | "aside" | "li";
} & Omit<ComponentPropsWithoutRef<"section">, "className" | "children">) {
  const superficie = {
    plain: "bg-surface border border-line shadow-panel",
    inset: "bg-surface-sunken border border-line",
    raised: "bg-surface-raised border border-line-strong shadow-float",
    bare: "",
  }[variant];

  const espaco = { none: "", sm: "p-3", md: "p-4 sm:p-5", lg: "p-5 sm:p-6" }[padding];

  return (
    <Tag className={join("rounded-lg", superficie, espaco, className)} {...rest}>
      {children}
    </Tag>
  );
}

/**
 * Cabeçalho de painel.
 *
 * Título à esquerda, ação à direita, dica embaixo do título. Sempre a mesma
 * ordem: é o que faz dezoito telas parecerem a mesma aplicação.
 */
export function PanelHeader({
  title,
  hint,
  action,
  icon: Icon,
  className,
}: {
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <header className={join("mb-4 flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-heading text-ink">
          {Icon ? <Icon size={15} strokeWidth={1.75} className="shrink-0 text-ink-subtle" aria-hidden /> : null}
          <span className="truncate">{title}</span>
        </h2>
        {hint ? <p className="mt-1 text-caption text-ink-muted">{hint}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function Divider({ className, soft }: { className?: string; soft?: boolean }) {
  return <hr className={join("border-0 border-t", soft ? "border-line" : "border-line-strong", className)} />;
}

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------

/** Rótulo em versalete. Nomeia um número sem competir com ele. */
export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={join("block text-label uppercase text-ink-subtle", className)}>{children}</span>;
}

/** O número que responde a pergunta. `xl` é para um por tela, no máximo. */
export function Figure({
  value,
  tone = "neutral",
  size = "md",
  className,
}: {
  value: string;
  tone?: Tone;
  size?: "xl" | "md" | "sm";
  className?: string;
}) {
  const escala = { xl: "text-display", md: "text-figure", sm: "text-figure-sm" }[size];
  return <p className={join("tabular", escala, TEXT[tone], className)}>{value}</p>;
}

export function Caption({
  children,
  tone = "subtle",
  className,
}: {
  children: ReactNode;
  tone?: "subtle" | "muted" | Tone;
  className?: string;
}) {
  const cor =
    tone === "subtle" ? "text-ink-subtle" : tone === "muted" ? "text-ink-muted" : TEXT[tone as Tone];
  return <p className={join("text-caption", cor, className)}>{children}</p>;
}

// ---------------------------------------------------------------------------
// Sinal e situação
// ---------------------------------------------------------------------------

export function Badge({
  children,
  tone = "neutral",
  variant = "soft",
  icon: Icon,
}: {
  children: ReactNode;
  tone?: Tone;
  variant?: "soft" | "outline" | "solid";
  icon?: LucideIcon;
}) {
  const aparencia =
    variant === "soft"
      ? WASH[tone]
      : variant === "outline"
        ? join("border", TEXT[tone], tone === "neutral" ? "border-line-strong" : "border-current/30")
        : join(
            tone === "accent" ? "bg-accent text-accent-ink" : join(FILL[tone], "text-canvas"),
          );

  return (
    <span
      className={join(
        "inline-flex shrink-0 items-center gap-1 rounded-sm px-1.5 py-0.5 text-label uppercase",
        aparencia,
      )}
    >
      {Icon ? <Icon size={11} strokeWidth={2} aria-hidden /> : null}
      {children}
    </span>
  );
}

/** Ponto de situação. Vale quando a palavra já está na linha ao lado. */
export function StatusDot({ tone = "neutral", label }: { tone?: Tone; label?: string }) {
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      className={join("inline-block size-1.5 shrink-0 rounded-full", FILL[tone])}
    />
  );
}

/**
 * Barra de proporção.
 *
 * Nunca passa de 100%: uma fatura estourada não pode desenhar fora do painel.
 * O excedente se diz com cor e com texto, não com largura.
 */
export function Meter({
  value,
  total,
  tone = "accent",
  size = "md",
  label,
  className,
}: {
  value: number;
  total: number;
  tone?: Tone;
  size?: "sm" | "md";
  label?: string;
  className?: string;
}) {
  const razao = total > 0 ? Math.min(100, Math.max(0, (value / total) * 100)) : 0;
  return (
    <div
      role="meter"
      aria-valuenow={Math.round(razao)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={join(
        "w-full overflow-hidden rounded-full bg-surface-inset",
        size === "sm" ? "h-1" : "h-1.5",
        className,
      )}
    >
      <div
        className={join("h-full rounded-full transition-[width] duration-700 ease-out-soft", FILL[tone])}
        style={{ width: `${razao}%` }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Estados
// ---------------------------------------------------------------------------

/**
 * Estado vazio.
 *
 * Um painel vazio e mudo parece defeito. Aqui ele diz o que falta, por que
 * falta e o que fazer a respeito.
 */
export function Empty({
  icon: Icon,
  title,
  hint,
  action,
  compact,
}: {
  icon?: LucideIcon;
  title: string;
  hint?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={join(
        "flex flex-col items-center justify-center rounded-md border border-dashed border-line text-center",
        compact ? "gap-1.5 px-4 py-6" : "gap-2 px-6 py-10",
      )}
    >
      {Icon ? (
        <span className="mb-1 flex size-9 items-center justify-center rounded-full bg-surface-inset text-ink-subtle">
          <Icon size={17} strokeWidth={1.5} aria-hidden />
        </span>
      ) : null}
      <p className="text-body-sm text-ink">{title}</p>
      {hint ? <p className="max-w-[34ch] text-caption text-ink-subtle">{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/** Falha carregando um painel. Diz o que não veio, sem despejar detalhe técnico. */
export function ErrorState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-md border border-negative/25 bg-negative-wash px-6 py-8 text-center">
      <p className="text-body-sm font-medium text-negative">{title}</p>
      {hint ? <p className="max-w-[38ch] text-caption text-negative/80">{hint}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

/** Bloco de carregamento com a forma do conteúdo que vai substituí-lo. */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={join("skeleton block rounded-sm", className)} />;
}

/**
 * Aviso curto e contextual.
 *
 * Para estado (offline, conflito, limite estourado), nunca para decoração.
 */
export function Notice({
  tone = "info",
  icon: Icon,
  children,
  action,
}: {
  tone?: Tone;
  icon?: LucideIcon;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      className={join(
        "flex items-start gap-2.5 rounded-md px-3 py-2.5 text-body-sm",
        WASH[tone],
      )}
    >
      {Icon ? <Icon size={15} strokeWidth={1.75} className="mt-px shrink-0" aria-hidden /> : null}
      <div className="min-w-0 flex-1">{children}</div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
