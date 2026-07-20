import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import { SQLiteProvider, useSQLiteContext } from "expo-sqlite";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, AppState, FlatList, Image, Pressable, SafeAreaView, ScrollView, Text, TextInput, useColorScheme, View } from "react-native";
import { financeApi, profileApi } from "./src/api";
import { AuthScreen } from "./src/components/AuthScreen";
import { ImportSheet } from "./src/components/ImportSheet";
import { PayInvoiceSheet } from "./src/components/PayInvoiceSheet";
import { PeriodSwitcher } from "./src/components/PeriodSwitcher";
import { TransactionComposer } from "./src/components/TransactionComposer";
import type { DashboardWidgetId } from "./src/dashboard";
import { migrateDatabase, readLocalSnapshot, readThemePreference, saveLocalTransaction, saveThemePreference } from "./src/database";
import { accountBalanceAtMonth, transactionsForMonth } from "./src/finance-period";
import { clearSession, getSession, logoutSession, updateStoredUser, type MobileSession } from "./src/session";
import { CardsScreen } from "./src/screens/CardsScreen";
import { DashboardScreen } from "./src/screens/DashboardScreen";
import { newId, synchronize } from "./src/sync";
import { makeStyles, palettes, type Palette, type ThemeName } from "./src/theme";
import type { FinanceCard, FinanceSnapshot, FinanceTransaction, ProfileResult } from "./src/types";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const emptySnapshot: FinanceSnapshot = { accounts: [], categories: [], cards: [], transactions: [], salaryRule: null, benefitRule: null, recurringRules: [], serverTime: "" };
const tabs = ["Início", "Lançamentos", "Cartões", "Contas", "Ajustes"] as const;
type Tab = typeof tabs[number];
type ImportMode = { kind: "history" } | { kind: "card"; card: FinanceCard; month: string };
type PayState = { card: FinanceCard; remaining: number } | null;

export default function App() {
  const systemTheme = useColorScheme();
  const theme: ThemeName = systemTheme === "light" ? "light" : "dark";
  const [session, setSession] = useState<MobileSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => { getSession().then(setSession).finally(() => setReady(true)); }, []);
  if (!ready) return <SafeAreaView style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: palettes[theme].bg }}><StatusBar style={theme === "dark" ? "light" : "dark"} /><ActivityIndicator color={palettes[theme].accent} /></SafeAreaView>;
  if (!session) return <AuthScreen theme={theme} onAuthenticated={setSession} />;
  return <SQLiteProvider key={session.user.id} databaseName={databaseNameFor(session.user.id)} onInit={migrateDatabase} useSuspense>
    <FluxoApp session={session} onSignedOut={() => setSession(null)} onUserUpdated={async (user) => { await updateStoredUser(user); setSession((current) => current ? { ...current, user } : current); }} />
  </SQLiteProvider>;
}

function databaseNameFor(userId: string) {
  let hash = 2166136261;
  for (let index = 0; index < userId.length; index += 1) hash = Math.imul(hash ^ userId.charCodeAt(index), 16777619);
  return `fluxo-${(hash >>> 0).toString(16)}.db`;
}

function FluxoApp({ session, onSignedOut, onUserUpdated }: { session: MobileSession; onSignedOut: () => void; onUserUpdated: (user: MobileSession["user"]) => Promise<void> }) {
  const db = useSQLiteContext(); const systemTheme = useColorScheme();
  const [theme, setTheme] = useState<ThemeName>(systemTheme === "light" ? "light" : "dark"); const palette = palettes[theme]; const styles = useMemo(() => makeStyles(palette), [palette]);
  const [themeReady, setThemeReady] = useState(false);
  const [snapshot, setSnapshot] = useState(emptySnapshot); const [connected, setConnected] = useState(true); const [syncState, setSyncState] = useState<"idle" | "syncing" | "offline" | "error">("idle");
  const [tab, setTab] = useState<Tab>("Início"); const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [composerOpen, setComposerOpen] = useState(false); const [composerCardId, setComposerCardId] = useState<string>(); const [importMode, setImportMode] = useState<ImportMode | null>(null); const [payState, setPayState] = useState<PayState>(null); const [message, setMessage] = useState("");
  const fade = useRef(new Animated.Value(1)).current;
  const refresh = useCallback(async () => setSnapshot(await readLocalSnapshot(db)), [db]);
  const syncNow = useCallback(async () => {
    const session = await getSession(); setConnected(Boolean(session)); if (!session) return;
    setSyncState("syncing");
    try { await synchronize(db); await refresh(); setSyncState("idle"); }
    catch (error) {
      if (error instanceof Error && error.message === "AUTH_REQUIRED") {
        setConnected(false);
        await clearSession();
        onSignedOut();
      }
      setSyncState("offline");
    }
  }, [db, onSignedOut, refresh]);

  useEffect(() => { readThemePreference(db).then((saved) => { if (saved) setTheme(saved); setThemeReady(true); }); }, [db]);
  useEffect(() => { if (themeReady) void saveThemePreference(db, theme); }, [db, theme, themeReady]);
  useEffect(() => { refresh().then(syncNow); const subscription = AppState.addEventListener("change", (state) => { if (state === "active") void syncNow(); }); return () => subscription.remove(); }, [refresh, syncNow]);
  useEffect(() => { fade.setValue(0); Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: true }).start(); }, [fade, tab]);

  async function signOut() {
    setMessage("");
    try {
      if (connected) await syncNow();
      await logoutSession();
      onSignedOut();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível sair da conta");
    }
  }
  function openComposer(card?: FinanceCard) { setComposerCardId(card?.id); setComposerOpen(true); }
  function openWidget(id: DashboardWidgetId) {
    if (["invoice", "cards"].includes(id)) setTab("Cartões");
    else if (["balance", "reserve", "goals", "assets", "investments"].includes(id)) setTab("Contas");
    else if (["flow", "categories", "recent", "calendar", "commitments", "subscriptions"].includes(id)) setTab("Lançamentos");
  }
  async function importItems(items: FinanceTransaction[]) {
    for (const item of items) {
      const card = item.cardId ? snapshot.cards.find((candidate) => candidate.id === item.cardId) : undefined;
      const enriched = card && item.type === "expense" ? rewardSnapshot(item, card) : item;
      await saveLocalTransaction(db, enriched, newId("mutation"));
    }
    await refresh(); void syncNow();
  }
  async function payInvoice(sourceAccount: string, amount: number) {
    if (!payState) return;
    await financeApi({ payInvoice: { id: newId("invoice-payment"), cardId: payState.card.id, invoiceMonth: selectedMonth, sourceAccount, amount } });
    await syncNow();
  }
  async function confirmIncome() { await financeApi({ confirmSalary: { month: selectedMonth } }); await syncNow(); }

  return <SafeAreaView style={styles.safe}>
    <StatusBar style={theme === "dark" ? "light" : "dark"} />
    <View style={styles.app}>
      <Animated.View style={[styles.content, { opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>
        {tab === "Início" && <DashboardScreen snapshot={snapshot} month={selectedMonth} onMonth={setSelectedMonth} userName={session.user.displayName} avatarData={session.user.avatarData} connected={connected} syncState={syncState} theme={theme} palette={palette} onTheme={() => setTheme(theme === "dark" ? "light" : "dark")} onSync={syncNow} onConfirmIncome={() => void confirmIncome()} onOpen={openWidget} onProfile={() => setTab("Ajustes")} />}
        {tab === "Lançamentos" && <TransactionsScreen snapshot={snapshot} month={selectedMonth} onMonth={setSelectedMonth} styles={styles} palette={palette} />}
        {tab === "Cartões" && <CardsScreen snapshot={snapshot} month={selectedMonth} onMonth={setSelectedMonth} palette={palette} onImport={(card) => setImportMode({ kind: "card", card, month: selectedMonth })} onPay={(card, remaining) => setPayState({ card, remaining })} onPurchase={openComposer} />}
        {tab === "Contas" && <AccountsScreen snapshot={snapshot} month={selectedMonth} onMonth={setSelectedMonth} styles={styles} palette={palette} />}
        {tab === "Ajustes" && <SettingsScreen user={session.user} connected={connected} theme={theme} message={message} onLogout={() => void signOut()} onTheme={() => setTheme(theme === "dark" ? "light" : "dark")} onImport={() => setImportMode({ kind: "history" })} onUserUpdated={onUserUpdated} styles={styles} />}
      </Animated.View>
      {tab !== "Ajustes" && <Pressable accessibilityRole="button" accessibilityLabel="Novo lançamento" style={({ pressed }) => [styles.fab, pressed && styles.pressed]} onPress={() => openComposer()}><Text style={styles.fabText}>＋</Text></Pressable>}
      <View style={styles.bottomNav}>{tabs.map((item) => <Pressable key={item} style={styles.navItem} onPress={() => setTab(item)}><View style={[styles.navDot, tab === item && styles.navDotActive]} /><Text style={[styles.navLabel, tab === item && styles.navLabelActive]}>{item}</Text></Pressable>)}</View>
    </View>
    <TransactionComposer open={composerOpen} snapshot={snapshot} initialCardId={composerCardId} palette={palette} onClose={() => setComposerOpen(false)} onSaved={async () => { setComposerOpen(false); await refresh(); void syncNow(); }} />
    {importMode && <ImportSheet key={`${importMode.kind}-${importMode.kind === "card" ? `${importMode.card.id}-${importMode.month}` : "history"}`} open mode={importMode} snapshot={snapshot} palette={palette} onClose={() => setImportMode(null)} onImport={importItems} />}
    <PayInvoiceSheet open={Boolean(payState)} card={payState?.card} month={selectedMonth} remaining={payState?.remaining ?? 0} accounts={snapshot.accounts} palette={palette} onClose={() => setPayState(null)} onPay={payInvoice} />
  </SafeAreaView>;
}

function TransactionsScreen({ snapshot, month, onMonth, styles, palette }: { snapshot: FinanceSnapshot; month: string; onMonth: (month: string) => void; styles: ReturnType<typeof makeStyles>; palette: Palette }) {
  const items = [...transactionsForMonth(snapshot.transactions, month)].sort((a, b) => b.date.localeCompare(a.date));
  return <View style={styles.screen}><ScreenHeader eyebrow="MOVIMENTAÇÕES" title="Lançamentos" styles={styles} /><PeriodSwitcher month={month} onChange={onMonth} palette={palette} /><FlatList data={items} keyExtractor={(item) => item.id} contentContainerStyle={styles.flatList} renderItem={({ item }) => <TransactionRow item={item} styles={styles} />} ListEmptyComponent={<Empty text="Nenhum lançamento nesta competência. Use o botão + ou importe seu histórico." styles={styles} />} /></View>;
}

function AccountsScreen({ snapshot, month, onMonth, styles, palette }: { snapshot: FinanceSnapshot; month: string; onMonth: (month: string) => void; styles: ReturnType<typeof makeStyles>; palette: Palette }) {
  const currentMonth = new Date().toISOString().slice(0, 7); const accounts = snapshot.accounts.filter((item) => item.kind !== "credit-card").map((account) => ({ ...account, historicalBalance: accountBalanceAtMonth(account, snapshot.transactions, month, currentMonth) }));
  return <ScrollView contentContainerStyle={styles.scroll}><ScreenHeader eyebrow="PATRIMÔNIO" title="Contas" styles={styles} /><PeriodSwitcher month={month} onChange={onMonth} palette={palette} /><View style={styles.accountGrid}>{accounts.map((account) => <View style={styles.accountCard} key={account.id}><View style={styles.accountMark}><Text style={styles.accountMarkText}>{account.name.slice(0, 1).toUpperCase()}</Text></View><Text style={styles.accountName}>{account.name}</Text><Text style={styles.accountBalance}>{currency.format(account.historicalBalance)}</Text><Text style={styles.accountKind}>{month < currentMonth ? `Saldo ao fim de ${month.slice(5, 7)}/${month.slice(0, 4)}` : account.kind === "benefit" ? "Benefício" : account.institution}</Text>{account.goal > 0 && <View style={{ marginTop: 10 }}><View style={{ height: 4, overflow: "hidden", borderRadius: 2, backgroundColor: palette.surface2 }}><View style={{ width: `${Math.min(100, account.historicalBalance / account.goal * 100)}%`, height: 4, backgroundColor: palette.accent }} /></View><Text style={styles.accountKind}>Meta {currency.format(account.goal)}</Text></View>}</View>)}</View>{!accounts.length && <Empty text="Suas contas aparecerão após a primeira sincronização." styles={styles} />}</ScrollView>;
}

function SettingsScreen({ user, connected, theme, message, onLogout, onTheme, onImport, onUserUpdated, styles }: { user: MobileSession["user"]; connected: boolean; theme: ThemeName; message: string; onLogout: () => void; onTheme: () => void; onImport: () => void; onUserUpdated: (user: MobileSession["user"]) => Promise<void>; styles: ReturnType<typeof makeStyles> }) {
  const [profile, setProfile] = useState<ProfileResult | null>(null); const [name, setName] = useState(user.displayName); const [feedback, setFeedback] = useState(""); const [currentPassword, setCurrentPassword] = useState(""); const [nextPassword, setNextPassword] = useState(""); const [busy, setBusy] = useState(false); const [localMessage, setLocalMessage] = useState("");
  useEffect(() => { profileApi().then((result) => { setProfile(result); setName(result.user.displayName); void onUserUpdated(result.user); }).catch((reason) => setLocalMessage(reason instanceof Error ? reason.message : "Não consegui carregar o perfil")); }, []);
  async function run(payload: Record<string, unknown>) { setBusy(true); setLocalMessage(""); try { const result = await profileApi(payload); if (result.requiresLogin) { await clearSession(); onLogout(); return null; } setProfile(result); await onUserUpdated({ id: result.user.id, email: result.user.email, displayName: result.user.displayName }); return result; } catch (reason) { setLocalMessage(reason instanceof Error ? reason.message : "Não consegui salvar"); return null; } finally { setBusy(false); } }
  async function pickAvatar() { const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: .35, base64: true }); const asset = result.assets?.[0]; if (!asset?.base64) return; const mime = asset.mimeType && ["image/jpeg", "image/png", "image/webp"].includes(asset.mimeType) ? asset.mimeType : "image/jpeg"; const data = `data:${mime};base64,${asset.base64}`; if (data.length > 420_000) { setLocalMessage("A foto ficou grande demais. Escolha uma imagem menor."); return; } if (await run({ action: "profile", avatarData: data })) setLocalMessage("Foto atualizada"); }
  const shown: ProfileResult["user"] = profile?.user ?? user; const initial = shown.displayName.slice(0, 1).toUpperCase(); const status: Record<string, string> = { new: "Nova", reviewing: "Em análise", planned: "Planejada", done: "Concluída" };
  return <ScrollView contentContainerStyle={styles.scroll}><ScreenHeader eyebrow="PREFERÊNCIAS" title="Ajustes" styles={styles} />
    <View style={styles.profileCard}>{shown.avatarData ? <Image source={{ uri: shown.avatarData }} style={styles.profileImage} /> : <View style={styles.profileImageFallback}><Text style={styles.profileInitial}>{initial}</Text></View>}<View style={styles.profileMain}><Text style={styles.settingTitle}>{shown.displayName}</Text><Text style={styles.settingCopy}>{connected ? "Sincronizado" : "Offline"} · conta protegida</Text></View><Pressable style={styles.profileEdit} onPress={() => void pickAvatar()}><Text style={styles.profileEditText}>Foto</Text></Pressable></View>
    <View style={styles.settingPanel}><Text style={styles.settingSection}>DADOS PESSOAIS</Text><TextInput value={name} onChangeText={setName} placeholder="Seu nome" placeholderTextColor="#71868c" style={styles.settingInput} /><Pressable disabled={busy || name.trim().length < 2} style={styles.settingAction} onPress={async () => { if (await run({ action: "profile", displayName: name })) setLocalMessage("Nome atualizado"); }}><Text style={styles.settingActionText}>Salvar nome</Text></Pressable></View>
    <Pressable style={styles.settingRow} onPress={onTheme}><View><Text style={styles.settingTitle}>Aparência</Text><Text style={styles.settingCopy}>Tema {theme === "dark" ? "escuro" : "claro branco"}</Text></View><Text style={styles.settingArrow}>›</Text></Pressable>
    <Pressable style={styles.settingRow} onPress={onImport}><View><Text style={styles.settingTitle}>Importar dados</Text><Text style={styles.settingCopy}>Traga CSV, OFX ou JSON do aplicativo antigo</Text></View><Text style={styles.settingArrow}>›</Text></Pressable>
    <View style={styles.settingRow}><View><Text style={styles.settingTitle}>Exportar dados</Text><Text style={styles.settingCopy}>A exportação completa está disponível no Fluxo Web</Text></View><Text style={styles.settingArrow}>↗</Text></View>
    <View style={styles.settingPanel}><Text style={styles.settingSection}>ALTERAR SENHA</Text><TextInput value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry placeholder="Senha atual" placeholderTextColor="#71868c" style={styles.settingInput} /><TextInput value={nextPassword} onChangeText={setNextPassword} secureTextEntry placeholder="Nova senha, mínimo 10 caracteres" placeholderTextColor="#71868c" style={styles.settingInput} /><Pressable disabled={busy || nextPassword.length < 10} style={styles.settingAction} onPress={() => void run({ action: "password", currentPassword, nextPassword })}><Text style={styles.settingActionText}>Atualizar senha</Text></Pressable></View>
    <View style={styles.settingPanel}><Text style={styles.settingSection}>RECOMENDAR MELHORIA</Text><TextInput value={feedback} onChangeText={setFeedback} multiline maxLength={2000} placeholder="O que deixaria o Fluxo melhor para você?" placeholderTextColor="#71868c" style={[styles.settingInput, styles.feedbackInput]} /><Pressable disabled={busy || feedback.trim().length < 5} style={styles.settingAction} onPress={async () => { if (await run({ action: "feedback", message: feedback })) { setFeedback(""); setLocalMessage("Recomendação enviada ao desenvolvedor"); } }}><Text style={styles.settingActionText}>Enviar recomendação</Text></Pressable>{profile?.feedback.slice(0, 3).map((item) => <View key={item.id} style={styles.feedbackHistory}><Text style={styles.feedbackStatus}>{status[item.status] || item.status}</Text><Text numberOfLines={2} style={styles.feedbackText}>{item.message}</Text></View>)}</View>
    {profile?.isDeveloper && <View style={styles.settingPanel}><Text style={styles.settingSection}>CAIXA DO DESENVOLVEDOR</Text>{profile.feedback.length ? profile.feedback.map((item) => <View key={item.id} style={styles.developerFeedback}><Text style={styles.settingTitle}>{item.senderName}</Text><Text style={styles.settingCopy}>{item.message}</Text><View style={styles.feedbackStatuses}>{(["new", "reviewing", "planned", "done"] as const).map((value) => <Pressable key={value} style={[styles.feedbackStatusButton, item.status === value && styles.feedbackStatusActive]} onPress={() => void run({ action: "feedback-status", feedbackId: item.id, status: value })}><Text style={styles.feedbackStatusButtonText}>{status[value]}</Text></Pressable>)}</View></View>) : <Text style={styles.settingCopy}>Nenhuma recomendação recebida.</Text>}</View>}
    <Pressable style={styles.settingRow} onPress={onLogout}><View><Text style={styles.settingTitle}>Sair e trocar de conta</Text><Text style={styles.settingCopy}>Será necessário entrar novamente com e-mail e senha</Text></View><Text style={styles.settingArrow}>›</Text></Pressable>{message || localMessage ? <Text style={styles.errorText}>{localMessage || message}</Text> : null}
  </ScrollView>;
}

function rewardSnapshot(item: FinanceTransaction, card: FinanceCard): FinanceTransaction {
  const usd = Math.max(card.manualUsdRate ?? 0, 0); const points = usd > 0 && card.pointsPerDollar > 0 ? item.amount / usd * card.pointsPerDollar : undefined; const cashback = card.cashbackPercent > 0 ? item.amount * card.cashbackPercent / 100 : undefined;
  return { ...item, rewardPoints: points, rewardCashback: cashback, rewardUsdRate: points ? usd : undefined };
}
function ScreenHeader({ eyebrow, title, styles }: { eyebrow: string; title: string; styles: ReturnType<typeof makeStyles> }) { return <View style={styles.screenHeader}><Text style={styles.eyebrow}>{eyebrow}</Text><Text style={styles.title}>{title}</Text></View>; }
function TransactionRow({ item, styles }: { item: FinanceTransaction; styles: ReturnType<typeof makeStyles> }) { return <View style={styles.transactionRow}><View style={[styles.transactionIcon, item.type === "income" && styles.transactionIncome]}><Text style={styles.transactionIconText}>{item.type === "income" ? "↓" : item.type === "transfer" ? "↔" : "↑"}</Text></View><View style={styles.transactionMain}><Text numberOfLines={1} style={styles.transactionName}>{item.description}</Text><Text style={styles.transactionMeta}>{item.category} · {new Date(`${item.date}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" })}{item.installments ? ` · ${item.installments}` : ""}{item.receiptUri ? " · cupom" : ""}{item.pendingSync ? " · pendente" : ""}</Text></View><Text style={[styles.transactionValue, item.type === "income" && styles.valueIncome]}>{item.type === "income" ? "+" : item.type === "transfer" ? "" : "−"}{currency.format(item.amount)}</Text></View>; }
function Empty({ text, styles }: { text: string; styles: ReturnType<typeof makeStyles> }) { return <View style={styles.empty}><Text style={styles.emptyIcon}>◎</Text><Text style={styles.emptyText}>{text}</Text></View>; }
