import { Pressable, StyleSheet, Text, View } from "react-native";
import { monthOffset } from "../finance-period";
import type { Palette } from "../theme";

const monthFormatter = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });

function labelFor(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const value = monthFormatter.format(new Date(Date.UTC(year, monthNumber - 1, 1)));
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function PeriodSwitcher({ month, onChange, palette, compact = false }: { month: string; onChange: (month: string) => void; palette: Palette; compact?: boolean }) {
  const styles = makeStyles(palette);
  const now = new Date().toISOString().slice(0, 7);
  return <View style={[styles.row, compact && styles.compact]}>
    <Pressable accessibilityLabel="Mês anterior" style={({ pressed }) => [styles.button, pressed && styles.pressed]} onPress={() => onChange(monthOffset(month, -1))}><Text style={styles.arrow}>‹</Text></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={`Período selecionado: ${labelFor(month)}`} style={styles.label} onPress={() => onChange(now)}>
      <Text style={styles.month}>{labelFor(month)}</Text>
      <Text style={styles.context}>{month === now ? "MÊS ATUAL" : month < now ? "HISTÓRICO · TOQUE PARA VOLTAR" : "PLANEJAMENTO FUTURO"}</Text>
    </Pressable>
    <Pressable accessibilityLabel="Próximo mês" style={({ pressed }) => [styles.button, pressed && styles.pressed]} onPress={() => onChange(monthOffset(month, 1))}><Text style={styles.arrow}>›</Text></Pressable>
  </View>;
}

function makeStyles(p: Palette) { return StyleSheet.create({
  row: { height: 60, flexDirection: "row", alignItems: "center", marginBottom: 22, padding: 5, borderRadius: 19, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface },
  compact: { marginHorizontal: 20, marginTop: 8, marginBottom: 10 },
  button: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: p.surface2 },
  pressed: { opacity: .7, transform: [{ scale: .95 }] },
  arrow: { color: p.accent, fontSize: 28, lineHeight: 30 },
  label: { flex: 1, alignItems: "center", justifyContent: "center" },
  month: { color: p.text, fontSize: 13, fontWeight: "800" },
  context: { marginTop: 3, color: p.muted, fontSize: 7, fontWeight: "800", letterSpacing: .7 },
}); }
