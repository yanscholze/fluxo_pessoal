/**
 * Controles de formulário e ação.
 *
 * Todos sem estado próprio — são controlados por quem os usa. Isso mantém o
 * arquivo utilizável tanto por componente de servidor quanto de cliente, e
 * impede que um controle guarde escondido um pedaço do estado da tela.
 *
 * Um botão só existe em três pesos. Mais que isso e a tela perde a noção do
 * que é a ação principal — que é justamente o problema de interface cheia de
 * botões do mesmo tamanho.
 */

import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { ChevronDown, type LucideIcon } from "./icons.tsx";
import { join } from "./primitives.tsx";

// ---------------------------------------------------------------------------
// Ação
// ---------------------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const VARIANTE: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent-hover border border-transparent",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-surface-inset",
  ghost: "bg-transparent text-ink-muted border border-transparent hover:bg-surface-inset hover:text-ink",
  danger: "bg-negative-wash text-negative border border-transparent hover:bg-negative/20",
};

const TAMANHO: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 px-2.5 text-body-sm",
  md: "h-9 gap-2 px-3.5 text-body-sm",
};

export function Button({
  children,
  variant = "secondary",
  size = "md",
  icon: Icon,
  iconRight,
  busy,
  className,
  ...rest
}: {
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconRight?: boolean;
  busy?: boolean;
  className?: string;
} & Omit<ComponentPropsWithoutRef<"button">, "className" | "children">) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || busy}
      aria-busy={busy || undefined}
      className={join(
        "inline-flex shrink-0 select-none items-center justify-center rounded-md font-medium transition-colors",
        "disabled:pointer-events-none disabled:opacity-45",
        iconRight ? "flex-row-reverse" : "",
        VARIANTE[variant],
        TAMANHO[size],
        className,
      )}
    >
      {Icon ? <Icon size={15} strokeWidth={1.9} className="shrink-0" aria-hidden /> : null}
      {children}
    </button>
  );
}

/**
 * Ação que navega.
 *
 * Existe porque um `<button>` com `onClick` que só faz `router.push` quebra
 * abrir em nova aba, copiar o endereço e a navegação do teclado. Quando a ação
 * é ir para outro lugar, o elemento é âncora — e só a aparência é de botão.
 */
export function LinkButton({
  children,
  href,
  variant = "secondary",
  size = "md",
  icon: Icon,
  className,
  ...rest
}: {
  children?: ReactNode;
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  className?: string;
} & Omit<ComponentPropsWithoutRef<"a">, "className" | "children" | "href">) {
  return (
    <a
      href={href}
      {...rest}
      className={join(
        "inline-flex shrink-0 select-none items-center justify-center rounded-md font-medium transition-colors",
        VARIANTE[variant],
        TAMANHO[size],
        className,
      )}
    >
      {Icon ? <Icon size={15} strokeWidth={1.9} className="shrink-0" aria-hidden /> : null}
      {children}
    </a>
  );
}

/** Botão que é só um ícone. Exige rótulo acessível — sem exceção. */
export function IconButton({
  icon: Icon,
  label,
  variant = "ghost",
  size = "md",
  className,
  ...rest
}: {
  icon: LucideIcon;
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} & Omit<ComponentPropsWithoutRef<"button">, "className" | "children">) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={join(
        "inline-flex shrink-0 items-center justify-center rounded-md transition-colors",
        "disabled:pointer-events-none disabled:opacity-45",
        size === "sm" ? "size-8" : "size-9",
        VARIANTE[variant],
        className,
      )}
    >
      <Icon size={16} strokeWidth={1.9} aria-hidden />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Campos
// ---------------------------------------------------------------------------

const CAMPO_BASE =
  "w-full rounded-md border border-line-strong bg-surface-sunken px-3 text-body text-ink " +
  "placeholder:text-ink-subtle transition-colors " +
  "hover:border-line-strong focus:border-accent focus:outline-none " +
  "disabled:opacity-50 aria-[invalid=true]:border-negative";

/**
 * Rótulo, campo, dica e erro numa unidade.
 *
 * A dica fica **acima** do campo quando explica o formato esperado, e o erro
 * **abaixo** quando já houve tentativa: quem está prestes a digitar precisa da
 * instrução antes; quem errou precisa da correção depois.
 */
export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={join("min-w-0", className)}>
      <label htmlFor={htmlFor} className="block text-label uppercase text-ink-subtle">
        {label}
      </label>
      {hint ? <p className="mt-1 text-caption text-ink-subtle">{hint}</p> : null}
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p role="alert" className="mt-1.5 text-caption text-negative">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Input({
  className,
  invalid,
  ...rest
}: { invalid?: boolean; className?: string } & Omit<ComponentPropsWithoutRef<"input">, "className">) {
  return <input {...rest} aria-invalid={invalid || undefined} className={join(CAMPO_BASE, "h-9", className)} />;
}

/** Campo de dinheiro: alinhado à direita e tabular, para conferir dígito a dígito. */
export function MoneyInput({
  className,
  invalid,
  ...rest
}: { invalid?: boolean; className?: string } & Omit<ComponentPropsWithoutRef<"input">, "className">) {
  return (
    <input
      inputMode="decimal"
      {...rest}
      aria-invalid={invalid || undefined}
      className={join(CAMPO_BASE, "tabular h-9 text-right", className)}
    />
  );
}

export function Textarea({
  className,
  invalid,
  ...rest
}: { invalid?: boolean; className?: string } & Omit<ComponentPropsWithoutRef<"textarea">, "className">) {
  return (
    <textarea
      rows={3}
      {...rest}
      aria-invalid={invalid || undefined}
      className={join(CAMPO_BASE, "resize-y py-2 leading-relaxed", className)}
    />
  );
}

/**
 * Seleção.
 *
 * A seta é desenhada por nós porque a nativa muda de forma em cada sistema, e
 * três formas diferentes de seta na mesma tela é o tipo de detalhe que faz uma
 * interface parecer montada às pressas.
 */
export function Select({
  className,
  invalid,
  children,
  size = "md",
  ...rest
}: {
  invalid?: boolean;
  size?: "sm" | "md";
  className?: string;
} & Omit<ComponentPropsWithoutRef<"select">, "className" | "size">) {
  return (
    <span className="relative block">
      <select
        {...rest}
        aria-invalid={invalid || undefined}
        className={join(
          CAMPO_BASE,
          "cursor-pointer appearance-none pr-8",
          size === "sm" ? "h-8 text-body-sm" : "h-9",
          className,
        )}
      >
        {children}
      </select>
      <ChevronDown
        size={14}
        strokeWidth={1.9}
        aria-hidden
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-subtle"
      />
    </span>
  );
}

export function Checkbox({
  label,
  hint,
  className,
  ...rest
}: { label: ReactNode; hint?: string; className?: string } & Omit<
  ComponentPropsWithoutRef<"input">,
  "className" | "type"
>) {
  return (
    <label className={join("flex cursor-pointer items-start gap-2.5", className)}>
      <input
        type="checkbox"
        {...rest}
        className="mt-0.5 size-4 shrink-0 cursor-pointer rounded-xs border-line-strong bg-surface-sunken accent-accent"
      />
      <span className="min-w-0">
        <span className="block text-body-sm text-ink">{label}</span>
        {hint ? <span className="mt-0.5 block text-caption text-ink-subtle">{hint}</span> : null}
      </span>
    </label>
  );
}

/**
 * Alternador de poucas opções mutuamente exclusivas.
 *
 * Substitui a fileira de botões que a versão anterior usava para filtrar: com
 * botões soltos não dá para saber qual está ativo sem ler a cor de cada um.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  name,
  size = "md",
  className,
}: {
  options: readonly { value: T; label: string; icon?: LucideIcon }[];
  value: T;
  onChange: (value: T) => void;
  name?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={name}
      className={join(
        "inline-flex shrink-0 items-center gap-0.5 rounded-md border border-line bg-surface-sunken p-0.5",
        className,
      )}
    >
      {options.map((opcao) => {
        const ativo = opcao.value === value;
        return (
          <button
            key={opcao.value}
            type="button"
            role="radio"
            aria-checked={ativo}
            onClick={() => onChange(opcao.value)}
            className={join(
              "inline-flex items-center gap-1.5 rounded-sm font-medium transition-colors",
              size === "sm" ? "h-6 px-2 text-caption" : "h-7 px-2.5 text-body-sm",
              ativo ? "bg-surface text-ink shadow-panel" : "text-ink-muted hover:text-ink",
            )}
          >
            {opcao.icon ? <opcao.icon size={13} strokeWidth={1.9} aria-hidden /> : null}
            {opcao.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Abas de conteúdo.
 *
 * Diferente do `SegmentedControl`: aquele filtra a mesma lista, este troca o
 * conteúdo da região. Sublinhado em vez de pílula justamente para que a
 * diferença de função seja visível.
 */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: readonly { value: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={join("flex gap-1 overflow-x-auto border-b border-line", className)}>
      {tabs.map((aba) => {
        const ativo = aba.value === value;
        return (
          <button
            key={aba.value}
            type="button"
            role="tab"
            aria-selected={ativo}
            onClick={() => onChange(aba.value)}
            className={join(
              "-mb-px shrink-0 border-b-2 px-3 pb-2.5 pt-1 text-body-sm font-medium transition-colors",
              ativo
                ? "border-accent text-ink"
                : "border-transparent text-ink-muted hover:border-line-strong hover:text-ink",
            )}
          >
            {aba.label}
            {aba.count !== undefined ? (
              <span className={join("tabular ml-1.5 text-caption", ativo ? "text-ink-subtle" : "text-ink-subtle")}>
                {aba.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
