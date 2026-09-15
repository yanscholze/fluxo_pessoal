import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { User } from "phosphor-react-native";

import { Small, Texto } from "./primitives.tsx";
import { radius, type, usePalette } from "./theme.ts";

export function ProfileButton({ onPress, name }: { onPress: () => void; name?: string }) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Perfil e configurações"
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 2,
        borderColor: palette.lineStrong,
        backgroundColor: palette.surfaceInset,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: palette.accentWash }}>
        {name ? (
          <Texto style={[type.bodyStrong, { color: palette.ink }]}>{iniciais(name)}</Texto>
        ) : (
          <User size={20} color={palette.ink} weight="fill" />
        )}
      </View>
    </Pressable>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  onProfile,
  profileName,
  leading,
}: {
  title: string;
  subtitle?: string;
  onProfile: () => void;
  profileName?: string;
  leading?: ReactNode;
}) {
  const palette = usePalette();
  return (
    <View style={{ minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12 }}>
      {leading}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Texto style={[type.title, { color: palette.ink }]}>{title}</Texto>
        {subtitle ? <Small style={{ marginTop: 1 }}>{subtitle}</Small> : null}
      </View>
      <ProfileButton onPress={onProfile} name={profileName} />
    </View>
  );
}

export function IconBubble({ children, tone = "accent" }: { children: ReactNode; tone?: "accent" | "positive" | "negative" | "caution" | "muted" }) {
  const palette = usePalette();
  const backgroundColor = {
    accent: palette.accentWash,
    positive: palette.positiveWash,
    negative: palette.negativeWash,
    caution: palette.cautionWash,
    muted: palette.surfaceInset,
  }[tone];
  return (
    <View style={{ width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor }}>
      {children}
    </View>
  );
}

function iniciais(nome: string): string {
  return nome.trim().split(/\s+/).slice(0, 2).map((parte) => parte[0]?.toUpperCase() ?? "").join("") || "F";
}
