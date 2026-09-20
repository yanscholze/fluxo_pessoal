/**
 * As peças que o Mesa repete em todas as telas.
 *
 * O protótipo não tem uma biblioteca de componentes — ele repete o mesmo
 * conjunto de classes em cada painel. Repetir isso à mão em doze telas
 * garantiria que na terceira elas já estivessem diferentes, então aqui ficam,
 * uma vez, com os valores que ele define.
 *
 * Nada além do que está no desenho. Uma variante nova aqui é uma decisão de
 * desenho tomada por conta própria, e a regra desta reforma é que o desenho
 * manda.
 */

import type { ReactNode } from "react";

import { join } from "./primitives.tsx";

/**
 * O cabeçalho de painel.
 *
 * Grade de duas colunas: o título pode truncar sem empurrar a ação para fora,
 * que é o que acontecia quando isto era um `flex` com `justify-between`.
 */
export function PanelHeading({
  titulo,
  apoio,
  acao,
}: {
  titulo: string;
  apoio?: string;
  acao?: ReactNode;
}) {
  return (
    <div className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
      <div className="min-w-0">
        <h2 className="truncate text-body-sm font-semibold text-ink">{titulo}</h2>
        {apoio ? <p className="mt-1 text-caption text-ink-subtle">{apoio}</p> : null}
      </div>
      {acao}
    </div>
  );
}

/** Os quatro tons semânticos do desenho: fundo a 12%, anel a 20%. */
const TONS = {
  accent: "bg-accent-wash text-accent ring-accent/20",
  positive: "bg-positive-wash text-positive ring-positive/20",
  negative: "bg-negative-wash text-negative ring-negative/20",
  caution: "bg-caution-wash text-caution ring-caution/20",
} as const;

export type TomDaMetrica = keyof typeof TONS;

/**
 * O cartão de indicador: bolha de ícone, rótulo em versalete, número, apoio.
 *
 * O número usa algarismos tabulares porque estes cartões aparecem lado a lado
 * — com dígitos de larguras diferentes, três valores alinhados à esquerda
 * terminam em três lugares distintos.
 */
export function MetricTile({
  tom,
  icone,
  rotulo,
  valor,
  apoio,
}: {
  tom: TomDaMetrica;
  icone: ReactNode;
  rotulo: string;
  valor: string;
  apoio?: string;
}) {
  return (
    <section className="glass-panel p-5">
      <div className={join("mb-5 grid size-10 place-items-center rounded-xl ring-1", TONS[tom])}>
        {icone}
      </div>
      <p className="metric-label">{rotulo}</p>
      <p className="tabular mt-2 text-2xl font-medium text-ink">{valor}</p>
      {apoio ? <p className="mt-2 truncate text-caption text-ink-subtle">{apoio}</p> : null}
    </section>
  );
}

/**
 * O ponto luminoso que marca o tipo de uma linha.
 *
 * `currentColor` na sombra é o truque do desenho: a cor do halo acompanha a
 * cor do ponto sem precisar repeti-la.
 */
export function StatusDot({ tom }: { tom: TomDaMetrica }) {
  const fundo = {
    accent: "bg-accent",
    positive: "bg-positive",
    negative: "bg-negative",
    caution: "bg-caution",
  }[tom];

  return (
    <span
      className={join("size-2.5 rounded-full", fundo)}
      style={{ boxShadow: "0 0 10px currentColor" }}
      aria-hidden
    />
  );
}

/**
 * A rosca de proporção.
 *
 * Um `conic-gradient` com um furo por cima — não é SVG. O desenho faz assim, e
 * o resultado é um anel que não precisa de biblioteca de gráfico para existir.
 */
export function Donut({ percent, legenda }: { percent: number; legenda?: string }) {
  const grau = (Math.max(0, Math.min(100, percent)) / 100) * 360;

  return (
    <div className="flex justify-center">
      <div
        className="relative grid size-32 place-items-center rounded-full"
        style={{
          background: `conic-gradient(var(--color-accent) ${grau}deg, var(--color-surface-inset) 0deg)`,
        }}
      >
        <div className="grid size-24 place-items-center rounded-full bg-surface">
          <span className="tabular text-xl font-semibold text-ink">
            {legenda ?? `${Math.round(percent)}%`}
          </span>
        </div>
      </div>
    </div>
  );
}

/** O botão discreto do cabeçalho de painel — "Ver todos", "Filtrar". */
export function PanelAction({
  children,
  href,
  onClick,
  variante = "fantasma",
}: {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  variante?: "fantasma" | "contornado";
}) {
  const classe = join(
    "inline-flex h-8 items-center gap-2 rounded-md px-3 text-caption font-medium transition-colors",
    variante === "contornado"
      ? "border border-line bg-canvas text-ink-muted hover:bg-surface-raised hover:text-ink"
      : "text-ink-muted hover:bg-surface-raised hover:text-ink",
  );

  if (href) {
    return (
      <a href={href} className={classe}>
        {children}
      </a>
    );
  }

  return (
    <button type="button" onClick={onClick} className={classe}>
      {children}
    </button>
  );
}
