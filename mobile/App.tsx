import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import { SQLiteProvider, useSQLiteContext } from "expo-sqlite";
import { CreditCard, LayoutDashboard, Plane, Plus, ReceiptText, WalletCards } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, AppState, FlatList, Image, Linking, Modal, Pressable, ScrollView, Text, TextInput, useColorScheme, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { financeApi, notificationsApi, profileApi } from "./src/api";
import { AuthScreen } from "./src/components/AuthScreen";
import { ImportSheet } from "./src/components/ImportSheet";
import { PayInvoiceSheet } from "./src/components/PayInvoiceSheet";
import { PeriodSwitcher } from "./src/components/PeriodSwitcher";
import { TransactionComposer } from "./src/components/TransactionComposer";
import type { DashboardWidgetId } from "./src/dashboard";
import { migrateDatabase, readLocalSnapshot, readThemePreference, saveLocalTransaction, saveThemePreference } from "./src/database";
import { accountBalanceAtMonth, transactionsForMonth } from "./src/finance-period";
import { API_ORIGIN, clearSession, getSession, logoutSession, updateStoredUser, type MobileSession } from "./src/session";
import { isNotificationAccessEnabled, isNotificationBridgeAvailable, openNotificationAccessSettings, syncNotificationBridgeCredentials } from "./src/notification-bridge";
import { CardsScreen } from "./src/screens/CardsScreen";
import { DashboardScreen } from "./src/screens/DashboardScreen";
import { newId, synchronize } from "./src/sync";
import { makeStyles, palettes, type Palette, type ThemeName } from "./src/theme";
import { Notifications, registerForPushNotifications, unregisterPushNotifications } from "./src/notifications";
import type { AppNotification, FinanceCard, FinanceSnapshot, FinanceTransaction, NotificationsResult, ProfileResult } from "./src/types";
import { databaseNameFor } from "./src/database-name";
import { ApiResponseError } from "./src/http";
import { updateAndroidWidgets } from "./src/android-widgets";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const emptySnapshot: FinanceSnapshot = { accounts: [], categories: [], cards: [], trips: [], transactions: [], rewardRedemptions: [], salaryRule: null, benefitRule: null, recurringRules: [], serverTime: "" };
const tabs = ["Início", "Lançamentos", "Contas", "Cartões", "Viagens"] as const;
const tabIcons = { "Início": LayoutDashboard, "Lançamentos": ReceiptText, "Contas": WalletCards, "Cartões": CreditCard, "Viagens": Plane } as const;
type Tab = typeof tabs[number] | "Ajustes";
type ImportMode = { kind: "history" } | { kind: "card"; card: FinanceCard; month: string };
type PayState = { card: FinanceCard; remaining: number } | null;

export default function App() {
  return <SafeAreaProvider><AppRoot /></SafeAreaProvider>;
}

function AppRoot() {
  const systemTheme = useColorScheme();
  const theme: ThemeName = systemTheme === "light" ? "light" : "dark";
  const [session, setSession] = useState<MobileSession | null>(null);
  const [ready, setReady] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  useEffect(() => { getSession().then((value) => { setSession(value); if (value) void syncNotificationBridgeCredentials(API_ORIGIN, value.deviceToken); }).finally(() => setReady(true)); }, []);
  useEffect(() => {
    const accept = (url: string | null) => { if (url?.startsWith("fluxo://new-transaction")) setPendingAction("new-transaction"); };
    void Linking.getInitialURL().then(accept);
    const subscription = Linking.addEventListener("url", ({ url }) => accept(url));
    return () => subscription.remove();
  }, []);
  if (!ready) return <SafeAreaView style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: palettes[theme].bg }}><StatusBar style={theme === "dark" ? "light" : "dark"} /><ActivityIndicator color={palettes[theme].accent} /></SafeAreaView>;
  if (!session) return <AuthScreen theme={theme} onAuthenticated={setSession} />;
  return <SQLiteProvider key={session.user.id} databaseName={databaseNameFor(session.user.id)} onInit={migrateDatabase} useSuspense>
    <FluxoApp session={session} pendingAction={pendingAction} onActionHandled={() => setPendingAction(null)} onSignedOut={() => setSession(null)} onUserUpdated={async (user) => { await updateStoredUser(user); setSession((current) => current ? { ...current, user } : current); }} />
  </SQLiteProvider>;
}

function FluxoApp({ session, pendingAction, onActionHandled, onSignedOut, onUserUpdated }: { session: MobileSession; pendingAction: string | null; onActionHandled: () => void; onSignedOut: () => void; onUserUpdated: (user: MobileSession["user"]) => Promise<void> }) {
  const db = useSQLiteContext(); const systemTheme = useColorScheme();
  const [theme, setTheme] = useState<ThemeName>(systemTheme === "light" ? "light" : "dark"); const palette = palettes[theme]; const styles = useMemo(() => makeStyles(palette), [palette]);
  const [themeReady, setThemeReady] = useState(false);
  const [snapshot, setSnapshot] = useState(emptySnapshot); const [connected, setConnected] = useState(false); const [syncState, setSyncState] = useState<"idle" | "syncing" | "offline" | "error">("syncing"); const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [tab, setTab] = useState<Tab>("Início"); const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [composerOpen, setComposerOpen] = useState(false); const [composerCardId, setComposerCardId] = useState<string>(); const [importMode, setImportMode] = useState<ImportMode | null>(null); const [payState, setPayState] = useState<PayState>(null); const [message, setMessage] = useState("");
  const [notificationState, setNotificationState] = useState<NotificationsResult>({ notifications: [], unreadCount: 0 }); const [notificationsOpen, setNotificationsOpen] = useState(false);
  const fade = useRef(new Animated.Value(1)).current;
  const refresh = useCallback(async () => {
    const next = await readLocalSnapshot(db);
    setSnapshot(next);
    void updateAndroidWidgets(next).catch(() => undefined);
  }, [db]);
  const syncNow = useCallback(async () => {
    const session = await getSession(); setConnected(Boolean(session)); if (!session) return;
    setSyncState("syncing");
    try { await synchronize(db); await refresh(); setConnected(true); setLastSyncAt(new Date()); setSyncState("idle"); }
    catch (error) {
      setConnected(false);
      if ((error instanceof Error && error.message === "AUTH_REQUIRED") || (error instanceof ApiResponseError && error.code === "SITE_GATEWAY_REQUIRED")) {
        setConnected(false);
        await clearSession();
        onSignedOut();
        return;
      }
      setSyncState("offline");
    }
  }, [db, onSignedOut, refresh]);
  const refreshNotifications = useCallback(async () => {
    try { setNotificationState(await notificationsApi()); } catch { /* sincroniza novamente quando houver conexão */ }
  }, []);

  useEffect(() => { readThemePreference(db).then((saved) => { if (saved) setTheme(saved); setThemeReady(true); }); }, [db]);
  useEffect(() => { if (themeReady) void saveThemePreference(db, theme); }, [db, theme, themeReady]);
  useEffect(() => {
    void refresh().then(syncNow);
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") void syncNow(); });
    const interval = setInterval(() => { if (AppState.currentState === "active") void syncNow(); }, 60_000);
    return () => { subscription.remove(); clearInterval(interval); };
  }, [refresh, syncNow]);
  useEffect(() => { fade.setValue(0); Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: true }).start(); }, [fade, tab]);
  useEffect(() => {
    void registerForPushNotifications().catch(() => undefined);
    void refreshNotifications();
    const received = Notifications.addNotificationReceivedListener(() => void refreshNotifications());
    const opened = Notifications.addNotificationResponseReceivedListener((response) => {
      const view = response.notification.request.content.data?.view;
      if (view === "settings") setTab("Ajustes");
      setNotificationsOpen(true); void refreshNotifications();
    });
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      if (response.notification.request.content.data?.view === "settings") setTab("Ajustes");
      setNotificationsOpen(true);
    });
    return () => { received.remove(); opened.remove(); };
  }, [refreshNotifications]);
  useEffect(() => { void Notifications.setBadgeCountAsync(notificationState.unreadCount).catch(() => undefined); }, [notificationState.unreadCount]);
  useEffect(() => {
    if (pendingAction !== "new-transaction") return;
    setTab("Início"); setComposerCardId(undefined); setComposerOpen(true); onActionHandled();
  }, [onActionHandled, pendingAction]);

  async function signOut() {
    setMessage("");
    try {
      if (connected) await syncNow();
      await unregisterPushNotifications();
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
  async function redeemReward(cardId: string, kind: "points" | "cashback", amount: number, account?: string) {
    await financeApi({ rewardRedemption: { id: newId("reward-redemption"), cardId, kind, amount, account, date: new Date().toISOString().slice(0, 10) } });
    await syncNow();
  }
  async function confirmIncome() { await financeApi({ confirmSalary: { month: selectedMonth } }); await syncNow(); }
  async function readNotification(item: AppNotification) {
    if (!item.readAt) setNotificationState(await notificationsApi({ action: "mark-read", id: item.id }));
    if (item.feedbackId) { setNotificationsOpen(false); setTab("Ajustes"); }
  }

  return <SafeAreaView style={styles.safe}>
    <StatusBar style={theme === "dark" ? "light" : "dark"} />
    <View style={styles.app}>
      <Animated.View style={[styles.content, { opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>
        {tab === "Início" && <DashboardScreen snapshot={snapshot} month={selectedMonth} onMonth={setSelectedMonth} userName={session.user.displayName} avatarData={session.user.avatarData} connected={connected} syncState={syncState} lastSyncAt={lastSyncAt} unreadCount={notificationState.unreadCount} theme={theme} palette={palette} onTheme={() => setTheme(theme === "dark" ? "light" : "dark")} onSync={syncNow} onNotifications={() => setNotificationsOpen(true)} onConfirmIncome={() => void confirmIncome()} onOpen={openWidget} onProfile={() => setTab("Ajustes")} />}
        {tab === "Lançamentos" && <TransactionsScreen snapshot={snapshot} month={selectedMonth} onMonth={setSelectedMonth} styles={styles} palette={palette} />}
        {tab === "Cartões" && <CardsScreen snapshot={snapshot} month={selectedMonth} onMonth={setSelectedMonth} palette={palette} onImport={(card) => setImportMode({ kind: "card", card, month: selectedMonth })} onPay={(card, remaining) => setPayState({ card, remaining })} onPurchase={openComposer} onRedeem={redeemReward} />}
        {tab === "Contas" && <AccountsScreen snapshot={snapshot} month={selectedMonth} onMonth={setSelectedMonth} styles={styles} palette={palette} />}
        {tab === "Viagens" && <TravelScreen snapshot={snapshot} styles={styles} />}
        {tab === "Ajustes" && <SettingsScreen user={session.user} connected={connected} theme={theme} message={message} onLogout={() => void signOut()} onTheme={() => setTheme(theme === "dark" ? "light" : "dark")} onImport={() => setImportMode({ kind: "history" })} onUserUpdated={onUserUpdated} styles={styles} />}
      </Animated.View>
      {tab !== "Ajustes" && <Pressable accessibilityRole="button" accessibilityLabel="Novo lançamento" style={({ pressed }) => [styles.fab, pressed && styles.pressed]} onPress={() => openComposer()}><Plus color="#fff" size={27} strokeWidth={2.4} /></Pressable>}
      <View style={styles.bottomNav}>{tabs.map((item) => { const Icon = tabIcons[item]; const active = tab === item; return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={item} key={item} style={[styles.navItem, active && styles.navItemActive]} onPress={() => setTab(item)}><View style={[styles.navIndicator, active && styles.navIndicatorActive]} /><Icon color={active ? palette.accent : palette.muted} size={20} strokeWidth={active ? 2.4 : 1.9} /><Text style={[styles.navLabel, active && styles.navLabelActive]}>{item}</Text></Pressable>; })}</View>
    </View>
    <TransactionComposer open={composerOpen} snapshot={snapshot} initialCardId={composerCardId} palette={palette} onClose={() => setComposerOpen(false)} onSaved={async () => { setComposerOpen(false); await refresh(); void syncNow(); }} />
    {importMode && <ImportSheet key={`${importMode.kind}-${importMode.kind === "card" ? `${importMode.card.id}-${importMode.month}` : "history"}`} open mode={importMode} snapshot={snapshot} palette={palette} onClose={() => setImportMode(null)} onImport={importItems} />}
    <PayInvoiceSheet open={Boolean(payState)} card={payState?.card} month={selectedMonth} remaining={payState?.remaining ?? 0} accounts={snapshot.accounts} palette={palette} onClose={() => setPayState(null)} onPay={payInvoice} />
    <Modal visible={notificationsOpen} transparent animationType="fade" onRequestClose={() => setNotificationsOpen(false)}>
      <View style={styles.notificationLayer}><Pressable style={styles.notificationBackdrop} onPress={() => setNotificationsOpen(false)} /><View style={styles.notificationSheet}>
        <View style={styles.notificationHeader}><View><Text style={styles.notificationTitle}>Notificações</Text><Text style={styles.notificationSubtitle}>{notificationState.unreadCount ? `${notificationState.unreadCount} não lida${notificationState.unreadCount === 1 ? "" : "s"}` : "Você está em dia"}</Text></View>{notificationState.unreadCount > 0 && <Pressable onPress={async () => setNotificationState(await notificationsApi({ action: "mark-all-read" }))}><Text style={styles.notificationReadAll}>Marcar todas</Text></Pressable>}</View>
        <ScrollView style={styles.notificationList}>{notificationState.notifications.length ? notificationState.notifications.map((item) => <Pressable key={item.id} style={[styles.notificationItem, !item.readAt && styles.notificationItemUnread]} onPress={() => void readNotification(item)}><View style={[styles.notificationDot, item.readAt && styles.notificationDotRead]} /><View style={styles.notificationMain}><Text style={styles.notificationItemTitle}>{item.title}</Text><Text style={styles.notificationMessage}>{item.message}</Text><Text style={styles.notificationDate}>{new Date(item.createdAt).toLocaleString("pt-BR")}</Text></View></Pressable>) : <View style={styles.notificationEmpty}><Text style={styles.notificationEmptyIcon}>✓</Text><Text style={styles.notificationMessage}>Nenhuma notificação por enquanto.</Text></View>}</ScrollView>
        <Pressable style={styles.notificationClose} onPress={() => setNotificationsOpen(false)}><Text style={styles.notificationCloseText}>Fechar</Text></Pressable>
      </View></View>
    </Modal>
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

function TravelScreen({ snapshot, styles }: { snapshot: FinanceSnapshot; styles: ReturnType<typeof makeStyles> }) {
  const [selectedId, setSelectedId] = useState(snapshot.trips[0]?.id ?? "");
  useEffect(() => { if (!snapshot.trips.some((item) => item.id === selectedId)) setSelectedId(snapshot.trips[0]?.id ?? ""); }, [selectedId, snapshot.trips]);
  const trip = snapshot.trips.find((item) => item.id === selectedId) ?? snapshot.trips[0];
  const items = trip ? snapshot.transactions.filter((item) => item.tripId === trip.id && item.type === "expense" && item.status !== "planned") : [];
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  const categoryTotals = [...items.reduce((map, item) => map.set(item.category, (map.get(item.category) ?? 0) + item.amount), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  return <ScrollView contentContainerStyle={styles.scroll}><ScreenHeader eyebrow="MODO VIAGEM" title="Viagens" styles={styles} />
    {snapshot.trips.length ? <><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tripChips}>{snapshot.trips.map((item) => <Pressable key={item.id} style={[styles.tripChip, item.id === trip?.id && styles.tripChipActive]} onPress={() => setSelectedId(item.id)}><Text style={[styles.tripChipText, item.id === trip?.id && styles.tripChipTextActive]}>{item.name}</Text></Pressable>)}</ScrollView>
      {trip && <><View style={styles.tripHero}><Text style={styles.tripEyebrow}>{trip.startDate.split("-").reverse().join("/")} — {trip.endDate.split("-").reverse().join("/")}</Text><Text style={styles.tripName}>{trip.name}</Text><Text style={styles.tripTotal}>{currency.format(total)}</Text><Text style={styles.tripConverted}>≈ {(total / Math.max(trip.exchangeRate, .000001)).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} {trip.currency} · 1 {trip.currency} = {currency.format(trip.exchangeRate)}</Text></View>
        <View style={styles.settingPanel}><Text style={styles.settingSection}>GASTOS POR CATEGORIA</Text>{categoryTotals.map(([name, value]) => <View key={name} style={styles.tripCategory}><Text style={styles.settingTitle}>{name}</Text><Text style={styles.tripCategoryValue}>{currency.format(value)}</Text></View>)}{!categoryTotals.length && <Text style={styles.settingCopy}>Nenhum gasto marcado nesta viagem.</Text>}</View>
        <View style={styles.settingPanel}><Text style={styles.settingSection}>LANÇAMENTOS DA VIAGEM</Text>{[...items].sort((a, b) => b.date.localeCompare(a.date)).map((item) => <TransactionRow key={item.id} item={item} styles={styles} />)}{!items.length && <Text style={styles.settingCopy}>Use a tag da viagem ao registrar uma despesa.</Text>}</View></>}
    </> : <Empty text="Crie sua viagem no Fluxo Web. Depois ela aparecerá aqui para marcar e acompanhar os gastos." styles={styles} />}
  </ScrollView>;
}

function NotificationAccessRow({ styles }: { styles: ReturnType<typeof makeStyles> }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    if (!isNotificationBridgeAvailable()) { setEnabled(null); return; }
    const check = () => { void isNotificationAccessEnabled().then(setEnabled); };
    check();
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") check(); });
    return () => subscription.remove();
  }, []);
  if (!isNotificationBridgeAvailable()) return null;
  return <Pressable style={styles.settingRow} onPress={openNotificationAccessSettings}>
    <View><Text style={styles.settingTitle}>Lançamentos automáticos por notificação</Text><Text style={styles.settingCopy}>{enabled ? "Ativado — lendo notificações do Nubank, Caju, Mercado Pago e XP" : "Desativado — toque para liberar o acesso a notificações"}</Text></View>
    <Text style={styles.settingArrow}>{enabled ? "✓" : "›"}</Text>
  </Pressable>;
}

function SettingsScreen({ user, connected, theme, message, onLogout, onTheme, onImport, onUserUpdated, styles }: { user: MobileSession["user"]; connected: boolean; theme: ThemeName; message: string; onLogout: () => void; onTheme: () => void; onImport: () => void; onUserUpdated: (user: MobileSession["user"]) => Promise<void>; styles: ReturnType<typeof makeStyles> }) {
  const [profile, setProfile] = useState<ProfileResult | null>(null); const [name, setName] = useState(user.displayName); const [feedback, setFeedback] = useState(""); const [feedbackComments, setFeedbackComments] = useState<Record<string, string>>({}); const [currentPassword, setCurrentPassword] = useState(""); const [nextPassword, setNextPassword] = useState(""); const [busy, setBusy] = useState(false); const [localMessage, setLocalMessage] = useState("");
  useEffect(() => { profileApi().then((result) => { setProfile(result); setName(result.user.displayName); setFeedbackComments(Object.fromEntries(result.feedback.map((item) => [item.id, item.developerComment ?? ""]))); void onUserUpdated(result.user); }).catch((reason) => setLocalMessage(reason instanceof Error ? reason.message : "Não consegui carregar o perfil")); }, []);
  async function run(payload: Record<string, unknown>) { setBusy(true); setLocalMessage(""); try { const result = await profileApi(payload); if (result.requiresLogin) { await clearSession(); onLogout(); return null; } setProfile(result); setFeedbackComments(Object.fromEntries(result.feedback.map((item) => [item.id, item.developerComment ?? ""]))); await onUserUpdated(result.user); return result; } catch (reason) { setLocalMessage(reason instanceof Error ? reason.message : "Não consegui salvar"); return null; } finally { setBusy(false); } }
  async function pickAvatar() { const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: .35, base64: true }); const asset = result.assets?.[0]; if (!asset?.base64) return; const mime = asset.mimeType && ["image/jpeg", "image/png", "image/webp"].includes(asset.mimeType) ? asset.mimeType : "image/jpeg"; const data = `data:${mime};base64,${asset.base64}`; if (data.length > 420_000) { setLocalMessage("A foto ficou grande demais. Escolha uma imagem menor."); return; } if (await run({ action: "profile", avatarData: data })) setLocalMessage("Foto atualizada"); }
  const shown: ProfileResult["user"] = profile?.user ?? user; const initial = shown.displayName.slice(0, 1).toUpperCase(); const status: Record<string, string> = { new: "Nova", reviewing: "Em análise", planned: "Planejada", done: "Concluída" };
  return <ScrollView contentContainerStyle={styles.scroll}><ScreenHeader eyebrow="PREFERÊNCIAS" title="Ajustes" styles={styles} />
    <View style={styles.profileCard}>{shown.avatarData ? <Image source={{ uri: shown.avatarData }} style={styles.profileImage} /> : <View style={styles.profileImageFallback}><Text style={styles.profileInitial}>{initial}</Text></View>}<View style={styles.profileMain}><Text style={styles.settingTitle}>{shown.displayName}</Text><Text style={styles.settingCopy}>{connected ? "Sincronizado" : "Offline"} · conta protegida</Text></View><Pressable style={styles.profileEdit} onPress={() => void pickAvatar()}><Text style={styles.profileEditText}>Foto</Text></Pressable></View>
    <View style={styles.settingPanel}><Text style={styles.settingSection}>DADOS PESSOAIS</Text><TextInput value={name} onChangeText={setName} placeholder="Seu nome" placeholderTextColor="#71868c" style={styles.settingInput} /><Pressable disabled={busy || name.trim().length < 2} style={styles.settingAction} onPress={async () => { if (await run({ action: "profile", displayName: name })) setLocalMessage("Nome atualizado"); }}><Text style={styles.settingActionText}>Salvar nome</Text></Pressable></View>
    <Pressable style={styles.settingRow} onPress={onTheme}><View><Text style={styles.settingTitle}>Aparência</Text><Text style={styles.settingCopy}>Tema {theme === "dark" ? "escuro" : "claro branco"}</Text></View><Text style={styles.settingArrow}>›</Text></Pressable>
    <Pressable style={styles.settingRow} onPress={onImport}><View><Text style={styles.settingTitle}>Importar dados</Text><Text style={styles.settingCopy}>Traga CSV, OFX ou JSON do aplicativo antigo</Text></View><Text style={styles.settingArrow}>›</Text></Pressable>
    <NotificationAccessRow styles={styles} />
    <View style={styles.settingRow}><View><Text style={styles.settingTitle}>Exportar dados</Text><Text style={styles.settingCopy}>A exportação completa está disponível no Fluxo Web</Text></View><Text style={styles.settingArrow}>↗</Text></View>
    <View style={styles.settingPanel}><Text style={styles.settingSection}>ALTERAR SENHA</Text><TextInput value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry placeholder="Senha atual" placeholderTextColor="#71868c" style={styles.settingInput} /><TextInput value={nextPassword} onChangeText={setNextPassword} secureTextEntry placeholder="Nova senha, mínimo 10 caracteres" placeholderTextColor="#71868c" style={styles.settingInput} /><Pressable disabled={busy || nextPassword.length < 10} style={styles.settingAction} onPress={() => void run({ action: "password", currentPassword, nextPassword })}><Text style={styles.settingActionText}>Atualizar senha</Text></Pressable></View>
    <View style={styles.settingPanel}><Text style={styles.settingSection}>RECOMENDAR MELHORIA</Text><TextInput value={feedback} onChangeText={setFeedback} multiline maxLength={2000} placeholder="O que deixaria o Fluxo melhor para você?" placeholderTextColor="#71868c" style={[styles.settingInput, styles.feedbackInput]} /><Pressable disabled={busy || feedback.trim().length < 5} style={styles.settingAction} onPress={async () => { if (await run({ action: "feedback", message: feedback })) { setFeedback(""); setLocalMessage("Recomendação enviada ao desenvolvedor"); } }}><Text style={styles.settingActionText}>Enviar recomendação</Text></Pressable>{profile?.feedback.slice(0, 3).map((item) => <View key={item.id} style={styles.feedbackHistory}><Text style={styles.feedbackStatus}>{status[item.status] || item.status}</Text><View style={{ flex: 1 }}><Text numberOfLines={2} style={styles.feedbackText}>{item.message}</Text>{item.developerComment ? <Text style={styles.feedbackComment}>↳ {item.developerComment}</Text> : null}</View></View>)}</View>
    {profile?.isDeveloper && <View style={styles.settingPanel}><Text style={styles.settingSection}>CAIXA DO DESENVOLVEDOR</Text>{profile.feedback.length ? profile.feedback.map((item) => <View key={item.id} style={styles.developerFeedback}><Text style={styles.settingTitle}>{item.senderName}</Text><Text style={styles.settingCopy}>{item.message}</Text><TextInput value={feedbackComments[item.id] ?? ""} onChangeText={(value) => setFeedbackComments((current) => ({ ...current, [item.id]: value }))} multiline maxLength={2000} placeholder="Comentário ou retorno para o usuário" placeholderTextColor="#71868c" style={[styles.settingInput, styles.feedbackInput]} /><View style={styles.feedbackStatuses}>{(["new", "reviewing", "planned", "done"] as const).map((value) => <Pressable key={value} style={[styles.feedbackStatusButton, item.status === value && styles.feedbackStatusActive]} onPress={() => void run({ action: "feedback-status", feedbackId: item.id, status: value, developerComment: feedbackComments[item.id] ?? "" })}><Text style={styles.feedbackStatusButtonText}>{status[value]}</Text></Pressable>)}</View><Pressable style={styles.settingAction} onPress={() => void run({ action: "feedback-status", feedbackId: item.id, status: item.status, developerComment: feedbackComments[item.id] ?? "" }).then((result) => result && setLocalMessage("Comentário salvo e usuário notificado"))}><Text style={styles.settingActionText}>Salvar comentário</Text></Pressable></View>) : <Text style={styles.settingCopy}>Nenhuma recomendação recebida.</Text>}</View>}
    <Pressable style={styles.settingRow} onPress={onLogout}><View><Text style={styles.settingTitle}>Sair e trocar de conta</Text><Text style={styles.settingCopy}>Será necessário entrar novamente com e-mail e senha</Text></View><Text style={styles.settingArrow}>›</Text></Pressable>{message || localMessage ? <Text style={styles.errorText}>{localMessage || message}</Text> : null}
  </ScrollView>;
}

function rewardSnapshot(item: FinanceTransaction, card: FinanceCard): FinanceTransaction {
  const usd = Math.max(card.manualUsdRate ?? 0, 0); const points = usd > 0 && card.pointsPerDollar > 0 ? item.amount / usd * card.pointsPerDollar : undefined; const cashback = card.cashbackPercent > 0 ? item.amount * card.cashbackPercent / 100 : undefined;
  return { ...item, rewardPoints: points, rewardCashback: cashback, rewardUsdRate: points ? usd : undefined };
}
function ScreenHeader({ eyebrow, title, styles }: { eyebrow: string; title: string; styles: ReturnType<typeof makeStyles> }) { return <View style={styles.screenHeader}><Text style={styles.eyebrow}>{eyebrow}</Text><Text style={styles.title}>{title}</Text></View>; }
function TransactionRow({ item, styles }: { item: FinanceTransaction; styles: ReturnType<typeof makeStyles> }) { return <View style={styles.transactionRow}><View style={[styles.transactionIcon, item.type === "income" && styles.transactionIncome]}><Text style={styles.transactionIconText}>{item.type === "income" ? "↓" : item.type === "transfer" ? "↔" : "↑"}</Text></View><View style={styles.transactionMain}><Text numberOfLines={1} style={styles.transactionName}>{item.description}</Text><Text style={styles.transactionMeta}>{item.type === "transfer" && item.destinationAccount ? `${item.account} → ${item.destinationAccount}` : item.category} · {new Date(`${item.date}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" })}{item.installments ? ` · ${item.installments}` : ""}{item.receiptUri ? " · cupom" : ""}{item.pendingSync ? " · pendente" : ""}</Text></View><Text style={[styles.transactionValue, item.type === "income" && styles.valueIncome]}>{item.type === "income" ? "+" : item.type === "transfer" ? "" : "−"}{currency.format(item.amount)}</Text></View>; }
function Empty({ text, styles }: { text: string; styles: ReturnType<typeof makeStyles> }) { return <View style={styles.empty}><Text style={styles.emptyIcon}>◎</Text><Text style={styles.emptyText}>{text}</Text></View>; }
