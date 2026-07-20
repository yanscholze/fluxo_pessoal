import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { loginWithPassword, registerWithPassword, type MobileSession } from "../session";
import { palettes, type Palette, type ThemeName } from "../theme";

type Mode = "login" | "register";

export function AuthScreen({ theme, onAuthenticated }: { theme: ThemeName; onAuthenticated: (session: MobileSession) => void }) {
  const palette = palettes[theme];
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const [mode, setMode] = useState<Mode>("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    if (!email.trim() || !password) {
      setError("Informe seu e-mail e sua senha.");
      return;
    }
    if (mode === "register" && displayName.trim().length < 2) {
      setError("Informe como você gostaria de ser chamado.");
      return;
    }
    if (password.length < 10) {
      setError("A senha precisa ter pelo menos 10 caracteres.");
      return;
    }
    setBusy(true);
    try {
      const session = mode === "register"
        ? await registerWithPassword(displayName.trim(), email.trim(), password)
        : await loginWithPassword(email.trim(), password);
      onAuthenticated(session);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível entrar no Fluxo.");
    } finally {
      setBusy(false);
    }
  }

  return <SafeAreaView style={styles.safe}>
    <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.brandMark}><Text style={styles.brandGlyph}>F</Text></View>
        <Text style={styles.brand}>FLUXO</Text>
        <Text style={styles.title}>{mode === "login" ? "Sua vida financeira, de volta ao lugar." : "Crie seu espaço financeiro."}</Text>
        <Text style={styles.copy}>{mode === "login" ? "Entre para consultar, decidir e agir com seus dados sempre protegidos." : "Cada conta é independente. Só você terá acesso aos seus saldos, cartões e lançamentos."}</Text>

        <View style={styles.card}>
          <View style={styles.modeTabs}>
            <Pressable style={[styles.modeTab, mode === "login" && styles.modeTabActive]} onPress={() => { setMode("login"); setError(""); }}>
              <Text style={[styles.modeText, mode === "login" && styles.modeTextActive]}>Entrar</Text>
            </Pressable>
            <Pressable style={[styles.modeTab, mode === "register" && styles.modeTabActive]} onPress={() => { setMode("register"); setError(""); }}>
              <Text style={[styles.modeText, mode === "register" && styles.modeTextActive]}>Criar conta</Text>
            </Pressable>
          </View>

          {mode === "register" && <>
            <Text style={styles.label}>SEU NOME</Text>
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Como devemos chamar você?"
              placeholderTextColor={palette.muted}
              autoCapitalize="words"
              textContentType="name"
              style={styles.input}
            />
          </>}
          <Text style={styles.label}>E-MAIL</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="voce@email.com"
            placeholderTextColor={palette.muted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="emailAddress"
            style={styles.input}
          />
          <Text style={styles.label}>SENHA</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Mínimo de 10 caracteres"
            placeholderTextColor={palette.muted}
            secureTextEntry
            autoCapitalize="none"
            textContentType={mode === "login" ? "password" : "newPassword"}
            style={styles.input}
            onSubmitEditing={() => void submit()}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable disabled={busy} style={({ pressed }) => [styles.submit, busy && styles.disabled, pressed && styles.pressed]} onPress={() => void submit()}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>{mode === "login" ? "Entrar no Fluxo" : "Criar minha conta"}</Text>}
          </Pressable>
        </View>
        <View style={styles.security}><Text style={styles.securityIcon}>◆</Text><Text style={styles.securityText}>Sessão protegida e dados completamente separados entre usuários.</Text></View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

function makeStyles(p: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: p.bg },
    scroll: { flexGrow: 1, justifyContent: "center", padding: 24, paddingVertical: 42, backgroundColor: p.bg },
    brandMark: { width: 54, height: 54, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: p.accent },
    brandGlyph: { color: "#fff", fontSize: 26, fontWeight: "900" },
    brand: { marginTop: 16, color: p.accent, fontSize: 10, fontWeight: "900", letterSpacing: 2.8 },
    title: { maxWidth: 430, marginTop: 9, color: p.text, fontSize: 32, lineHeight: 37, fontWeight: "900", letterSpacing: -1.1 },
    copy: { maxWidth: 430, marginTop: 11, color: p.muted, fontSize: 13, lineHeight: 20 },
    card: { marginTop: 28, padding: 18, borderRadius: 25, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface },
    modeTabs: { flexDirection: "row", gap: 7, marginBottom: 18, padding: 4, borderRadius: 14, backgroundColor: p.surface2 },
    modeTab: { flex: 1, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 11 },
    modeTabActive: { backgroundColor: p.accent },
    modeText: { color: p.muted, fontSize: 11, fontWeight: "900" },
    modeTextActive: { color: "#fff" },
    label: { marginTop: 5, marginBottom: 7, color: p.muted, fontSize: 8, fontWeight: "900", letterSpacing: 1.1 },
    input: { height: 54, marginBottom: 12, paddingHorizontal: 15, color: p.text, fontSize: 13, borderRadius: 15, borderWidth: 1, borderColor: p.border, backgroundColor: p.bg },
    error: { marginTop: 2, color: p.warning, fontSize: 10, lineHeight: 15 },
    submit: { height: 56, alignItems: "center", justifyContent: "center", marginTop: 10, borderRadius: 17, backgroundColor: p.accent },
    submitText: { color: "#fff", fontSize: 12, fontWeight: "900" },
    security: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 20, paddingHorizontal: 5 },
    securityIcon: { color: p.accent, fontSize: 10 },
    securityText: { flex: 1, color: p.muted, fontSize: 9, lineHeight: 14 },
    disabled: { opacity: .5 },
    pressed: { opacity: .84, transform: [{ scale: .985 }] },
  });
}
