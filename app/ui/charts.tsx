/**
 * Gráficos.
 *
 * SVG escrito à mão, renderizado no servidor. Nenhuma biblioteca: as quatro
 * formas de que este produto precisa — linha, área, barra e rosca — custam
 * menos código do que a configuração de qualquer biblioteca, e em troca
 * herdam os tokens do sistema em vez de trazer um tema próprio que nunca
 * combina com o resto.
 *
 * Interação sem JavaScript: o destaque no ponto sob o cursor é CSS, e o
 * detalhe é `<title>`, que o navegador mostra como tooltip e o leitor de tela
 * anuncia. Um gráfico que precisa de estado no cliente para revelar um número
 * é um gráfico que fica mudo enquanto a página hidrata.
 *
 * Todos os traços usam `vector-effect="non-scaling-stroke"`: o SVG estica para
 * preencher a largura disponível, e sem isso a linha engrossaria junto.
 */

import type { ReactNode } from "react";

import { join, type Tone } from "./primitives.tsx";

// ---------------------------------------------------------------------------
// Moldura
// ---------------------------------------------------------------------------

export type LegendItem = { readonly label: string; readonly color: string };

/**
 * Moldura de gráfico.
 *
 * Título, leitura destacada e legenda ficam **fora** da área de plotagem, numa
 * ordem fixa. Gráfico com legenda flutuando por dentro é o que faz um painel
 * parecer captura de tela de planilha.
 */
export function ChartFrame({
  title,
  hint,
  readout,
  legend,
  action,
  children,
  className,
}: {
  title?: string;
  hint?: ReactNode;
  readout?: ReactNode;
  legend?: readonly LegendItem[];
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <figure className={join("min-w-0", className)}>
      {title || readout || legend?.length || action ? (
        <figcaption className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            {title ? <h3 className="text-heading text-ink">{title}</h3> : null}
            {hint ? <p className="mt-0.5 text-caption text-ink-muted">{hint}</p> : null}
            {readout ? <div className="mt-2">{readout}</div> : null}
          </div>

          <div className="flex shrink-0 items-center gap-3">
            {legend?.length ? (
              <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {legend.map((item) => (
                  <li key={item.label} className="flex items-center gap-1.5 text-caption text-ink-muted">
                    <span
                      className="size-2 shrink-0 rounded-[2px]"
                      style={{ backgroundColor: item.color }}
                      aria-hidden
                    />
                    {item.label}
                  </li>
                ))}
              </ul>
            ) : null}
            {action}
          </div>
        </figcaption>
      ) : null}
      {children}
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Escalas
// ---------------------------------------------------------------------------

/** Área de plotagem em coordenadas do viewBox. */
const W = 1000;

function escalaY(valores: readonly number[], incluirZero: boolean) {
  const finitos = valores.filter((valor) => Number.isFinite(valor));
  let maximo = finitos.length ? Math.max(...finitos) : 0;
  let minimo = finitos.length ? Math.min(...finitos) : 0;

  // O zero entra na escala sempre que houver valor negativo: sem ele, um saldo
  // negativo seria desenhado como uma barra pequena positiva.
  if (incluirZero || minimo < 0) {
    maximo = Math.max(0, maximo);
    minimo = Math.min(0, minimo);
  }

  // Folga de 8% no topo para o rótulo não encostar na borda.
  const amplitude = maximo - minimo;
  if (amplitude === 0) return { maximo: maximo + 1, minimo: minimo - 1, amplitude: 2 };
  return { maximo: maximo + amplitude * 0.08, minimo, amplitude: amplitude * 1.08 };
}

/**
 * Suavização monotônica.
 *
 * Catmull-Rom puro cria ondulação: entre dois meses de saldo estável a curva
 * inventa um pico que não existe no dado. Aqui a tangente é limitada pela
 * inclinação dos vizinhos, então a curva nunca ultrapassa os pontos reais —
 * o que num gráfico de dinheiro é uma exigência, não um refinamento.
 */
function caminhoSuave(pontos: readonly { x: number; y: number }[]): string {
  if (pontos.length < 2) return pontos.length ? `M ${pontos[0].x} ${pontos[0].y}` : "";

  let d = `M ${pontos[0].x} ${pontos[0].y}`;
  for (let i = 0; i < pontos.length - 1; i += 1) {
    const p0 = pontos[i === 0 ? 0 : i - 1];
    const p1 = pontos[i];
    const p2 = pontos[i + 1];
    const p3 = pontos[i + 2] ?? p2;

    const subindo = p2.y <= p1.y;
    const limite = (candidato: number) => {
      if (subindo) return Math.max(Math.min(candidato, p1.y), p2.y);
      return Math.min(Math.max(candidato, p1.y), p2.y);
    };

    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = limite(p1.y + (p2.y - p0.y) / 6);
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = limite(p2.y - (p3.y - p1.y) / 6);

    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

const COR_DO_TOM: Record<Tone, string> = {
  neutral: "var(--color-ink-subtle)",
  positive: "var(--color-positive)",
  negative: "var(--color-negative)",
  caution: "var(--color-caution)",
  info: "var(--color-info)",
  accent: "var(--color-accent)",
};

export const chartColor = (tone: Tone) => COR_DO_TOM[tone];

/** Cores da série de apoio, para gráficos com muitas fatias. */
export const VIZ = [
  "var(--color-viz-1)",
  "var(--color-viz-2)",
  "var(--color-viz-3)",
  "var(--color-viz-4)",
  "var(--color-viz-5)",
  "var(--color-viz-6)",
  "var(--color-viz-7)",
  "var(--color-viz-8)",
] as const;

// ---------------------------------------------------------------------------
// Linha e área
// ---------------------------------------------------------------------------

export type Series = {
  readonly id: string;
  readonly label: string;
  readonly color?: string;
  readonly values: readonly number[];
  /** Série prevista: tracejada, para não se passar por fato consumado. */
  readonly projected?: boolean;
  readonly fill?: boolean;
};

export function LineChart({
  labels,
  series,
  height = 200,
  format,
  zeroLine,
  gridLines = 4,
  className,
}: {
  labels: readonly string[];
  series: readonly Series[];
  height?: number;
  /** Como o valor aparece no tooltip. Recebe centavos. */
  format: (value: number) => string;
  zeroLine?: boolean;
  gridLines?: number;
  className?: string;
}) {
  const H = 260;
  const todos = series.flatMap((serie) => [...serie.values]);
  const { maximo, minimo, amplitude } = escalaY(todos, Boolean(zeroLine));

  const passo = labels.length > 1 ? W / (labels.length - 1) : 0;
  const emY = (valor: number) => H - ((valor - minimo) / amplitude) * H;

  const grade = Array.from({ length: gridLines + 1 }, (_, i) => (H / gridLines) * i);
  const yZero = emY(0);

  return (
    <div className={join("min-w-0", className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={series.map((serie) => serie.label).join(", ")}
        className="w-full"
        style={{ height }}
      >
        <defs>
          {series
            .filter((serie) => serie.fill)
            .map((serie) => (
              <linearGradient key={serie.id} id={`gradiente-${serie.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={serie.color ?? COR_DO_TOM.accent} stopOpacity="0.22" />
                <stop offset="100%" stopColor={serie.color ?? COR_DO_TOM.accent} stopOpacity="0" />
              </linearGradient>
            ))}
        </defs>

        {grade.map((y) => (
          <line
            key={y}
            x1={0}
            x2={W}
            y1={y}
            y2={y}
            stroke="var(--color-line)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {minimo < 0 && maximo > 0 ? (
          <line
            x1={0}
            x2={W}
            y1={yZero}
            y2={yZero}
            stroke="var(--color-line-strong)"
            strokeWidth={1}
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}

        {series.map((serie) => {
          const cor = serie.color ?? COR_DO_TOM.accent;
          const pontos = serie.values.map((valor, i) => ({ x: i * passo, y: emY(valor) }));
          const caminho = caminhoSuave(pontos);

          return (
            <g key={serie.id} className="animate-sweep">
              {serie.fill ? (
                <path
                  d={`${caminho} L ${W} ${H} L 0 ${H} Z`}
                  fill={`url(#gradiente-${serie.id})`}
                  stroke="none"
                />
              ) : null}
              <path
                d={caminho}
                fill="none"
                stroke={cor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={serie.projected ? "5 4" : undefined}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        })}

        {/* Faixa sensível por ponto: destaca o marcador e entrega o tooltip. */}
        {labels.map((rotulo, i) => (
          <g key={rotulo} className="group">
            <rect
              x={i * passo - passo / 2}
              y={0}
              width={passo || W}
              height={H}
              fill="transparent"
              className="cursor-crosshair"
            >
              <title>
                {rotulo}
                {series.map((serie) => ` · ${serie.label}: ${format(serie.values[i] ?? 0)}`).join("")}
              </title>
            </rect>
            <line
              x1={i * passo}
              x2={i * passo}
              y1={0}
              y2={H}
              stroke="var(--color-line-strong)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              className="opacity-0 transition-opacity group-hover:opacity-100"
            />
            {series.map((serie) => (
              <circle
                key={serie.id}
                cx={i * passo}
                cy={emY(serie.values[i] ?? 0)}
                r={3.5}
                fill="var(--color-surface)"
                stroke={serie.color ?? COR_DO_TOM.accent}
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
                className="opacity-0 transition-opacity group-hover:opacity-100"
              />
            ))}
          </g>
        ))}
      </svg>

      <Eixo labels={labels} />
    </div>
  );
}

/**
 * Rótulos do eixo horizontal.
 *
 * Fora do SVG porque dentro dele o texto esticaria junto com o viewBox. Em
 * telas estreitas mostra um a cada dois, senão os rótulos se sobrepõem.
 */
function Eixo({ labels }: { labels: readonly string[] }) {
  if (!labels.length) return null;
  return (
    <ol className="mt-2 flex justify-between gap-1">
      {labels.map((rotulo, i) => (
        <li
          key={`${rotulo}-${i}`}
          className={join(
            "text-caption text-ink-subtle",
            labels.length > 7 && i % 2 === 1 ? "hidden sm:block" : "",
          )}
        >
          {rotulo}
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Barras
// ---------------------------------------------------------------------------

export type Bar = {
  readonly label: string;
  readonly value: number;
  readonly tone?: Tone;
  readonly color?: string;
  /** Parte já realizada, desenhada cheia sobre o restante translúcido. */
  readonly settled?: number;
};

export function BarChart({
  bars,
  height = 180,
  format,
  className,
}: {
  bars: readonly Bar[];
  height?: number;
  format: (value: number) => string;
  className?: string;
}) {
  const H = 220;
  const { maximo, minimo, amplitude } = escalaY(
    bars.map((barra) => barra.value),
    true,
  );
  const emY = (valor: number) => H - ((valor - minimo) / amplitude) * H;
  const yZero = emY(0);
  const largura = bars.length ? (W / bars.length) * 0.56 : 0;
  const passo = bars.length ? W / bars.length : 0;

  return (
    <div className={join("min-w-0", className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Gráfico de barras"
        className="w-full"
        style={{ height }}
      >
        <line
          x1={0}
          x2={W}
          y1={yZero}
          y2={yZero}
          stroke="var(--color-line)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />

        {bars.map((barra, i) => {
          const x = i * passo + (passo - largura) / 2;
          const y = emY(Math.max(0, barra.value));
          const altura = Math.max(2, Math.abs(emY(barra.value) - yZero));
          const cor = barra.color ?? COR_DO_TOM[barra.tone ?? "accent"];
          const alturaPaga =
            barra.settled !== undefined && barra.value > 0
              ? Math.max(0, (barra.settled / barra.value) * altura)
              : 0;

          return (
            <g key={`${barra.label}-${i}`} className="group">
              <title>
                {barra.label}: {format(barra.value)}
              </title>
              <rect
                x={x}
                y={barra.value < 0 ? yZero : y}
                width={largura}
                height={altura}
                rx={3}
                fill={cor}
                fillOpacity={barra.settled === undefined ? 0.9 : 0.28}
                className="transition-[fill-opacity] group-hover:[fill-opacity:1]"
              />
              {alturaPaga > 0 ? (
                <rect
                  x={x}
                  y={yZero - alturaPaga}
                  width={largura}
                  height={alturaPaga}
                  rx={3}
                  fill={cor}
                  fillOpacity={0.95}
                />
              ) : null}
            </g>
          );
        })}
      </svg>

      <Eixo labels={bars.map((barra) => barra.label)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rosca
// ---------------------------------------------------------------------------

export type Slice = {
  readonly label: string;
  readonly value: number;
  readonly color?: string;
};

/**
 * Rosca com leitura no centro.
 *
 * O buraco não é estilo: é onde vai o total, que é o número que a pessoa
 * procura antes de olhar as fatias. Rosca sem leitura central obriga a somar
 * a legenda de cabeça.
 */
export function DonutChart({
  slices,
  size = 168,
  thickness = 18,
  centerLabel,
  centerValue,
  format,
  className,
}: {
  slices: readonly Slice[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
  format: (value: number) => string;
  className?: string;
}) {
  const total = slices.reduce((soma, fatia) => soma + Math.max(0, fatia.value), 0);
  const raio = (size - thickness) / 2;
  const circunferencia = 2 * Math.PI * raio;

  let percorrido = 0;

  return (
    <div className={join("relative shrink-0", className)} style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="size-full -rotate-90" role="img" aria-label="Distribuição">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={raio}
          fill="none"
          stroke="var(--color-surface-inset)"
          strokeWidth={thickness}
        />
        {total > 0
          ? slices.map((fatia, i) => {
              const proporcao = Math.max(0, fatia.value) / total;
              const comprimento = proporcao * circunferencia;
              const deslocamento = percorrido * circunferencia;
              percorrido += proporcao;

              return (
                <circle
                  key={fatia.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={raio}
                  fill="none"
                  stroke={fatia.color ?? VIZ[i % VIZ.length]}
                  strokeWidth={thickness}
                  strokeDasharray={`${comprimento} ${circunferencia - comprimento}`}
                  strokeDashoffset={-deslocamento}
                  strokeLinecap="butt"
                  className="transition-opacity hover:opacity-75"
                >
                  <title>
                    {fatia.label}: {format(fatia.value)}
                  </title>
                </circle>
              );
            })
          : null}
      </svg>

      {centerValue ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <p className="tabular text-figure-sm text-ink">{centerValue}</p>
          {centerLabel ? <p className="mt-0.5 text-caption text-ink-subtle">{centerLabel}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Anel de progresso.
 *
 * Para meta e para indicador de saúde: uma proporção única, que o número no
 * centro já diz — o anel só torna a distância até o objetivo visível de longe.
 */
export function ProgressRing({
  percent,
  size = 108,
  thickness = 9,
  tone = "accent",
  label,
  value,
}: {
  percent: number;
  size?: number;
  thickness?: number;
  tone?: Tone;
  label?: string;
  value?: string;
}) {
  const razao = Math.min(100, Math.max(0, percent));
  const raio = (size - thickness) / 2;
  const circunferencia = 2 * Math.PI * raio;
  const preenchido = (razao / 100) * circunferencia;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="size-full -rotate-90" role="img" aria-label={label}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={raio}
          fill="none"
          stroke="var(--color-surface-inset)"
          strokeWidth={thickness}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={raio}
          fill="none"
          stroke={COR_DO_TOM[tone]}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${preenchido} ${circunferencia - preenchido}`}
          className="transition-[stroke-dasharray] duration-700 ease-out-soft"
        />
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <p className="tabular text-figure-sm text-ink">{value ?? `${Math.round(razao)}%`}</p>
        {label ? <p className="text-caption text-ink-subtle">{label}</p> : null}
      </div>
    </div>
  );
}

/** Linha mínima, para caber dentro de uma célula de tabela ou de um indicador. */
export function Sparkline({
  values,
  tone = "accent",
  width = 96,
  height = 28,
}: {
  values: readonly number[];
  tone?: Tone;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;
  const { minimo, amplitude } = escalaY(values, false);
  const passo = width / (values.length - 1);
  const pontos = values.map((valor, i) => ({
    x: i * passo,
    y: height - ((valor - minimo) / amplitude) * height,
  }));

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="shrink-0">
      <path
        d={caminhoSuave(pontos)}
        fill="none"
        stroke={COR_DO_TOM[tone]}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
