import { CreditCard } from "phosphor-react-native";
import { View } from "react-native";

import type { CardSummary } from "../finance/derive.ts";
import { money } from "./format.ts";
import { Texto } from "./primitives.tsx";
import { elevation, radius, usePalette } from "./theme.ts";

export const LARGURA_DA_FACE = 302;
const ALTURA_DA_FACE = Math.round(LARGURA_DA_FACE / 1.58);

export function CardFace({ resumo, atenuada }: { resumo: CardSummary; hoje: string; atenuada?: boolean }) {
  const palette = usePalette();
  const { card } = resumo;
  const cor = card.color ?? palette.accent;

  return (
    <View
      style={[
        {
          width: LARGURA_DA_FACE,
          height: ALTURA_DA_FACE,
          borderRadius: radius.lg,
          backgroundColor: palette.surface,
          padding: 18,
          justifyContent: "space-between",
          overflow: "hidden",
          opacity: atenuada ? 0.55 : 1,
          transform: [{ scale: atenuada ? 0.94 : 1 }],
          borderWidth: 1,
          borderColor: palette.line,
        },
        elevation.float,
      ]}
    >
      <View style={{ position: "absolute", right: -80, top: -90, width: 260, height: 260, borderRadius: 130, backgroundColor: cor, opacity: 0.16 }} />
      <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, backgroundColor: cor }} />

      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Texto style={{ color: cor, fontSize: 11, lineHeight: 13, fontWeight: "500", letterSpacing: 1.75 }}>
            {card.kind === "credit" ? "CRÉDITO" : "DÉBITO"}
          </Texto>
          <Texto numberOfLines={1} style={{ color: palette.ink, fontSize: 19, lineHeight: 23, fontWeight: "500", letterSpacing: -0.34, marginTop: 8 }}>
            {card.name}
          </Texto>
        </View>
        <CreditCard size={22} color={palette.inkSubtle} />
      </View>

      <View>
        <Texto style={{ color: palette.inkMuted, fontSize: 15, lineHeight: 17, fontWeight: "500", letterSpacing: 2.7 }}>••••</Texto>
        <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 11, marginTop: 14 }}>
          <View>
            <Texto style={{ color: palette.inkSubtle, fontSize: 11, lineHeight: 14 }}>Fatura atual</Texto>
            <Texto style={{ color: palette.ink, fontSize: 24, lineHeight: 26, fontWeight: "500", letterSpacing: -0.67, marginTop: 3 }}>
              {card.kind === "credit" ? money(resumo.outstanding) : "Débito"}
            </Texto>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Texto style={{ color: palette.inkSubtle, fontSize: 11, lineHeight: 14 }}>Disponível</Texto>
            <Texto style={{ color: palette.inkMuted, fontSize: 14, lineHeight: 16, fontWeight: "500", marginTop: 3 }}>
              {resumo.available === null ? "—" : money(resumo.available)}
            </Texto>
          </View>
        </View>
      </View>
    </View>
  );
}
