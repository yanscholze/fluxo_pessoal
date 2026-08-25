/**
 * Peças visuais reaproveitadas.
 *
 * Nenhuma delas conhece dinheiro, competência ou saldo — recebem texto pronto.
 * Componente que calcula é a origem da divergência que este projeto veio
 * corrigir; aqui a fronteira é literal: se precisa de `Cents`, não é primitiva.
 */

import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import { radius, space, type, usePalette } from "./theme.ts";

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const palette = usePalette();
  return (
    <View
      style={[
        {
          backgroundColor: palette.surface,
          borderColor: palette.line,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: radius.card,
          padding: space.lg,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Label({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const palette = usePalette();
  return (
    <Text style={[type.label, { color: palette.inkSubtle, textTransform: "uppercase" }, style]}>
      {children}
    </Text>
  );
}

export function Figure({
  children,
  tone = "neutral",
  small,
}: {
  children: ReactNode;
  tone?: "neutral" | "positive" | "negative" | "caution";
  small?: boolean;
}) {
  const palette = usePalette();
  const cor =
    tone === "positive"
      ? palette.positive
      : tone === "negative"
        ? palette.negative
        : tone === "caution"
          ? palette.caution
          : palette.ink;

  return <Text style={[small ? type.figureSmall : type.figure, { color: cor }]}>{children}</Text>;
}

export function Body({
  children,
  muted,
  strong,
  style,
  numberOfLines,
}: {
  children: ReactNode;
  muted?: boolean;
  strong?: boolean;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const palette = usePalette();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[strong ? type.bodyStrong : type.body, { color: muted ? palette.inkMuted : palette.ink }, style]}
    >
      {children}
    </Text>
  );
}

export function Small({
  children,
  tone = "subtle",
  style,
  numberOfLines,
}: {
  children: ReactNode;
  tone?: "subtle" | "muted" | "positive" | "negative" | "caution";
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const palette = usePalette();
  const cor = {
    subtle: palette.inkSubtle,
    muted: palette.inkMuted,
    positive: palette.positive,
    negative: palette.negative,
    caution: palette.caution,
  }[tone];

  return (
    <Text numberOfLines={numberOfLines} style={[type.small, { color: cor }, style]}>
      {children}
    </Text>
  );
}

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled,
  busy,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = usePalette();

  const fundo = {
    primary: palette.accent,
    secondary: palette.surfaceSunken,
    ghost: "transparent",
    danger: palette.negativeWash,
  }[variant];

  const texto = {
    primary: palette.accentInk,
    secondary: palette.ink,
    ghost: palette.accent,
    danger: palette.negative,
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled || busy) }}
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        {
          backgroundColor: fundo,
          borderRadius: radius.control,
          paddingVertical: 14,
          paddingHorizontal: space.lg,
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          borderWidth: variant === "ghost" ? StyleSheet.hairlineWidth : 0,
          borderColor: palette.line,
        },
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={texto} /> : <Text style={[type.bodyStrong, { color: texto }]}>{label}</Text>}
    </Pressable>
  );
}

export function Row({
  children,
  onPress,
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = usePalette();
  const conteudo = (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: space.md,
          paddingVertical: space.md,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: palette.line,
        },
        style,
      ]}
    >
      {children}
    </View>
  );

  if (!onPress) return conteudo;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      {conteudo}
    </Pressable>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={{ paddingVertical: space.xl, alignItems: "center", gap: space.xs }}>
      <Body muted>{title}</Body>
      {hint ? <Small style={{ textAlign: "center" }}>{hint}</Small> : null}
    </View>
  );
}

/** Aviso curto. Usado para estado (offline, conflito), nunca para decoração. */
export function Notice({
  tone,
  children,
}: {
  tone: "info" | "positive" | "negative" | "caution";
  children: ReactNode;
}) {
  const palette = usePalette();
  const fundo = {
    info: palette.accentWash,
    positive: palette.positiveWash,
    negative: palette.negativeWash,
    caution: palette.cautionWash,
  }[tone];
  const cor = {
    info: palette.accent,
    positive: palette.positive,
    negative: palette.negative,
    caution: palette.caution,
  }[tone];

  return (
    <View style={{ backgroundColor: fundo, borderRadius: radius.control, padding: space.md }}>
      <Text style={[type.small, { color: cor }]}>{children}</Text>
    </View>
  );
}

export function Divider() {
  const palette = usePalette();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: palette.line }} />;
}
