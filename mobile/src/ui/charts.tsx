/**
 * Gráficos do aplicativo.
 *
 * Escritos com `View`, sem biblioteca e sem SVG — a mesma decisão do site, pelo
 * mesmo motivo: as quatro formas de que este produto precisa custam menos
 * código do que a configuração de qualquer biblioteca, e em troca herdam os
 * tokens em vez de trazer um tema próprio.
 *
 * A escolha das formas é do celular, não uma cópia do site. Numa tela de 360 px
 * a rosca de categorias não cabe com rótulos legíveis: vira um anel bonito e
 * uma legenda que ninguém lê. A barra empilhada responde a mesma pergunta —
 * "para onde foi o dinheiro" — com o texto na largura toda.
 *
 * Nenhum destes componentes calcula dinheiro. Eles recebem números prontos e
 * decidem só quanto cada coisa mede na tela.
 */

import { type ReactNode } from "react";
import { View } from "react-native";

import { Small, Texto } from "./primitives.tsx";
import { radius, space, type, usePalette } from "./theme.ts";

/** Altura da área de plotagem das barras. Cabe sem empurrar o cartão. */
const ALTURA = 92;

export type BarraMensal = {
  readonly rotulo: string;
  readonly entrada: number;
  readonly saida: number;
  /** Destaca a coluna do mês corrente. */
  readonly atual?: boolean;
};

/**
 * Entradas e saídas mês a mês.
 *
 * Duas colunas coladas por mês, e não barras empilhadas: empilhar receita com
 * despesa produz uma torre cuja altura não quer dizer nada. Lado a lado, a
 * comparação que importa — "entrou mais do que saiu?" — é a diferença de altura
 * entre as duas, lida sem esforço.
 */
export function GraficoMensal({ barras }: { barras: readonly BarraMensal[] }) {
  const palette = usePalette();
  const teto = Math.max(1, ...barras.flatMap((barra) => [barra.entrada, barra.saida]));

  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", height: ALTURA, gap: space.sm }}>
        {barras.map((barra) => (
          <View key={barra.rotulo} style={{ flex: 1, alignItems: "center", gap: 3 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-end",
                gap: 2,
                height: ALTURA,
              }}
            >
              <Coluna valor={barra.entrada} teto={teto} cor={palette.positive} atenuada={!barra.atual} />
              <Coluna valor={barra.saida} teto={teto} cor={palette.negative} atenuada={!barra.atual} />
            </View>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: "row", gap: space.sm }}>
        {barras.map((barra) => (
          <View key={barra.rotulo} style={{ flex: 1, alignItems: "center" }}>
            <Texto
              style={[
                type.caption,
                { color: barra.atual ? palette.ink : palette.inkSubtle, fontWeight: barra.atual ? "600" : "400" },
              ]}
            >
              {barra.rotulo}
            </Texto>
          </View>
        ))}
      </View>
    </View>
  );
}

function Coluna({
  valor,
  teto,
  cor,
  atenuada,
}: {
  valor: number;
  teto: number;
  cor: string;
  atenuada: boolean;
}) {
  // Uma barra de 1 px é o que distingue "quase nada" de "nada": zerar a altura
  // faria um mês de R$ 12,00 sumir do gráfico como se não tivesse existido.
  const altura = valor > 0 ? Math.max(2, (valor / teto) * ALTURA) : 0;

  return (
    <View
      style={{
        width: 9,
        height: altura,
        borderRadius: radius.xs,
        backgroundColor: cor,
        opacity: atenuada ? 0.5 : 1,
      }}
    />
  );
}

export type Fatia = {
  readonly id: string;
  readonly rotulo: string;
  readonly valor: number;
  readonly cor: string;
};

/**
 * Para onde o dinheiro foi.
 *
 * Barra empilhada e lista, em vez de rosca. Numa tela estreita a rosca obriga a
 * uma legenda separada, e ler o gráfico vira um exercício de casar cor com
 * texto. Aqui a barra dá a proporção de relance e a lista dá o número, na
 * mesma ordem.
 */
export function GraficoDeCategorias({ fatias, limite = 5 }: { fatias: readonly Fatia[]; limite?: number }) {
  const palette = usePalette();
  const total = fatias.reduce((soma, fatia) => soma + fatia.valor, 0);
  if (total <= 0) return null;

  const ordenadas = [...fatias].sort((esquerda, direita) => direita.valor - esquerda.valor);
  const principais = ordenadas.slice(0, limite);
  const resto = ordenadas.slice(limite).reduce((soma, fatia) => soma + fatia.valor, 0);

  const exibidas: Fatia[] = resto > 0
    ? [...principais, { id: "resto", rotulo: "Outras", valor: resto, cor: palette.inkSubtle }]
    : principais;

  return (
    <View style={{ gap: space.md }}>
      <View
        style={{
          flexDirection: "row",
          height: 10,
          borderRadius: radius.pill,
          overflow: "hidden",
          backgroundColor: palette.surfaceInset,
        }}
      >
        {exibidas.map((fatia) => (
          <View
            key={fatia.id}
            style={{ flex: Math.max(0.01, fatia.valor / total), backgroundColor: fatia.cor }}
          />
        ))}
      </View>

      <View style={{ gap: space.sm }}>
        {exibidas.map((fatia) => (
          <View key={fatia.id} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <View
              style={{ width: 8, height: 8, borderRadius: radius.pill, backgroundColor: fatia.cor }}
            />
            <Texto style={[type.bodySm, { flex: 1, color: palette.ink }]} numberOfLines={1}>
              {fatia.rotulo}
            </Texto>
            <Small>{Math.round((fatia.valor / total) * 100)}%</Small>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Medidor: quanto de um todo já foi usado.
 *
 * Aceita passar de 100% e mostra isso — o excedente aparece na cor de alerta em
 * vez de a barra simplesmente encher. Um orçamento estourado que parece "cheio"
 * é indistinguível de um orçamento no limite.
 */
export function Medidor({
  valor,
  total,
  tom = "accent",
  altura = 6,
}: {
  valor: number;
  total: number;
  tom?: "accent" | "positive" | "negative" | "caution";
  altura?: number;
}) {
  const palette = usePalette();
  const razao = total > 0 ? valor / total : 0;
  const estourou = razao > 1;

  const cores = {
    accent: palette.accent,
    positive: palette.positive,
    negative: palette.negative,
    caution: palette.caution,
  };

  return (
    <View
      style={{
        height: altura,
        borderRadius: radius.pill,
        backgroundColor: palette.surfaceInset,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          width: `${Math.min(100, Math.max(0, razao * 100))}%`,
          height: "100%",
          borderRadius: radius.pill,
          backgroundColor: estourou ? palette.negative : cores[tom],
        }}
      />
    </View>
  );
}

/**
 * Linha do tempo curta: o saldo dos últimos dias.
 *
 * Colunas finas e cheias em vez de uma linha: desenhar uma poligonal com
 * `View` exige rotacionar segmentos, o que produz pontas serrilhadas e um
 * cálculo de ângulo por ponto. A leitura que se quer — "vem subindo ou
 * caindo?" — a coluna dá igual, e sem nenhum desses problemas.
 */
export function Sparkbars({
  valores,
  cor,
  altura = 34,
}: {
  valores: readonly number[];
  cor?: string;
  altura?: number;
}) {
  const palette = usePalette();
  if (valores.length < 2) return null;

  const minimo = Math.min(...valores);
  const maximo = Math.max(...valores);
  const amplitude = maximo - minimo || 1;

  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", height: altura, gap: 2 }}>
      {valores.map((valor, indice) => (
        <View
          key={indice}
          style={{
            flex: 1,
            // O piso de 3 px mantém a série legível quando todos os valores
            // são quase iguais: sem ele, uma sequência estável vira uma linha
            // reta de altura zero.
            height: Math.max(3, ((valor - minimo) / amplitude) * altura),
            borderRadius: 1,
            backgroundColor: cor ?? palette.accent,
            opacity: indice === valores.length - 1 ? 1 : 0.45,
          }}
        />
      ))}
    </View>
  );
}

/** Faixa de indicadores lado a lado, com divisória entre eles. */
export function FaixaDeIndicadores({ children }: { children: ReactNode }) {
  const palette = usePalette();

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "stretch",
        borderTopWidth: 1,
        borderTopColor: palette.line,
        paddingTop: space.md,
        marginTop: space.md,
      }}
    >
      {children}
    </View>
  );
}
