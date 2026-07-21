import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Image } from "react-native";
import { financialCoachApi } from "../api";
import { PeriodSwitcher } from "../components/PeriodSwitcher";
import {
  DASHBOARD_WIDGET_LABELS, DEFAULT_DASHBOARD_LAYOUT, moveDashboardWidget, nextWidgetSize,
  updateDashboardWidget, type DashboardWidgetId, type DashboardWidgetPreference,
} from "../dashboard";
import { readDashboardLayout, saveDashboardLayout } from "../database";
import { accountBalanceAtMonth, contextualTip, flowTotals, monthOffset, transactionsForCommitmentMonth, transactionsForInvoiceMonth, transactionsForMonth } from "../finance-period";
import type { Palette, ThemeName } from "../theme";
import type { FinanceSnapshot, FinanceTransaction, FinancialCoachResult } from "../types";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

type Props = {
  snapshot: FinanceSnapshot;
  month: string;
  onMonth: (month: string) => void;
  userName: string;
  avatarData?: string | null;
  connected: boolean;
  syncState: string;
  unreadCount: number;
  theme: ThemeName;
  palette: Palette;
  onTheme: () => void;
  onSync: () => void;
  onNotifications: () => void;
  onConfirmIncome: () => void;
  onOpen: (widget: DashboardWidgetId) => void;
  onProfile: () => void;
};

export function DashboardScreen(props: Props) {
  const { snapshot, month, onMonth, userName, avatarData, connected, syncState, unreadCount, theme, palette, onTheme, onSync, onNotifications, onConfirmIncome, onOpen, onProfile } = props;
  const db = useSQLiteContext();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const [layout, setLayout] = useState<DashboardWidgetPreference[]>(DEFAULT_DASHBOARD_LAYOUT);
  const [layoutReady, setLayoutReady] = useState(false);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [advice, setAdvice] = useState<FinancialCoachResult | null>(null);
  const [asking, setAsking] = useState(false);
  const [assistantError, setAssistantError] = useState("");

  useEffect(() => { readDashboardLayout(db).then((saved) => { setLayout(saved); setLayoutReady(true); }); }, [db]);
  useEffect(() => { if (layoutReady) void saveDashboardLayout(db, layout); }, [db, layout, layoutReady]);

  const todayMonth = new Date().toISOString().slice(0, 7);
  const monthItems = useMemo(() => transactionsForMonth(snapshot.transactions, month), [month, snapshot.transactions]);
  const totals = useMemo(() => flowTotals(monthItems), [monthItems]);
  const accountBalances = useMemo(() => snapshot.accounts
    .filter((account) => account.kind !== "credit-card")
    .map((account) => ({ account, balance: accountBalanceAtMonth(account, snapshot.transactions, month, todayMonth) })), [month, snapshot.accounts, snapshot.transactions, todayMonth]);
  const totalBalance = accountBalances.reduce((sum, item) => sum + item.balance, 0);
  const invoiceRows = transactionsForInvoiceMonth(snapshot.transactions, month);
  const invoiceItems = invoiceRows.filter((item) => item.type === "expense" && item.paymentMethod === "credit");
  const invoiceGross = invoiceItems.reduce((sum, item) => sum + item.amount, 0);
  const invoicePaid = invoiceRows.filter((item) => item.type === "transfer" && item.source === "invoice-payment").reduce((sum, item) => sum + item.amount, 0);
  const invoice = Math.max(0, invoiceGross - invoicePaid);
  const nextCommitments = transactionsForCommitmentMonth(snapshot.transactions, monthOffset(month, 1)).filter((item) => item.type === "expense").reduce((sum, item) => sum + item.amount, 0);
  const reserve = accountBalances.filter(({ account }) => /reserva|emerg/i.test(`${account.name} ${account.kind}`)).reduce((sum, item) => sum + item.balance, 0);
  const essentialNames = new Set(snapshot.categories.filter((item) => item.essential).map((item) => item.name));
  const essentialMonths = [month, monthOffset(month, -1), monthOffset(month, -2)].map((key) => transactionsForMonth(snapshot.transactions, key).filter((item) => item.type === "expense" && essentialNames.has(item.category)).reduce((sum, item) => sum + item.amount, 0));
  const essentialAverage = essentialMonths.reduce((sum, value) => sum + value, 0) / Math.max(1, essentialMonths.filter(Boolean).length);
  const reserveTarget = essentialAverage * 6;
  const categoryTotals = [...monthItems.filter((item) => item.type === "expense").reduce((map, item) => map.set(item.category, (map.get(item.category) ?? 0) + item.amount), new Map<string, number>())]
    .sort((a, b) => b[1] - a[1]);
  const recent = [...monthItems].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  const tip = contextualTip(snapshot, month);
  const salaryConfirmed = Boolean(snapshot.salaryRule?.lastConfirmedMonth === month || monthItems.some((item) => item.fingerprint === `recurring:${snapshot.salaryRule?.id}:${month}`));
  const benefitConfirmed = !snapshot.benefitRule?.active || Boolean(snapshot.benefitRule.lastConfirmedMonth === month || monthItems.some((item) => item.fingerprint === `recurring:${snapshot.benefitRule?.id}:${month}`));
  const viewData: WidgetData = { snapshot, month, monthItems, totals, totalBalance, invoice, invoiceItems, nextCommitments, reserve, reserveTarget, categoryTotals, recent, accountBalances };

  const visible = layout.filter((item) => item.visible);
  const hidden = layout.filter((item) => !item.visible);
  const move = (id: DashboardWidgetId, offset: number) => setLayout((current) => moveDashboardWidget(current, id, offset));
  async function askFlow(prompt = question) {
    const value = prompt.trim(); if (value.length < 3 || asking) return;
    setQuestion(value); setAsking(true); setAssistantError("");
    try { const result = await financialCoachApi(value, month); setAdvice(result.advice); }
    catch (reason) { setAssistantError(reason instanceof Error ? reason.message : "Não consegui analisar seus dados"); }
    finally { setAsking(false); }
  }

  return <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
    <View style={styles.header}>
      <View><Text style={styles.eyebrow}>VISÃO GERAL</Text><Text style={styles.title}>Olá, {userName.split(/\s+/)[0]}</Text></View>
      <View style={styles.headerActions}>
        <Pressable style={styles.iconButton} onPress={onTheme}><Text style={styles.iconText}>{theme === "dark" ? "☀" : "☾"}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`${unreadCount} notificações não lidas`} style={[styles.iconButton, unreadCount > 0 && styles.notificationButtonActive]} onPress={onNotifications}><Text style={[styles.iconText, unreadCount > 0 && styles.notificationIconActive]}>♢</Text>{unreadCount > 0 && <View style={styles.notificationBadge}><Text style={styles.notificationBadgeText}>{unreadCount > 9 ? "9+" : unreadCount}</Text></View>}</Pressable>
        <Pressable style={styles.syncButton} onPress={onSync}>{syncState === "syncing" ? <ActivityIndicator size="small" color={palette.accent} /> : <Text style={styles.syncText}>{connected ? syncState === "offline" ? "Offline" : "Sincronizado" : "Sessão expirada"}</Text>}</Pressable>
        <Pressable style={styles.profileButton} onPress={onProfile}>{avatarData ? <Image source={{ uri: avatarData }} style={styles.profileButtonImage} /> : <Text style={styles.profileButtonText}>{userName.slice(0, 1).toUpperCase()}</Text>}</Pressable>
      </View>
    </View>
    <Pressable style={styles.tip} onPress={() => setAssistantOpen(true)}>
      <View style={styles.tipIcon}><Text style={styles.tipIconText}>✦</Text></View>
      <View style={styles.tipMain}><Text style={styles.tipLabel}>DICA DO FLUXO</Text><Text style={styles.tipText}>{advice?.summary || tip}</Text><Text style={styles.tipAsk}>Toque para conversar com o assistente</Text></View><Text style={styles.tipArrow}>›</Text>
    </Pressable>
    <PeriodSwitcher month={month} onChange={onMonth} palette={palette} />
    {snapshot.salaryRule && !(salaryConfirmed && benefitConfirmed) && <View style={styles.incomeBanner}><View style={styles.incomeIcon}><Text style={styles.incomeIconText}>↓</Text></View><View style={styles.incomeMain}><Text style={styles.incomeTitle}>Salário e VA previstos</Text><Text style={styles.incomeCopy}>{currency.format(snapshot.salaryRule.projectedAmount ?? snapshot.salaryRule.amount)}{snapshot.benefitRule?.active ? ` + ${currency.format(snapshot.benefitRule.projectedAmount ?? snapshot.benefitRule.amount)} de VA` : ""}</Text></View><Pressable style={styles.incomeButton} onPress={onConfirmIncome}><Text style={styles.incomeButtonText}>Confirmar</Text></Pressable></View>}
    {editing && <View style={styles.editBanner}><View><Text style={styles.editTitle}>Organizando seu Dashboard</Text><Text style={styles.editCopy}>Arraste, redimensione ou remova. Tudo é salvo automaticamente.</Text></View><Pressable style={styles.doneButton} onPress={() => setEditing(false)}><Text style={styles.doneText}>Concluir</Text></Pressable></View>}
    <View style={styles.grid}>
      {visible.map((preference) => <DraggableWidget key={preference.id} preference={preference} editing={editing} palette={palette} onEdit={() => setEditing(true)} onMove={move} onSize={() => setLayout((current) => updateDashboardWidget(current, preference.id, { size: nextWidgetSize(preference.size) }))} onRemove={() => setLayout((current) => updateDashboardWidget(current, preference.id, { visible: false }))}>
        <DashboardWidget preference={preference} data={viewData} palette={palette} onOpen={() => onOpen(preference.id)} />
      </DraggableWidget>)}
    </View>
    {editing && <Pressable style={styles.addButton} onPress={() => setAdding(true)}><Text style={styles.addText}>＋ Adicionar widget</Text></Pressable>}
    <Text style={styles.hint}>Mantenha um widget pressionado para personalizar sua tela.</Text>
    <Modal visible={adding} transparent animationType="fade" onRequestClose={() => setAdding(false)}>
      <View style={styles.modalLayer}><Pressable style={styles.backdrop} onPress={() => setAdding(false)} /><View style={styles.sheet}><Text style={styles.sheetTitle}>Adicionar widget</Text><Text style={styles.sheetCopy}>Escolha quais informações ajudam você a decidir melhor.</Text><ScrollView style={styles.sheetList}>{hidden.map((item) => <Pressable key={item.id} style={styles.widgetChoice} onPress={() => { setLayout((current) => updateDashboardWidget(current, item.id, { visible: true })); setAdding(false); }}><View><Text style={styles.choiceTitle}>{DASHBOARD_WIDGET_LABELS[item.id]}</Text><Text style={styles.choiceCopy}>Tamanho inicial {item.size}</Text></View><Text style={styles.choicePlus}>＋</Text></Pressable>)}{!hidden.length && <Text style={styles.allAdded}>Todos os widgets já estão no Dashboard.</Text>}</ScrollView><Pressable style={styles.closeButton} onPress={() => setAdding(false)}><Text style={styles.closeText}>Fechar</Text></Pressable></View></View>
    </Modal>
    <Modal visible={assistantOpen} transparent animationType="slide" onRequestClose={() => setAssistantOpen(false)}>
      <View style={styles.modalLayer}><Pressable style={styles.backdrop} onPress={() => setAssistantOpen(false)} /><View style={[styles.sheet, styles.aiSheet]}><View style={styles.aiHeader}><View style={styles.aiOrb}><Text style={styles.aiOrbText}>✦</Text></View><View style={styles.aiHeaderMain}><Text style={styles.sheetTitle}>Assistente Fluxo</Text><Text style={styles.sheetCopy}>Pergunte usando os dados financeiros deste período.</Text></View><Pressable onPress={() => setAssistantOpen(false)}><Text style={styles.aiClose}>×</Text></Pressable></View>
        <View style={styles.aiSuggestions}>{["Quanto posso gastar agora?", "Minha reserva está saudável?", "O que merece atenção neste mês?"].map((item) => <Pressable key={item} style={styles.aiSuggestion} onPress={() => void askFlow(item)}><Text style={styles.aiSuggestionText}>{item}</Text></Pressable>)}</View>
        <ScrollView style={styles.aiAnswerScroll}>{advice ? <View style={styles.aiAnswer}><Text style={styles.aiAnswerLabel}>ANÁLISE DO FLUXO</Text><Text style={styles.aiAnswerTitle}>{advice.summary}</Text><Text style={styles.aiAnswerText}>{advice.answer}</Text>{advice.actions.map((action) => <View key={`${action.label}-${action.reason}`} style={[styles.aiAction, action.priority === "high" && styles.aiActionHigh]}><Text style={styles.aiActionTitle}>{action.label}</Text><Text style={styles.aiActionText}>{action.reason}</Text></View>)}{advice.warnings.map((item) => <Text key={item} style={styles.aiWarning}>⚠ {item}</Text>)}</View> : <View style={styles.aiEmpty}><Text style={styles.aiEmptyIcon}>◎</Text><Text style={styles.aiEmptyText}>{tip}</Text></View>}{assistantError ? <Text style={styles.aiWarning}>{assistantError}</Text> : null}</ScrollView>
        <TextInput value={question} onChangeText={setQuestion} placeholder="Pergunte sobre seus gastos, fatura ou reserva" placeholderTextColor={palette.muted} style={styles.aiInput} multiline maxLength={600} /><Pressable disabled={asking || question.trim().length < 3} style={[styles.aiSend, (asking || question.trim().length < 3) && { opacity: .45 }]} onPress={() => void askFlow()}>{asking ? <ActivityIndicator color="#fff" /> : <Text style={styles.aiSendText}>Perguntar à IA  →</Text>}</Pressable>
      </View></View>
    </Modal>
  </ScrollView>;
}

type WidgetData = {
  snapshot: FinanceSnapshot; month: string; monthItems: FinanceTransaction[]; totals: ReturnType<typeof flowTotals>;
  totalBalance: number; invoice: number; invoiceItems: FinanceTransaction[]; nextCommitments: number;
  reserve: number; reserveTarget: number; categoryTotals: Array<[string, number]>; recent: FinanceTransaction[];
  accountBalances: Array<{ account: FinanceSnapshot["accounts"][number]; balance: number }>;
};

function DraggableWidget({ preference, editing, palette, onEdit, onMove, onSize, onRemove, children }: { preference: DashboardWidgetPreference; editing: boolean; palette: Palette; onEdit: () => void; onMove: (id: DashboardWidgetId, offset: number) => void; onSize: () => void; onRemove: () => void; children: React.ReactNode }) {
  const drag = useRef(new Animated.ValueXY()).current;
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, gesture) => editing && Math.abs(gesture.dy) > 8,
    onPanResponderMove: Animated.event([null, { dx: drag.x, dy: drag.y }], { useNativeDriver: false }),
    onPanResponderRelease: (_, gesture) => {
      const offset = Math.round(gesture.dy / 110) || (gesture.dy > 20 ? 1 : gesture.dy < -20 ? -1 : 0);
      Animated.spring(drag, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start();
      if (offset) onMove(preference.id, offset);
    },
    onPanResponderTerminate: () => Animated.spring(drag, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start(),
  }), [drag, editing, onMove, preference.id]);
  const width = preference.size === "P" ? "48.3%" : "100%";
  return <Animated.View {...responder.panHandlers} style={{ width, zIndex: editing ? 2 : 0, transform: [{ translateX: drag.x }, { translateY: drag.y }, { scale: editing ? .985 : 1 }] }}>
    <Pressable delayLongPress={380} onLongPress={onEdit}>{children}</Pressable>
    {editing && <View style={{ flexDirection: "row", gap: 6, marginTop: -15, marginBottom: 9, alignSelf: "center" }}>
      <Pressable style={[editChip(palette), { backgroundColor: palette.accent }]} onPress={onSize}><Text style={{ color: "#fff", fontSize: 9, fontWeight: "900" }}>{preference.size}</Text></Pressable>
      <Pressable style={editChip(palette)} onPress={onRemove}><Text style={{ color: palette.text, fontSize: 12, fontWeight: "900" }}>×</Text></Pressable>
    </View>}
  </Animated.View>;
}

function editChip(p: Palette) { return { width: 34, height: 28, alignItems: "center" as const, justifyContent: "center" as const, borderRadius: 10, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface }; }

function DashboardWidget({ preference, data, palette, onOpen }: { preference: DashboardWidgetPreference; data: WidgetData; palette: Palette; onOpen: () => void }) {
  const styles = widgetStyles(palette); const compact = preference.size === "P";
  const { snapshot, month, monthItems, totals, totalBalance, invoice, invoiceItems, nextCommitments, reserve, reserveTarget, categoryTotals, recent, accountBalances } = data;
  if (preference.id === "free") return <Pressable style={styles.hero} onPress={onOpen}><Text style={styles.heroLabel}>LIVRE PARA GASTAR</Text><Text style={styles.heroValue}>{currency.format(totals.free)}</Text><Text style={styles.heroAnswer}>{totals.free >= 0 ? "Depois de entradas e compromissos confirmados" : "Seu mês já está no negativo"}</Text><View style={styles.heroDivider} /><View style={styles.heroMeta}><Text style={styles.heroMetaText}>Entradas  {currency.format(totals.income)}</Text><Text style={styles.heroMetaText}>Saídas  {currency.format(totals.expenses)}</Text></View></Pressable>;
  const shell = (title: string, value: string, answer: string, body?: React.ReactNode) => <Pressable style={[styles.card, compact && styles.cardCompact]} onPress={onOpen}><Text style={styles.label}>{title.toUpperCase()}</Text><Text numberOfLines={1} adjustsFontSizeToFit style={[styles.value, compact && styles.valueCompact]}>{value}</Text><Text numberOfLines={compact ? 2 : 3} style={styles.answer}>{answer}</Text>{body}</Pressable>;
  switch (preference.id) {
    case "balance": return shell("Saldo total", currency.format(totalBalance), `${accountBalances.length} saldos neste momento`);
    case "flow": {
      const max = Math.max(totals.income, totals.expenses, 1);
      return shell("Fluxo do mês", currency.format(totals.free), totals.free >= 0 ? "Entrou mais dinheiro do que saiu" : "As saídas superaram as entradas", !compact && <View style={styles.bars}><View style={styles.barRow}><Text style={styles.barName}>Entradas</Text><View style={styles.track}><View style={[styles.fill, { width: `${totals.income / max * 100}%`, backgroundColor: palette.success }]} /></View></View><View style={styles.barRow}><Text style={styles.barName}>Saídas</Text><View style={styles.track}><View style={[styles.fill, { width: `${totals.expenses / max * 100}%`, backgroundColor: palette.warning }]} /></View></View></View>);
    }
    case "invoice": {
      const limit = snapshot.cards.filter((item) => item.kind === "credit").reduce((sum, item) => sum + item.limit, 0);
      return shell("Fatura atual", currency.format(invoice), `${invoiceItems.length} compras · ${limit ? Math.round(invoice / limit * 100) : 0}% do limite`);
    }
    case "commitments": return shell("Próximos compromissos", currency.format(nextCommitments), nextCommitments ? "Já comprometidos no próximo mês" : "Nenhum gasto futuro registrado");
    case "reserve": {
      const health = reserveTarget ? Math.min(100, reserve / reserveTarget * 100) : 0;
      return shell("Reserva", currency.format(reserve), reserveTarget ? `${Math.round(health)}% da meta de 6 meses essenciais` : "Classifique gastos essenciais para calcular a meta");
    }
    case "goals": {
      const goals = accountBalances.filter(({ account }) => account.goal > 0); const goal = goals.reduce((sum, item) => sum + item.account.goal, 0); const saved = goals.reduce((sum, item) => sum + item.balance, 0);
      return shell("Objetivos", currency.format(saved), goal ? `${Math.round(saved / goal * 100)}% de ${currency.format(goal)}` : "Defina objetivos no Fluxo Web");
    }
    case "planning": return shell("Planejamento", currency.format(nextCommitments), nextCommitments > Math.max(totals.free, 0) ? "O próximo mês exige atenção" : "O próximo mês cabe no livre atual");
    case "categories": {
      const max = categoryTotals[0]?.[1] ?? 1;
      return shell("Gastos por categoria", categoryTotals[0]?.[0] ?? "Sem gastos", categoryTotals[0] ? `${currency.format(categoryTotals[0][1])} na maior categoria` : "Registre gastos para enxergar o padrão", <View style={styles.categoryList}>{categoryTotals.slice(0, compact ? 2 : 4).map(([name, value]) => <View key={name} style={styles.categoryRow}><Text style={styles.categoryName} numberOfLines={1}>{name}</Text><View style={styles.categoryTrack}><View style={[styles.categoryFill, { width: `${value / max * 100}%` }]} /></View><Text style={styles.categoryValue}>{currency.format(value)}</Text></View>)}</View>);
    }
    case "cards": return shell("Cartões", currency.format(invoice), `${snapshot.cards.length} cartões · toque para abrir a carteira`);
    case "assets": return shell("Patrimônio", currency.format(totalBalance), `${accountBalances.filter((item) => item.balance > 0).length} ativos com saldo`);
    case "investments": {
      const invested = accountBalances.filter(({ account }) => /invest|corretora|xp/i.test(`${account.kind} ${account.institution}`)).reduce((sum, item) => sum + item.balance, 0);
      return shell("Investimentos", currency.format(invested), invested ? "Valor estimado da carteira" : "Comece quando estiver pronto");
    }
    case "subscriptions": {
      const rules = snapshot.recurringRules.filter((item) => item.type === "expense" && item.active); const total = rules.reduce((sum, item) => sum + (item.projectedAmount ?? item.amount), 0);
      return shell("Assinaturas", currency.format(total), `${rules.length} saídas recorrentes ativas`);
    }
    case "recent": return shell("Últimos lançamentos", `${monthItems.length} movimentos`, recent.length ? "O que mudou por último neste período" : "Nenhum movimento no período", <View style={styles.recentList}>{recent.map((item) => <View style={styles.recentRow} key={item.id}><View style={styles.recentMain}><Text style={styles.recentName} numberOfLines={1}>{item.description}</Text><Text style={styles.recentMeta}>{item.category}{item.installments ? ` · ${item.installments}` : ""}</Text></View><Text style={[styles.recentValue, item.type === "income" && { color: palette.success }]}>{item.type === "income" ? "+" : "−"}{currency.format(item.amount)}</Text></View>)}</View>);
    case "calendar": {
      const dated = [...monthItems].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4);
      return shell("Calendário financeiro", `${dated.length} eventos`, dated.length ? "Datas importantes deste período" : "Sem compromissos registrados", <View style={styles.recentList}>{dated.map((item) => <View style={styles.recentRow} key={item.id}><Text style={styles.dateBadge}>{item.date.slice(8, 10)}</Text><Text style={styles.recentName} numberOfLines={1}>{item.description}</Text></View>)}</View>);
    }
  }
}

function makeStyles(p: Palette) { return StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 130 }, header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }, headerActions: { flexDirection: "row", gap: 6 }, eyebrow: { color: p.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.4 }, title: { marginTop: 4, color: p.text, fontSize: 26, fontWeight: "900", letterSpacing: -.8 }, iconButton: { position: "relative", width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 13, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface }, iconText: { color: p.text, fontSize: 17 }, notificationButtonActive: { borderColor: p.warning, backgroundColor: `${p.warning}18` }, notificationIconActive: { color: p.warning }, notificationBadge: { position: "absolute", top: -5, right: -5, minWidth: 18, height: 18, paddingHorizontal: 4, alignItems: "center", justifyContent: "center", borderRadius: 9, borderWidth: 2, borderColor: p.bg, backgroundColor: p.warning }, notificationBadgeText: { color: "#fff", fontSize: 7, fontWeight: "900" }, syncButton: { minWidth: 66, height: 38, alignItems: "center", justifyContent: "center", paddingHorizontal: 7, borderRadius: 13, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface }, syncText: { color: p.accent, fontSize: 7, fontWeight: "900" }, profileButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center", overflow: "hidden", borderRadius: 13, backgroundColor: p.accent }, profileButtonImage: { width: 38, height: 38 }, profileButtonText: { color: "#fff", fontSize: 14, fontWeight: "900" },
  tip: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 18, padding: 15, borderRadius: 20, borderWidth: 1, borderColor: `${p.accent}55`, backgroundColor: p.accentSoft }, tipIcon: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: p.accent }, tipIconText: { color: "#fff", fontSize: 17 }, tipMain: { flex: 1 }, tipLabel: { color: p.accent, fontSize: 8, fontWeight: "900", letterSpacing: 1.1 }, tipText: { marginTop: 4, color: p.text, fontSize: 11, lineHeight: 16, fontWeight: "700" }, tipAsk: { marginTop: 5, color: p.accent, fontSize: 7, fontWeight: "800" }, tipArrow: { color: p.accent, fontSize: 27 },
  connect: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16, padding: 15, borderRadius: 18, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface }, connectTitle: { color: p.text, fontSize: 12, fontWeight: "900" }, connectCopy: { maxWidth: 260, marginTop: 3, color: p.muted, fontSize: 9, lineHeight: 14 },
  editBanner: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 15, padding: 14, borderRadius: 18, backgroundColor: p.surface2 }, editTitle: { color: p.text, fontSize: 12, fontWeight: "900" }, editCopy: { maxWidth: 225, marginTop: 3, color: p.muted, fontSize: 8, lineHeight: 12 }, doneButton: { marginLeft: "auto", paddingHorizontal: 12, paddingVertical: 9, borderRadius: 11, backgroundColor: p.accent }, doneText: { color: "#fff", fontSize: 9, fontWeight: "900" }, grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 14 }, addButton: { height: 54, alignItems: "center", justifyContent: "center", marginTop: 8, borderRadius: 17, borderWidth: 1, borderStyle: "dashed", borderColor: p.accent }, addText: { color: p.accent, fontSize: 12, fontWeight: "900" }, hint: { marginTop: 18, color: p.muted, fontSize: 9, textAlign: "center" },
  incomeBanner: { flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 15, padding: 13, borderRadius: 18, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface }, incomeIcon: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: p.accentSoft }, incomeIconText: { color: p.accent, fontSize: 18, fontWeight: "900" }, incomeMain: { flex: 1 }, incomeTitle: { color: p.text, fontSize: 11, fontWeight: "900" }, incomeCopy: { marginTop: 3, color: p.muted, fontSize: 8 }, incomeButton: { paddingHorizontal: 11, paddingVertical: 9, borderRadius: 11, backgroundColor: p.accent }, incomeButtonText: { color: "#fff", fontSize: 8, fontWeight: "900" },
  modalLayer: { flex: 1, justifyContent: "flex-end" }, backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,.58)" }, sheet: { maxHeight: "78%", padding: 22, paddingBottom: 34, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: p.surface }, sheetTitle: { color: p.text, fontSize: 22, fontWeight: "900" }, sheetCopy: { marginTop: 5, marginBottom: 16, color: p.muted, fontSize: 10, lineHeight: 15 }, sheetList: { maxHeight: 440 }, widgetChoice: { minHeight: 66, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8, padding: 14, borderRadius: 16, backgroundColor: p.surface2 }, choiceTitle: { color: p.text, fontSize: 12, fontWeight: "800" }, choiceCopy: { marginTop: 3, color: p.muted, fontSize: 8 }, choicePlus: { color: p.accent, fontSize: 23 }, allAdded: { padding: 30, color: p.muted, textAlign: "center" }, closeButton: { height: 50, alignItems: "center", justifyContent: "center", marginTop: 12, borderRadius: 15, backgroundColor: p.accent }, closeText: { color: "#fff", fontSize: 12, fontWeight: "900" },
  aiSheet: { maxHeight: "92%" }, aiHeader: { flexDirection: "row", alignItems: "center", gap: 11 }, aiOrb: { width: 43, height: 43, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: p.accent }, aiOrbText: { color: "#fff", fontSize: 18 }, aiHeaderMain: { flex: 1 }, aiClose: { color: p.muted, fontSize: 27 }, aiSuggestions: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 13 }, aiSuggestion: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 99, borderWidth: 1, borderColor: `${p.accent}44`, backgroundColor: p.accentSoft }, aiSuggestionText: { color: p.accent, fontSize: 8, fontWeight: "800" }, aiAnswerScroll: { maxHeight: 330, marginBottom: 10 }, aiAnswer: { padding: 15, borderRadius: 17, backgroundColor: p.surface2 }, aiAnswerLabel: { color: p.accent, fontSize: 7, fontWeight: "900", letterSpacing: 1 }, aiAnswerTitle: { marginTop: 7, color: p.text, fontSize: 16, fontWeight: "900" }, aiAnswerText: { marginTop: 7, color: p.muted, fontSize: 10, lineHeight: 16 }, aiAction: { marginTop: 9, padding: 11, borderRadius: 12, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface }, aiActionHigh: { borderColor: p.warning }, aiActionTitle: { color: p.text, fontSize: 10, fontWeight: "900" }, aiActionText: { marginTop: 4, color: p.muted, fontSize: 8, lineHeight: 13 }, aiWarning: { marginTop: 8, color: p.warning, fontSize: 8, lineHeight: 13 }, aiEmpty: { alignItems: "center", padding: 24 }, aiEmptyIcon: { color: p.accent, fontSize: 26 }, aiEmptyText: { marginTop: 9, color: p.muted, fontSize: 10, lineHeight: 15, textAlign: "center" }, aiInput: { minHeight: 76, maxHeight: 120, padding: 13, color: p.text, borderRadius: 15, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface2, textAlignVertical: "top", fontSize: 10 }, aiSend: { height: 52, alignItems: "center", justifyContent: "center", marginTop: 9, borderRadius: 15, backgroundColor: p.accent }, aiSendText: { color: "#fff", fontSize: 11, fontWeight: "900" },
}); }

function widgetStyles(p: Palette) { return StyleSheet.create({
  hero: { minHeight: 205, padding: 23, borderRadius: 27, backgroundColor: p.accent, shadowColor: p.accent, shadowOpacity: .28, shadowRadius: 24, elevation: 8 }, heroLabel: { color: "rgba(255,255,255,.72)", fontSize: 9, fontWeight: "900", letterSpacing: 1.2 }, heroValue: { marginTop: 9, color: "#fff", fontSize: 39, fontWeight: "900", letterSpacing: -1.4 }, heroAnswer: { marginTop: 5, color: "rgba(255,255,255,.75)", fontSize: 10 }, heroDivider: { height: 1, marginVertical: 20, backgroundColor: "rgba(255,255,255,.22)" }, heroMeta: { flexDirection: "row", justifyContent: "space-between" }, heroMetaText: { color: "rgba(255,255,255,.82)", fontSize: 10, fontWeight: "700" },
  card: { minHeight: 150, padding: 18, borderRadius: 22, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface }, cardCompact: { minHeight: 145, padding: 15 }, label: { color: p.muted, fontSize: 8, fontWeight: "900", letterSpacing: 1.1 }, value: { marginTop: 8, color: p.text, fontSize: 22, fontWeight: "900", letterSpacing: -.5 }, valueCompact: { fontSize: 17 }, answer: { marginTop: 5, color: p.muted, fontSize: 9, lineHeight: 13 }, bars: { gap: 7, marginTop: 14 }, barRow: { flexDirection: "row", alignItems: "center", gap: 8 }, barName: { width: 48, color: p.muted, fontSize: 7 }, track: { flex: 1, height: 5, overflow: "hidden", borderRadius: 3, backgroundColor: p.surface2 }, fill: { height: 5, borderRadius: 3 }, categoryList: { gap: 8, marginTop: 15 }, categoryRow: { flexDirection: "row", alignItems: "center", gap: 8 }, categoryName: { width: 62, color: p.muted, fontSize: 8 }, categoryTrack: { flex: 1, height: 5, overflow: "hidden", borderRadius: 3, backgroundColor: p.surface2 }, categoryFill: { height: 5, borderRadius: 3, backgroundColor: p.accent }, categoryValue: { width: 74, color: p.text, fontSize: 8, fontWeight: "700", textAlign: "right" }, recentList: { marginTop: 12 }, recentRow: { minHeight: 39, flexDirection: "row", alignItems: "center", gap: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.border }, recentMain: { flex: 1 }, recentName: { flex: 1, color: p.text, fontSize: 9, fontWeight: "700" }, recentMeta: { marginTop: 2, color: p.muted, fontSize: 7 }, recentValue: { color: p.text, fontSize: 9, fontWeight: "900" }, dateBadge: { width: 28, height: 25, paddingTop: 6, borderRadius: 8, color: p.accent, backgroundColor: p.accentSoft, textAlign: "center", fontSize: 8, fontWeight: "900" },
}); }
