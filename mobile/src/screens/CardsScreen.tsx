import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { effectiveCardDate } from "../brazil-calendar";
import { PeriodSwitcher } from "../components/PeriodSwitcher";
import { accountBalanceAtMonth, defaultInvoiceMonthForCard, transactionsForInvoiceMonth } from "../finance-period";
import type { Palette } from "../theme";
import type { FinanceCard, FinanceSnapshot } from "../types";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const shortDate = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" });
const localDateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

type Props = { snapshot: FinanceSnapshot; month: string; onMonth: (month: string) => void; palette: Palette; onImport: (card: FinanceCard) => void; onPay: (card: FinanceCard, remaining: number) => void; onPurchase: (card: FinanceCard) => void };

export function CardsScreen({ snapshot, month, onMonth, palette, onImport, onPay, onPurchase }: Props) {
  const styles = useMemo(() => makeStyles(palette), [palette]); const { width } = useWindowDimensions();
  const cardWidth = Math.min(360, width * .79); const gap = 14; const scrollX = useRef(new Animated.Value(0)).current;
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  useEffect(() => { if (selectedIndex >= snapshot.cards.length) setSelectedIndex(0); }, [selectedIndex, snapshot.cards.length]);
  const card = snapshot.cards[selectedIndex];
  const currentMonth = new Date().toISOString().slice(0, 7);
  const preferredInvoiceMonth = card?.kind === "credit" ? defaultInvoiceMonthForCard(card, snapshot.transactions, localDateKey()) : month;
  const automaticSelection = useRef("");
  useEffect(() => {
    const signature = `${card?.id ?? "none"}:${preferredInvoiceMonth}`;
    if (!card || automaticSelection.current === signature) return;
    automaticSelection.current = signature;
    if (month !== preferredInvoiceMonth) onMonth(preferredInvoiceMonth);
  }, [card, month, onMonth, preferredInvoiceMonth]);
  const monthItems = transactionsForInvoiceMonth(snapshot.transactions, month);
  const related = card ? monthItems.filter((item) => item.cardId === card.id || (!item.cardId && item.account === card.linkedAccount)) : [];
  const purchases = related.filter((item) => item.type === "expense" && item.paymentMethod === "credit");
  const invoice = purchases.reduce((sum, item) => sum + item.amount, 0);
  const paid = related.filter((item) => item.type === "transfer" && item.source === "invoice-payment").reduce((sum, item) => sum + item.amount, 0);
  const remaining = Math.max(0, invoice - paid); const usage = card?.limit ? Math.min(100, remaining / card.limit * 100) : 0;
  const linked = card ? snapshot.accounts.find((item) => item.name === card.linkedAccount) : undefined;
  const debitBalance = linked ? accountBalanceAtMonth(linked, snapshot.transactions, month, currentMonth) : 0;

  return <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
    <View style={styles.header}><Text style={styles.eyebrow}>CARTEIRA</Text><Text style={styles.title}>Seus cartões</Text><Text style={styles.subtitle}>Deslize para trocar de cartão</Text></View>
    <PeriodSwitcher month={month} onChange={onMonth} palette={palette} />
    {snapshot.cards.length ? <>
      <Animated.FlatList
        horizontal data={snapshot.cards} keyExtractor={(item) => item.id} showsHorizontalScrollIndicator={false}
        snapToInterval={cardWidth + gap} decelerationRate="fast" disableIntervalMomentum
        contentContainerStyle={{ paddingHorizontal: 20, gap, paddingVertical: 14 }}
        style={{ marginHorizontal: -20 }}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true })}
        onMomentumScrollEnd={(event) => setSelectedIndex(Math.max(0, Math.min(snapshot.cards.length - 1, Math.round(event.nativeEvent.contentOffset.x / (cardWidth + gap)))))}
        renderItem={({ item, index }) => {
          const input = [(index - 1) * (cardWidth + gap), index * (cardWidth + gap), (index + 1) * (cardWidth + gap)];
          const scale = scrollX.interpolate({ inputRange: input, outputRange: [.92, 1, .92], extrapolate: "clamp" });
          const translateY = scrollX.interpolate({ inputRange: input, outputRange: [10, 0, 10], extrapolate: "clamp" });
          return <Animated.View style={{ width: cardWidth, transform: [{ scale }, { translateY }] }}><Image source={cardAsset(item)} style={styles.cardImage} resizeMode="contain" /></Animated.View>;
        }}
      />
      {card && <>
        <View style={styles.cardIdentity}><View><Text style={styles.cardName}>{card.name}</Text><Text style={styles.cardMeta}>{card.brand} · Final {card.last4 || "••••"} · {card.kind === "credit" ? "Crédito" : "Débito"}</Text></View><View style={styles.position}><Text style={styles.positionText}>{selectedIndex + 1}/{snapshot.cards.length}</Text></View></View>
        {card.kind === "credit" ? <View style={styles.invoiceCard}>
          <View style={styles.invoiceTop}><View><Text style={styles.label}>FATURA DE {month.slice(5, 7)}/{month.slice(0, 4)}</Text><Text style={styles.invoiceValue}>{currency.format(invoice)}</Text><Text style={styles.remaining}>{remaining ? `${currency.format(remaining)} ainda em aberto` : invoice ? "Fatura paga" : "Nenhuma compra nesta competência"}</Text></View><View style={[styles.status, remaining === 0 && invoice > 0 && styles.statusPaid]}><Text style={[styles.statusText, remaining === 0 && invoice > 0 && styles.statusTextPaid]}>{remaining ? "ABERTA" : invoice ? "PAGA" : "SEM FATURA"}</Text></View></View>
          <View style={styles.progress}><View style={[styles.progressFill, { width: `${usage}%` }]} /></View>
          <View style={styles.metrics}><Metric label="Já pago" value={currency.format(paid)} palette={palette} /><Metric label="Compras" value={String(purchases.length)} palette={palette} /><Metric label="Limite usado" value={`${Math.round(usage)}%`} palette={palette} /><Metric label="Disponível" value={currency.format(Math.max(0, card.limit - remaining))} palette={palette} /></View>
          <View style={styles.dates}><View><Text style={styles.dateLabel}>FECHA EM</Text><Text style={styles.dateValue}>{shortDate(effectiveCardDate(month, card.closingDay, "previous"))}</Text></View><View><Text style={styles.dateLabel}>VENCE EM</Text><Text style={styles.dateValue}>{shortDate(effectiveCardDate(month, card.dueDay, card.dueAdjustment ?? "next"))}</Text></View></View>
        </View> : <View style={styles.invoiceCard}><Text style={styles.label}>SALDO DA CONTA VINCULADA</Text><Text style={styles.invoiceValue}>{currency.format(debitBalance)}</Text><Text style={styles.remaining}>{linked?.name ?? card.linkedAccount}</Text><View style={styles.debitNote}><Text style={styles.debitNoteText}>As compras deste cartão abatem diretamente deste saldo.</Text></View></View>}
        <View style={styles.actions}>
          <Action label={card.kind === "credit" ? "Importar fatura" : "Importar extrato"} icon="⇧" onPress={() => onImport(card)} palette={palette} />
          {card.kind === "credit" && <Action label="Pagar fatura" icon="✓" onPress={() => onPay(card, remaining)} palette={palette} disabled={!remaining} />}
          <Action label="Nova compra" icon="＋" onPress={() => onPurchase(card)} palette={palette} primary />
        </View>
        {purchases.length > 0 && <View style={styles.list}><View style={styles.sectionHead}><View><Text style={styles.sectionTitle}>Últimas compras</Text><Text style={styles.sectionCopy}>5 movimentações mais recentes desta fatura</Text></View><Pressable style={styles.statementLink} onPress={() => setInvoiceOpen(true)}><Text style={styles.statementLinkText}>Ver fatura</Text></Pressable></View>{[...purchases].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5).map((item) => <View style={styles.row} key={item.id}><View style={styles.rowIcon}><Text style={styles.rowIconText}>↑</Text></View><View style={styles.rowMain}><Text style={styles.rowName} numberOfLines={1}>{item.description}</Text><Text style={styles.rowMeta}>{item.category}{item.installments ? ` · Parcela ${item.installments}` : ""}</Text></View><Text style={styles.rowValue}>{currency.format(item.amount)}</Text></View>)}{purchases.length > 5 && <Pressable style={styles.moreButton} onPress={() => setInvoiceOpen(true)}><Text style={styles.moreButtonText}>Ver mais {purchases.length - 5} compras</Text></Pressable>}</View>}
        <InvoiceStatement open={invoiceOpen} card={card} month={month} purchases={purchases} paid={paid} palette={palette} onClose={() => setInvoiceOpen(false)} />
      </>}
    </> : <View style={styles.empty}><Text style={styles.emptyIcon}>◎</Text><Text style={styles.emptyTitle}>Nenhum cartão sincronizado</Text><Text style={styles.emptyText}>Cadastre cartões pelo Fluxo Web e eles aparecerão aqui.</Text></View>}
  </ScrollView>;
}

type StatementGroup = "month" | "week" | "day";

function normalizedSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function mondayOf(dateValue: string) {
  const date = new Date(`${dateValue}T12:00:00Z`);
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - weekday + 1);
  return date.toISOString().slice(0, 10);
}

function statementLabel(key: string, mode: StatementGroup) {
  if (mode === "month") return new Date(`${key}-01T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
  if (mode === "week") return `Semana de ${shortDate(key)}`;
  return new Date(`${key}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "UTC" });
}

function InvoiceStatement({ open, card, month, purchases, paid, palette, onClose }: { open: boolean; card: FinanceCard; month: string; purchases: FinanceSnapshot["transactions"]; paid: number; palette: Palette; onClose: () => void }) {
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const [mode, setMode] = useState<StatementGroup>("day");
  const [search, setSearch] = useState("");
  useEffect(() => { if (!open) setSearch(""); }, [open]);
  const query = normalizedSearch(search);
  const visible = [...purchases]
    .filter((item) => normalizedSearch(`${item.description} ${item.category} ${item.installments ?? ""}`).includes(query))
    .sort((a, b) => b.date.localeCompare(a.date));
  const groups = visible.reduce((map, item) => {
    const key = mode === "month" ? (item.invoiceMonth ?? item.date.slice(0, 7)) : mode === "week" ? mondayOf(item.date) : item.date;
    const current = map.get(key) ?? [];
    current.push(item);
    map.set(key, current);
    return map;
  }, new Map<string, typeof visible>());
  const total = purchases.reduce((sum, item) => sum + item.amount, 0);

  return <Modal visible={open} animationType="slide" onRequestClose={onClose}>
    <View style={styles.statementScreen}>
      <View style={styles.statementHeader}><View><Text style={styles.eyebrow}>FATURA COMPLETA</Text><Text style={styles.statementTitle}>{card.name}</Text><Text style={styles.statementSubtitle}>{month.slice(5, 7)}/{month.slice(0, 4)} · {purchases.length} compras</Text></View><Pressable accessibilityLabel="Fechar fatura" style={styles.statementClose} onPress={onClose}><Text style={styles.statementCloseText}>×</Text></Pressable></View>
      <View style={styles.statementSummary}><View><Text style={styles.metricLabel}>TOTAL</Text><Text style={styles.statementTotal}>{currency.format(total)}</Text></View><View><Text style={styles.metricLabel}>PAGO</Text><Text style={styles.statementPaid}>{currency.format(paid)}</Text></View><View><Text style={styles.metricLabel}>EM ABERTO</Text><Text style={styles.statementOpen}>{currency.format(Math.max(0, total - paid))}</Text></View></View>
      <TextInput value={search} onChangeText={setSearch} placeholder="Buscar compra ou categoria" placeholderTextColor={palette.muted} style={styles.statementSearch} />
      <View style={styles.groupTabs}>{(["month", "week", "day"] as StatementGroup[]).map((item) => <Pressable key={item} style={[styles.groupTab, mode === item && styles.groupTabActive]} onPress={() => setMode(item)}><Text style={[styles.groupTabText, mode === item && styles.groupTabTextActive]}>{item === "month" ? "Mês" : item === "week" ? "Semana" : "Dia"}</Text></Pressable>)}</View>
      <ScrollView contentContainerStyle={styles.statementList} keyboardShouldPersistTaps="handled">{[...groups.entries()].map(([key, items]) => <View key={key} style={styles.statementGroup}><View style={styles.statementGroupHead}><Text style={styles.statementGroupTitle}>{statementLabel(key, mode)}</Text><Text style={styles.statementGroupTotal}>{currency.format(items.reduce((sum, item) => sum + item.amount, 0))}</Text></View>{items.map((item) => <View style={styles.row} key={item.id}><View style={styles.rowIcon}><Text style={styles.rowIconText}>↑</Text></View><View style={styles.rowMain}><Text style={styles.rowName} numberOfLines={1}>{item.description}</Text><Text style={styles.rowMeta}>{item.category} · {shortDate(item.date)}{item.installments ? ` · ${item.installments}` : ""}</Text></View><Text style={styles.rowValue}>{currency.format(item.amount)}</Text></View>)}</View>)}{!visible.length && <View style={styles.empty}><Text style={styles.emptyIcon}>◎</Text><Text style={styles.emptyTitle}>Nenhuma compra encontrada</Text><Text style={styles.emptyText}>Altere a busca para consultar esta fatura.</Text></View>}</ScrollView>
    </View>
  </Modal>;
}

function cardAsset(card: FinanceCard) { return card.name.toLowerCase().includes("caju") ? require("../../assets/caju-va.png") : require("../../assets/nubank-uv.png"); }
function Metric({ label, value, palette }: { label: string; value: string; palette: Palette }) { const styles = makeStyles(palette); return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text></View>; }
function Action({ label, icon, onPress, palette, primary, disabled }: { label: string; icon: string; onPress: () => void; palette: Palette; primary?: boolean; disabled?: boolean }) { const styles = makeStyles(palette); return <Pressable disabled={disabled} style={({ pressed }) => [styles.action, primary && styles.actionPrimary, disabled && styles.disabled, pressed && styles.pressed]} onPress={onPress}><Text style={[styles.actionIcon, primary && styles.actionIconPrimary]}>{icon}</Text><Text style={[styles.actionLabel, primary && styles.actionLabelPrimary]} numberOfLines={2}>{label}</Text></Pressable>; }

function makeStyles(p: Palette) { return StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 130 }, header: { marginBottom: 14 }, eyebrow: { color: p.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.5 }, title: { marginTop: 4, color: p.text, fontSize: 29, fontWeight: "900", letterSpacing: -.9 }, subtitle: { marginTop: 5, color: p.muted, fontSize: 10 }, cardImage: { width: "100%", aspectRatio: 1.586 }, cardIdentity: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 5, marginBottom: 16 }, cardName: { color: p.text, fontSize: 18, fontWeight: "900" }, cardMeta: { marginTop: 4, color: p.muted, fontSize: 9 }, position: { minWidth: 40, height: 28, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: p.surface2 }, positionText: { color: p.accent, fontSize: 9, fontWeight: "900" },
  invoiceCard: { padding: 20, borderRadius: 24, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface }, invoiceTop: { flexDirection: "row", justifyContent: "space-between", gap: 12 }, label: { color: p.muted, fontSize: 8, fontWeight: "900", letterSpacing: 1.2 }, invoiceValue: { marginTop: 7, color: p.text, fontSize: 29, fontWeight: "900", letterSpacing: -.9 }, remaining: { marginTop: 4, color: p.muted, fontSize: 9 }, status: { height: 27, justifyContent: "center", paddingHorizontal: 10, borderRadius: 9, backgroundColor: `${p.warning}1f` }, statusPaid: { backgroundColor: `${p.success}1f` }, statusText: { color: p.warning, fontSize: 7, fontWeight: "900", letterSpacing: .8 }, statusTextPaid: { color: p.success }, progress: { height: 7, overflow: "hidden", marginTop: 18, borderRadius: 4, backgroundColor: p.surface2 }, progressFill: { height: 7, borderRadius: 4, backgroundColor: p.accent }, metrics: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 14, marginTop: 18 }, metric: { width: "48%" }, metricLabel: { color: p.muted, fontSize: 8 }, metricValue: { marginTop: 4, color: p.text, fontSize: 13, fontWeight: "800" }, dates: { flexDirection: "row", gap: 50, marginTop: 18, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.border }, dateLabel: { color: p.muted, fontSize: 7, fontWeight: "900", letterSpacing: 1 }, dateValue: { marginTop: 4, color: p.text, fontSize: 12, fontWeight: "800" }, debitNote: { marginTop: 18, padding: 12, borderRadius: 13, backgroundColor: p.accentSoft }, debitNoteText: { color: p.accent, fontSize: 9, lineHeight: 13, fontWeight: "700" },
  actions: { flexDirection: "row", gap: 8, marginTop: 12 }, action: { flex: 1, minHeight: 70, alignItems: "center", justifyContent: "center", padding: 7, borderRadius: 17, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface }, actionPrimary: { borderColor: p.accent, backgroundColor: p.accent }, actionIcon: { color: p.accent, fontSize: 18, fontWeight: "800" }, actionIconPrimary: { color: "#fff" }, actionLabel: { marginTop: 5, color: p.text, fontSize: 8, lineHeight: 11, fontWeight: "800", textAlign: "center" }, actionLabelPrimary: { color: "#fff" }, disabled: { opacity: .4 }, pressed: { opacity: .75, transform: [{ scale: .97 }] },
  list: { marginTop: 24, paddingHorizontal: 15, borderRadius: 22, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface }, sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingTop: 17, paddingBottom: 8 }, sectionTitle: { color: p.text, fontSize: 15, fontWeight: "900" }, sectionCopy: { marginTop: 3, color: p.muted, fontSize: 8 }, statementLink: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 11, backgroundColor: p.accentSoft }, statementLinkText: { color: p.accent, fontSize: 8, fontWeight: "900" }, moreButton: { height: 44, alignItems: "center", justifyContent: "center", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.border }, moreButtonText: { color: p.accent, fontSize: 9, fontWeight: "900" }, row: { minHeight: 67, flexDirection: "row", alignItems: "center", gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.border }, rowIcon: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: p.accentSoft }, rowIconText: { color: p.accent, fontSize: 15, fontWeight: "900" }, rowMain: { flex: 1 }, rowName: { color: p.text, fontSize: 11, fontWeight: "800" }, rowMeta: { marginTop: 3, color: p.muted, fontSize: 8 }, rowValue: { color: p.text, fontSize: 11, fontWeight: "900" }, empty: { minHeight: 300, alignItems: "center", justifyContent: "center", padding: 30 }, emptyIcon: { color: p.accent, fontSize: 38 }, emptyTitle: { marginTop: 12, color: p.text, fontSize: 15, fontWeight: "900" }, emptyText: { maxWidth: 250, marginTop: 6, color: p.muted, fontSize: 10, lineHeight: 15, textAlign: "center" },
  statementScreen: { flex: 1, paddingTop: 54, backgroundColor: p.bg }, statementHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", paddingHorizontal: 20 }, statementTitle: { marginTop: 5, color: p.text, fontSize: 25, fontWeight: "900", letterSpacing: -.7 }, statementSubtitle: { marginTop: 4, color: p.muted, fontSize: 9 }, statementClose: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 14, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface }, statementCloseText: { color: p.text, fontSize: 26, lineHeight: 29 }, statementSummary: { flexDirection: "row", justifyContent: "space-between", gap: 10, margin: 20, padding: 16, borderRadius: 20, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface }, statementTotal: { marginTop: 5, color: p.text, fontSize: 14, fontWeight: "900" }, statementPaid: { marginTop: 5, color: p.success, fontSize: 14, fontWeight: "900" }, statementOpen: { marginTop: 5, color: p.warning, fontSize: 14, fontWeight: "900" }, statementSearch: { height: 50, marginHorizontal: 20, paddingHorizontal: 15, color: p.text, fontSize: 11, borderRadius: 15, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface }, groupTabs: { flexDirection: "row", gap: 6, margin: 12, marginHorizontal: 20, padding: 4, borderRadius: 14, backgroundColor: p.surface2 }, groupTab: { flex: 1, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 10 }, groupTabActive: { backgroundColor: p.accent }, groupTabText: { color: p.muted, fontSize: 9, fontWeight: "900" }, groupTabTextActive: { color: "#fff" }, statementList: { paddingHorizontal: 20, paddingBottom: 42 }, statementGroup: { marginBottom: 14, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface }, statementGroupHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14 }, statementGroupTitle: { flex: 1, color: p.text, fontSize: 11, fontWeight: "900", textTransform: "capitalize" }, statementGroupTotal: { color: p.accent, fontSize: 10, fontWeight: "900" },
}); }
