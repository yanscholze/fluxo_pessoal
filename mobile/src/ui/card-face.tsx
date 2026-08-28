/**
 * A face do cartão.
 *
 * A mesma peça do site, redesenhada para React Native. Existe por um motivo
 * prático, não decorativo: numa carteira com quatro cartões, ler "Nubank
 * Roxinho" numa lista de texto é mais lento do que reconhecer a cor. O cérebro
 * identifica o objeto físico antes de ler o nome — e no celular, onde a lista
 * cabe menos, isso pesa mais ainda.
 *
 * A proporção é a do cartão real (85,6 × 53,98 mm). Fugir dela produz um
 * retângulo que *lembra* um cartão sem ser um, que é pior do que não ter.
 */

import { View } from "react-native";

import type { CardSummary } from "../finance/derive.ts";
import { competence as formatCompetence, money, relativeDate } from "./format.ts";
import { Texto } from "./primitives.tsx";
import { elevation, radius, space, type } from "./theme.ts";

/** Largura fixa: o carrossel precisa de um passo previsível para o snap. */
export const LARGURA_DA_FACE = 288;
const ALTURA_DA_FACE = Math.round(LARGURA_DA_FACE / 1.586);

export function CardFace({
  resumo,
  hoje,
  atenuada,
}: {
  resumo: CardSummary;
  hoje: string;
  atenuada?: boolean;
}) {
  const { card } = resumo;
  const estourado = resumo.available !== null && resumo.available <= 0;

  return (
    <View
      style={[
        {
          width: LARGURA_DA_FACE,
          height: ALTURA_DA_FACE,
          borderRadius: radius.xl,
          backgroundColor: card.color ?? "#1f2937",
          padding: space.lg,
          justifyContent: "space-between",
          overflow: "hidden",
          opacity: atenuada ? 0.55 : 1,
          transform: [{ scale: atenuada ? 0.94 : 1 }],
        },
        elevation.float,
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: space.md }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Texto numberOfLines={1} style={[type.bodyStrong, { color: "#fff" }]}>
            {card.name}
          </Texto>
          <Texto style={[type.caption, { color: "rgba(255,255,255,0.7)", marginTop: 2 }]}>
            {card.kind === "credit" ? "Crédito" : "Débito"}
          </Texto>
        </View>

        {estourado ? (
          <View
            style={{
              backgroundColor: "rgba(0,0,0,0.35)",
              borderRadius: radius.sm,
              paddingHorizontal: space.sm,
              paddingVertical: 2,
            }}
          >
            <Texto style={[type.label, { color: "#fff" }]}>SEM LIMITE</Texto>
          </View>
        ) : null}
      </View>

      {/* O chip. Pequeno detalhe, mas é o que faz o retângulo virar cartão. */}
      <View
        style={{
          width: 34,
          height: 25,
          borderRadius: radius.xs,
          backgroundColor: "#d9c48f",
          borderWidth: 1,
          borderColor: "rgba(0,0,0,0.15)",
        }}
      />

      <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: space.md }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Texto style={[type.bodySm, { color: "rgba(255,255,255,0.9)", letterSpacing: 2.5 }]}>
            •••• ••••
          </Texto>
          <Texto style={[type.caption, { color: "rgba(255,255,255,0.65)", marginTop: 3 }]}>
            {card.kind === "credit"
              ? `fecha ${relativeDate(resumo.dueDate, hoje as never)}`
              : "sai direto do saldo"}
          </Texto>
        </View>

        {card.kind === "credit" ? (
          <View style={{ alignItems: "flex-end" }}>
            <Texto style={[type.label, { color: "rgba(255,255,255,0.6)" }]}>
              {formatCompetence(resumo.competence).toUpperCase()}
            </Texto>
            <Texto style={[type.bodyStrong, { color: "#fff" }]}>{money(resumo.outstanding)}</Texto>
          </View>
        ) : null}
      </View>
    </View>
  );
}
