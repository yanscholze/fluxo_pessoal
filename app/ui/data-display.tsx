/**
 * Exibição de dados financeiros.
 *
 * As peças que aparecem em quase toda tela: indicador, tabela, linha de lista,
 * decomposição de um valor e linha do tempo. Elas existem para que dezoito
 * telas mostrem um lançamento do mesmo jeito — na versão anterior cada painel
 * desenhava sua própria linha, com seu próprio espaçamento e sua própria
 * decisão sobre onde fica o valor.
 */

import type { ReactNode } from "react";

import { money, percent } from "./format.ts";
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "./icons.tsx";
import { Label, type Tone, join, toneFill, toneText } from "./primitives.tsx";

// ---------------------------------------------------------------------------
// Dinheiro
// ---------------------------------------------------------------------------

/**
 * Um valor em dinheiro.
 *
 * O tom é explícito de propósito. Deduzir do sinal daria errado neste domínio:
 * uma despesa é gravada com valor **positivo** e a natureza vem do tipo do
 * lançamento, não do sinal. Quem sabe se aquilo é entrada ou saída é a tela.
 */
export function Amount({
  cents,
  currency,
  signed,
  tone = "neutral",
  size = "body",
  className,
}: {
  cents: number;
  currency?: string;
  signed?: boolean;
  tone?: Tone;
  size?: "figure" | "figure-sm" | "body" | "body-sm" | "caption";
  className?: string;
}) {
  const escala = {
    figure: "text-figure",
    "figure-sm": "text-figure-sm",
    body: "text-body font-medium",
    "body-sm": "text-body-sm font-medium",
    caption: "text-caption",
  }[size];

  return (
    <span className={join("tabular", escala, toneText(tone), className)}>
      {money(cents, { currency, signed })}
    </span>
  );
}

/**
 * Variação contra um período anterior.
 *
 * `invert` existe porque em despesa cair é bom: a mesma queda de 8% é verde
 * numa receita e vermelha numa despesa, e quem sabe qual é o caso é a tela.
 */
export function Delta({
  percent: variacao,
  invert,
  suffix,
}: {
  percent: number | null;
  invert?: boolean;
  suffix?: string;
}) {
  if (variacao === null || !Number.isFinite(variacao)) return null;

  const subiu = variacao > 0;
  const neutro = Math.abs(variacao) < 0.05;
  const bom = invert ? !subiu : subiu;
  const tom: Tone = neutro ? "neutral" : bom ? "positive" : "negative";
  const Seta = subiu ? ArrowUpRight : ArrowDownRight;

  return (
    <span className={join("inline-flex items-center gap-0.5 text-caption font-medium", toneText(tom))}>
      {neutro ? null : <Seta size={12} strokeWidth={2.25} aria-hidden />}
      <span className="tabular">{percent(Math.abs(variacao), 1)}</span>
      {suffix ? <span className="ml-0.5 font-normal text-ink-subtle">{suffix}</span> : null}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Indicadores
// ---------------------------------------------------------------------------

export type MetricProps = {
  readonly label: string;
  readonly value: string;
  readonly tone?: Tone;
  readonly hint?: ReactNode;
  readonly delta?: { percent: number | null; invert?: boolean; suffix?: string };
  readonly icon?: LucideIcon;
};

/** Um indicador: rótulo, valor, variação e a nota que explica o que ele é. */
export function Metric({ label, value, tone = "neutral", hint, delta, icon: Icon }: MetricProps) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        {Icon ? <Icon size={13} strokeWidth={1.75} className="shrink-0 text-ink-subtle" aria-hidden /> : null}
        <Label>{label}</Label>
      </div>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <p className={join("tabular text-figure", toneText(tone))}>{value}</p>
        {delta ? <Delta {...delta} /> : null}
      </div>
      {hint ? <p className="mt-1 text-caption leading-snug text-ink-subtle">{hint}</p> : null}
    </div>
  );
}

/**
 * A faixa de indicadores do topo de uma tela.
 *
 * Uma superfície só, dividida por linhas verticais — e não N painéis soltos.
 * Quatro caixas idênticas lado a lado dizem ao olho que são quatro coisas
 * separadas de mesma importância; uma faixa dividida diz que são quatro
 * ângulos da **mesma** posição financeira, que é o que de fato são.
 */
export function MetricStrip({ metrics, className }: { metrics: readonly MetricProps[]; className?: string }) {
  return (
    <div
      className={join(
        "grid gap-px overflow-hidden rounded-lg border border-line bg-line shadow-panel",
        metrics.length >= 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
    >
      {metrics.map((metrica) => (
        <div key={metrica.label} className="bg-surface p-4 sm:p-5">
          <Metric {...metrica} />
        </div>
      ))}
    </div>
  );
}

/**
 * Decomposição de um número.
 *
 * Um valor financeiro sem a conta que o produziu obriga o usuário a confiar
 * cegamente. Aqui ele confere: cada parcela com seu sinal, e o resultado
 * separado por uma linha.
 */
export function Breakdown({
  parts,
  result,
  className,
}: {
  parts: readonly { label: string; cents: number; sign: "+" | "−"; currency?: string }[];
  result?: { label: string; cents: number; tone?: Tone };
  className?: string;
}) {
  return (
    <dl className={join("space-y-1.5", className)}>
      {parts.map((parcela) => (
        <div key={parcela.label} className="flex items-baseline justify-between gap-3">
          <dt className="text-body-sm text-ink-muted">{parcela.label}</dt>
          <dd
            className={join(
              "tabular text-body-sm font-medium",
              parcela.cents === 0 ? "text-ink-subtle" : parcela.sign === "+" ? "text-ink" : "text-negative",
            )}
          >
            {parcela.cents === 0 ? "—" : `${parcela.sign} ${money(parcela.cents, { currency: parcela.currency })}`}
          </dd>
        </div>
      ))}
      {result ? (
        <div className="flex items-baseline justify-between gap-3 border-t border-line pt-2">
          <dt className="text-body-sm font-medium text-ink">{result.label}</dt>
          <dd className={join("tabular text-body-sm font-semibold", toneText(result.tone ?? "neutral"))}>
            {money(result.cents)}
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

// ---------------------------------------------------------------------------
// Tabela
// ---------------------------------------------------------------------------

export type Column = {
  readonly key: string;
  readonly header: string;
  /** Valores numéricos alinham à direita — é o que permite comparar a coluna. */
  readonly align?: "left" | "right";
  readonly width?: string;
  /** Some abaixo de `sm`. Use para coluna de contexto, nunca para a essencial. */
  readonly hideBelow?: "sm" | "md" | "lg";
};

const ESCONDE: Record<string, string> = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
};

/**
 * Tabela de dados.
 *
 * Sem zebra, sem borda vertical, sem contorno externo: o peso vem do
 * cabeçalho em versalete e de uma hairline por linha. Tabela financeira é
 * lida em varredura vertical, e listra alternada atrapalha exatamente isso.
 */
export function DataTable({
  columns,
  children,
  caption,
  className,
}: {
  columns: readonly Column[];
  children: ReactNode;
  caption?: string;
  className?: string;
}) {
  return (
    <div className={join("-mx-4 overflow-x-auto sm:mx-0", className)}>
      <table className="w-full min-w-[36rem] border-collapse text-body-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="border-b border-line">
            {columns.map((coluna) => (
              <th
                key={coluna.key}
                scope="col"
                style={coluna.width ? { width: coluna.width } : undefined}
                className={join(
                  "whitespace-nowrap px-3 pb-2 text-label uppercase text-ink-subtle first:pl-4 last:pr-4 sm:first:pl-0 sm:last:pr-0",
                  coluna.align === "right" ? "text-right" : "text-left",
                  coluna.hideBelow ? ESCONDE[coluna.hideBelow] : "",
                )}
              >
                {coluna.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Tr({ children, onClick, className }: { children: ReactNode; onClick?: () => void; className?: string }) {
  return (
    <tr
      onClick={onClick}
      className={join(
        "border-b border-line/70 last:border-0",
        onClick ? "cursor-pointer transition-colors hover:bg-surface-inset" : "",
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function Td({
  children,
  align = "left",
  hideBelow,
  className,
  colSpan,
}: {
  children: ReactNode;
  align?: "left" | "right";
  hideBelow?: "sm" | "md" | "lg";
  className?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={join(
        "px-3 py-2.5 align-middle text-ink first:pl-4 last:pr-4 sm:first:pl-0 sm:last:pr-0",
        align === "right" ? "text-right" : "text-left",
        hideBelow ? ESCONDE[hideBelow] : "",
        className,
      )}
    >
      {children}
    </td>
  );
}

// ---------------------------------------------------------------------------
// Listas
// ---------------------------------------------------------------------------

/**
 * Linha de lista.
 *
 * O padrão de "um item com um valor à direita" que aparece em conta, categoria,
 * lançamento recente, agenda e assinatura. Um componente só, para que os cinco
 * lugares não divirjam em altura, alinhamento e tamanho de fonte.
 */
export function ListRow({
  title,
  subtitle,
  value,
  valueTone = "neutral",
  meta,
  icon,
  accentColor,
  badge,
  href,
  onClick,
}: {
  title: string;
  subtitle?: ReactNode;
  value?: string;
  valueTone?: Tone;
  meta?: ReactNode;
  icon?: LucideIcon;
  /** Bolinha colorida de categoria/conta. Cor vem do dado, não do tema. */
  accentColor?: string;
  badge?: ReactNode;
  href?: string;
  onClick?: () => void;
}) {
  const Icone = icon;

  const conteudo = (
    <>
      <span className="flex min-w-0 flex-1 items-center gap-2.5">
        {accentColor ? (
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: accentColor }}
            aria-hidden
          />
        ) : Icone ? (
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-surface-inset text-ink-muted">
            <Icone size={14} strokeWidth={1.75} aria-hidden />
          </span>
        ) : null}
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-body text-ink">{title}</span>
            {badge}
          </span>
          {subtitle ? <span className="mt-0.5 block truncate text-caption text-ink-subtle">{subtitle}</span> : null}
        </span>
      </span>

      {value !== undefined || meta ? (
        <span className="shrink-0 text-right">
          {value !== undefined ? (
            <span className={join("tabular block text-body font-medium", toneText(valueTone))}>{value}</span>
          ) : null}
          {meta ? <span className="mt-0.5 block text-caption text-ink-subtle">{meta}</span> : null}
        </span>
      ) : null}
    </>
  );

  const classe = join(
    "flex w-full items-center justify-between gap-4 border-b border-line/70 py-2.5 text-left last:border-0",
    href || onClick ? "-mx-2 rounded-md px-2 transition-colors hover:bg-surface-inset" : "",
  );

  return (
    <li className="contents">
      {href ? (
        <a href={href} className={classe}>
          {conteudo}
        </a>
      ) : onClick ? (
        <button type="button" onClick={onClick} className={classe}>
          {conteudo}
        </button>
      ) : (
        <span className={classe}>{conteudo}</span>
      )}
    </li>
  );
}

/** Par rótulo/valor. Para ficha de detalhe, nunca para lista comparável. */
export function KeyValue({
  entries,
  columns = 2,
  className,
}: {
  entries: readonly { label: string; value: ReactNode }[];
  columns?: 1 | 2 | 3;
  className?: string;
}) {
  const grade = { 1: "", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3" }[columns];
  return (
    <dl className={join("grid gap-x-6 gap-y-3", grade, className)}>
      {entries.map((entrada) => (
        <div key={entrada.label} className="min-w-0">
          <dt className="text-caption text-ink-subtle">{entrada.label}</dt>
          <dd className="mt-0.5 text-body-sm text-ink">{entrada.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---------------------------------------------------------------------------
// Linha do tempo
// ---------------------------------------------------------------------------

export type TimelineItem = {
  readonly id: string;
  readonly when: string;
  readonly title: string;
  readonly detail?: ReactNode;
  readonly value?: string;
  readonly valueTone?: Tone;
  readonly tone?: Tone;
  readonly icon?: LucideIcon;
  /** Marca o "hoje" da linha: o que vem depois ainda não aconteceu. */
  readonly isNow?: boolean;
};

/**
 * Linha do tempo de eventos financeiros.
 *
 * Responde "o que vai acontecer com meu dinheiro nos próximos dias" numa
 * varredura. A régua vertical existe para que a distância entre dois eventos
 * seja lida como tempo, e não como espaçamento decorativo.
 */
export function Timeline({ items, className }: { items: readonly TimelineItem[]; className?: string }) {
  return (
    <ol className={join("relative", className)}>
      <span className="absolute inset-y-1 left-[7px] w-px bg-line" aria-hidden />
      {items.map((item) => (
        <li key={item.id} className="relative flex gap-3 py-2 pl-6">
          <span
            className={join(
              "absolute left-0 top-3 flex size-[15px] items-center justify-center rounded-full ring-4 ring-surface",
              item.isNow ? "bg-accent" : "bg-surface-inset",
            )}
            aria-hidden
          >
            {item.icon ? (
              <item.icon
                size={9}
                strokeWidth={2.5}
                className={item.isNow ? "text-accent-ink" : toneText(item.tone ?? "neutral")}
              />
            ) : (
              <span className={join("size-[5px] rounded-full", toneFill(item.tone ?? "neutral"))} />
            )}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <p className="truncate text-body-sm text-ink">{item.title}</p>
              {item.value ? (
                <span className={join("tabular shrink-0 text-body-sm font-medium", toneText(item.valueTone ?? "neutral"))}>
                  {item.value}
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-caption text-ink-subtle">
              {item.when}
              {item.detail ? <span className="mx-1.5 text-line-strong">·</span> : null}
              {item.detail}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
