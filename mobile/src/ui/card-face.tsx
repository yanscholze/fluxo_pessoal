import { Dimensions, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { cents } from "@fluxo/core/kernel/money.ts";
import type { CardSummary } from "../finance/derive.ts";
import { money } from "./format.ts";
import { Small, Texto } from "./primitives.tsx";
import { radius, type, usePalette } from "./theme.ts";

export const LARGURA_DA_FACE = Math.min(Dimensions.get("window").width - 40, 360);
const ALTURA_DA_FACE = Math.round(LARGURA_DA_FACE / 1.69);

export function CardFace({
  resumo,
  atenuada,
  titular,
}: {
  resumo: CardSummary;
  hoje: string;
  atenuada?: boolean;
  titular?: string;
}) {
  const palette = usePalette();
  const cor = resumo.card.color || palette.accent;
  const final = misturaEscura(cor);
  const finalDoId = resumo.card.id.replace(/\D/g, "").slice(-4).padStart(4, "•");

  return (
    <View
      style={{
        width: LARGURA_DA_FACE,
        height: ALTURA_DA_FACE,
        borderRadius: radius.lg,
        overflow: "hidden",
        opacity: atenuada ? 0.48 : 1,
        borderWidth: 1,
        borderColor: `${palette.ink}1f`,
      }}
    >
      <Svg width="100%" height="100%" style={{ position: "absolute" }}>
        <Defs>
          <LinearGradient id="face" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={cor} />
            <Stop offset="0.56" stopColor={palette.accentEdge} />
            <Stop offset="1" stopColor={final} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#face)" />
      </Svg>

      <View style={{ flex: 1, padding: 20, justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <View>
            <Small style={{ color: "#ffffffba" }}>{resumo.card.name}</Small>
            <Texto style={[type.figureSm, { color: "#fff", marginTop: 4 }]}>{resumo.available === null ? money(resumo.outstanding) : money(cents(resumo.available))}</Texto>
          </View>
          <View style={{ width: 43, height: 26 }}>
            <View style={{ position: "absolute", left: 1, width: 26, height: 26, borderRadius: 13, backgroundColor: "#ffffffd9" }} />
            <View style={{ position: "absolute", right: 1, width: 26, height: 26, borderRadius: 13, backgroundColor: "#ffffff78" }} />
          </View>
        </View>

        <Texto style={[type.bodySm, { color: "#fff", letterSpacing: 3.1 }]}>••••  ••••  ••••  {finalDoId}</Texto>

        <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
          <View style={{ flex: 1 }}>
            <Small style={{ color: "#ffffff8f", fontSize: 8, textTransform: "uppercase" }}>Titular</Small>
            <Texto numberOfLines={1} style={[type.bodySm, { color: "#fff", marginTop: 2, letterSpacing: 0.35, textTransform: "uppercase" }]}>{titular || "Fluxo"}</Texto>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Small style={{ color: "#ffffff8f", fontSize: 8, textTransform: "uppercase" }}>Validade</Small>
            <Texto style={[type.bodySm, { color: "#fff", marginTop: 2 }]}>••/••</Texto>
          </View>
        </View>
      </View>
    </View>
  );
}

function misturaEscura(hex: string): string {
  const limpo = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(limpo)) return "#17132f";
  const canais = [0, 2, 4].map((inicio) => Math.round(Number.parseInt(limpo.slice(inicio, inicio + 2), 16) * 0.28));
  return `#${canais.map((canal) => canal.toString(16).padStart(2, "0")).join("")}`;
}
