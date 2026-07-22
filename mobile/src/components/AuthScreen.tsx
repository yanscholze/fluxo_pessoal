import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { connectWithBrowser, type MobileSession } from "../session";
import { palettes, type Palette, type ThemeName } from "../theme";

export function AuthScreen({ theme, onAuthenticated }: { theme: ThemeName; onAuthenticated: (session: MobileSession) => void }) {
  const palette = palettes[theme];
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function connect() {
    setBusy(true); setError("");
    try { onAuthenticated(await connectWithBrowser()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível conectar este celular"); }
    finally { setBusy(false); }
  }

  return <SafeAreaView style={styles.safe}><View style={styles.content}>
    <View style={styles.brandMark}><Text style={styles.brandGlyph}>F</Text></View>
    <Text style={styles.brand}>FLUXO</Text>
    <Text style={styles.title}>Suas finanças, sempre por perto.</Text>
    <Text style={styles.copy}>Conecte este aparelho pela página segura do Fluxo. Sua senha fica no navegador e o aplicativo recebe apenas uma sessão revogável.</Text>
    <View style={styles.card}>
      <View style={styles.phone}><Text style={styles.phoneIcon}>◇</Text></View>
      <Text style={styles.cardTitle}>Conectar este celular</Text>
      <Text style={styles.cardCopy}>O navegador abrirá o Fluxo para você confirmar sua conta e voltará ao aplicativo automaticamente.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable disabled={busy} style={({ pressed }) => [styles.submit, busy && styles.disabled, pressed && styles.pressed]} onPress={() => void connect()}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Conectar com segurança  →</Text>}
      </Pressable>
    </View>
    <Text style={styles.security}>◆ Sessão criptografada e separada por aparelho</Text>
  </View></SafeAreaView>;
}

function makeStyles(p: Palette) { return StyleSheet.create({
  safe: { flex: 1, backgroundColor: p.bg }, content: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: p.bg },
  brandMark: { width: 54, height: 54, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: p.accent }, brandGlyph: { color: "#fff", fontSize: 26, fontWeight: "900" },
  brand: { marginTop: 16, color: p.accent, fontSize: 10, fontWeight: "900", letterSpacing: 2.8 }, title: { maxWidth: 430, marginTop: 9, color: p.text, fontSize: 32, lineHeight: 37, fontWeight: "900", letterSpacing: -1.1 }, copy: { maxWidth: 430, marginTop: 11, color: p.muted, fontSize: 13, lineHeight: 20 },
  card: { alignItems: "center", marginTop: 28, padding: 22, borderRadius: 25, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface }, phone: { width: 52, height: 52, alignItems: "center", justifyContent: "center", borderRadius: 17, backgroundColor: p.accentSoft }, phoneIcon: { color: p.accent, fontSize: 25, fontWeight: "900" }, cardTitle: { marginTop: 15, color: p.text, fontSize: 19, fontWeight: "900" }, cardCopy: { marginTop: 7, color: p.muted, fontSize: 11, lineHeight: 17, textAlign: "center" },
  error: { marginTop: 12, color: p.warning, fontSize: 10, lineHeight: 15, textAlign: "center" }, submit: { width: "100%", height: 56, alignItems: "center", justifyContent: "center", marginTop: 18, borderRadius: 17, backgroundColor: p.accent }, submitText: { color: "#fff", fontSize: 12, fontWeight: "900" }, security: { marginTop: 18, color: p.muted, fontSize: 9, textAlign: "center" }, disabled: { opacity: .5 }, pressed: { opacity: .84, transform: [{ scale: .985 }] },
}); }
