import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { scanReceiptApi } from "../api";
import { effectiveCardDate } from "../brazil-calendar";
import { saveLocalAttachment, saveLocalTransaction } from "../database";
import { monthOffset } from "../finance-period";
import { newId } from "../sync";
import type { Palette } from "../theme";
import type { FinanceSnapshot, ReceiptScanResult, TransactionType } from "../types";

function today() { return new Date().toISOString().slice(0, 10); }
function formatMoneyInput(value: number) { return value.toFixed(2).replace(".", ","); }

export function TransactionComposer({ open, snapshot, initialCardId, palette, onClose, onSaved }: { open: boolean; snapshot: FinanceSnapshot; initialCardId?: string; palette: Palette; onClose: () => void; onSaved: () => Promise<void> | void }) {
  const db = useSQLiteContext(); const styles = useMemo(() => makeStyles(palette), [palette]);
  const [type, setType] = useState<TransactionType>("expense"); const [description, setDescription] = useState(""); const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(""); const [account, setAccount] = useState(""); const [destinationAccount, setDestinationAccount] = useState(""); const [paymentMethod, setPaymentMethod] = useState<"debit" | "credit">("debit");
  const [installments, setInstallments] = useState("1"); const [cardId, setCardId] = useState(""); const [date, setDate] = useState(today());
  const [tripId, setTripId] = useState(""); const [tripInitialized, setTripInitialized] = useState(false);
  const [receiptUri, setReceiptUri] = useState(""); const [receiptScan, setReceiptScan] = useState<ReceiptScanResult | null>(null); const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const expenseCategories = useMemo(() => snapshot.categories.filter((item) => item.kind === "expense"), [snapshot.categories]);
  const incomeCategories = useMemo(() => snapshot.categories.filter((item) => item.kind === "income"), [snapshot.categories]);
  const choices = type === "income" ? incomeCategories : expenseCategories;
  const choiceKey = choices.map((item) => item.id).join("|");
  const accounts = useMemo(() => snapshot.accounts.filter((item) => item.kind !== "credit-card"), [snapshot.accounts]);
  const creditCards = useMemo(() => snapshot.cards.filter((item) => item.kind === "credit"), [snapshot.cards]);

  useEffect(() => {
    if (!open) { setTripInitialized(false); return; }
    const requested = initialCardId && creditCards.some((item) => item.id === initialCardId) ? initialCardId : cardId || creditCards[0]?.id || "";
    setCardId(requested); if (initialCardId) setPaymentMethod("credit");
    if (!tripInitialized) { setTripId(snapshot.trips.find((item) => today() >= item.startDate && today() <= item.endDate)?.id ?? ""); setTripInitialized(true); }
  }, [creditCards, initialCardId, open, snapshot.trips, tripInitialized]);
  useEffect(() => { if (!choices.some((item) => item.name === category)) setCategory(choices[0]?.name ?? (type === "income" ? "Receita" : "Outros")); }, [category, choiceKey, choices, type]);
  useEffect(() => { if (!accounts.some((item) => item.name === account)) setAccount(accounts[0]?.name ?? "Nubank"); }, [account, accounts]);
  useEffect(() => { if (!accounts.some((item) => item.name === destinationAccount) || destinationAccount === account) setDestinationAccount(accounts.find((item) => item.name !== account)?.name ?? ""); }, [account, accounts, destinationAccount]);

  async function captureReceipt() {
    setError("");
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) { setError("Permita o uso da câmera para fotografar o cupom."); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: .72, allowsEditing: false });
    if (result.canceled || !result.assets[0]) return;
    const source = result.assets[0].uri; const directory = `${FileSystem.documentDirectory}receipts/`;
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    const extension = source.match(/\.(jpe?g|png|webp)(?:\?|$)/i)?.[1] ?? "jpg"; const target = `${directory}${newId("receipt").replace(/[:]/g, "-")}.${extension}`;
    await FileSystem.copyAsync({ from: source, to: target }); setReceiptUri(target); setReceiptScan(null); setScanning(true);
    try {
      const imageBase64 = await FileSystem.readAsStringAsync(target, { encoding: FileSystem.EncodingType.Base64 });
      const mimeType = extension.toLowerCase() === "png" ? "image/png" : extension.toLowerCase() === "webp" ? "image/webp" : "image/jpeg";
      const scan = await scanReceiptApi({ imageBase64, mimeType, categories: expenseCategories.map((item) => item.name) });
      setReceiptScan(scan); setType("expense");
      if (scan.description) setDescription(scan.description);
      if (scan.total > 0) setAmount(formatMoneyInput(scan.total));
      if (scan.date) setDate(scan.date);
      if (expenseCategories.some((item) => item.name === scan.category)) setCategory(scan.category);
      if (scan.paymentHint === "credit") setPaymentMethod("credit");
      else if (scan.paymentHint === "debit" || scan.paymentHint === "cash") setPaymentMethod("debit");
    } catch (reason) {
      setError(`${reason instanceof Error ? reason.message : "Não consegui ler este cupom"}. A foto foi anexada e você pode preencher manualmente.`);
    } finally { setScanning(false); }
  }

  function invoiceMonthFor(date: string, closingDay: number) {
    const calendarMonth = date.slice(0, 7); const closing = effectiveCardDate(calendarMonth, closingDay, "previous");
    return date > closing ? monthOffset(calendarMonth, 1) : calendarMonth;
  }
  function dateInMonth(date: string, month: string) { const [year, monthNumber] = month.split("-").map(Number); const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate(); return `${month}-${String(Math.min(Number(date.slice(8, 10)) || 1, lastDay)).padStart(2, "0")}`; }

  async function save() {
    setError(""); const numeric = Number(amount.replace(/\./g, "").replace(",", "."));
    if (!description.trim()) { setError("Descreva este lançamento."); return; }
    if (!Number.isFinite(numeric) || numeric <= 0) { setError("Informe um valor válido."); return; }
    if (type === "transfer" && (!destinationAccount || destinationAccount === account)) { setError("Escolha contas de origem e destino diferentes."); return; }
    setBusy(true);
    try {
      const transactionDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T12:00:00Z`)) ? date : "";
      if (!transactionDate) { setError("Informe a data no formato AAAA-MM-DD."); setBusy(false); return; }
      const selectedCard = creditCards.find((item) => item.id === cardId);
      const method = type === "expense" && paymentMethod === "credit" && selectedCard ? "credit" : type === "income" || type === "transfer" ? "transfer" : "debit";
      const count = method === "credit" ? Math.min(48, Math.max(1, Math.trunc(Number(installments) || 1))) : 1;
      const totalCents = Math.round(numeric * 100); const baseCents = Math.floor(totalCents / count); const remainder = totalCents - baseCents * count;
      const groupId = newId("mobile"); const firstInvoiceMonth = method === "credit" ? invoiceMonthFor(transactionDate, selectedCard!.closingDay) : undefined;
      for (let index = 0; index < count; index += 1) {
        const invoiceMonth = firstInvoiceMonth ? monthOffset(firstInvoiceMonth, index) : undefined;
        const installmentDate = index === 0 ? transactionDate : dateInMonth(transactionDate, monthOffset(transactionDate.slice(0, 7), index));
        const id = `${groupId}-${index + 1}`;
        await saveLocalTransaction(db, {
          id, description: description.trim(), category: type === "transfer" ? "Transferência" : category, account: method === "credit" ? selectedCard!.linkedAccount : account, destinationAccount: type === "transfer" ? destinationAccount : undefined,
          date: installmentDate, amount: (baseCents + (index < remainder ? 1 : 0)) / 100, type, paymentMethod: method,
          cardId: method === "credit" ? selectedCard!.id : undefined, invoiceMonth,
          tripId: tripId || undefined,
          installments: count > 1 ? `${index + 1}/${count}` : undefined, status: "confirmed", source: type === "transfer" ? "account-transfer" : "manual", version: 0,
        }, newId("mutation"));
        if (receiptUri && index === 0) await saveLocalAttachment(db, id, receiptUri);
      }
      setDescription(""); setAmount(""); setInstallments("1"); setDate(today()); setTripId(""); setReceiptUri(""); setReceiptScan(null); await onSaved();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não consegui salvar este lançamento."); }
    finally { setBusy(false); }
  }

  return <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}><View style={styles.layer}><Pressable style={styles.backdrop} onPress={onClose} /><View style={styles.sheet}><View style={styles.handle} /><View style={styles.titleRow}><View><Text style={styles.eyebrow}>REGISTRO RÁPIDO</Text><Text style={styles.title}>Novo lançamento</Text></View><Pressable accessibilityLabel="Fotografar cupom" style={[styles.cameraButton, receiptUri && styles.cameraAttached]} onPress={captureReceipt}><Text style={styles.cameraIcon}>{receiptUri ? "✓" : "▣"}</Text></Pressable></View>
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      {receiptUri ? <View style={styles.receipt}><Image source={{ uri: receiptUri }} style={styles.receiptImage} /><View style={styles.receiptMain}><Text style={styles.receiptTitle}>{scanning ? "Lendo cupom…" : receiptScan ? "Cupom interpretado" : "Cupom anexado"}</Text><Text style={styles.receiptCopy}>{scanning ? "Buscando estabelecimento, valor, data e itens." : receiptScan ? `${receiptScan.merchant || receiptScan.description} · ${receiptScan.items.length} ${receiptScan.items.length === 1 ? "item" : "itens"} · confira antes de salvar.` : "A foto ficará vinculada a este lançamento."}</Text></View>{scanning ? <ActivityIndicator color={palette.accent} /> : <Pressable onPress={() => { setReceiptUri(""); setReceiptScan(null); }}><Text style={styles.removeReceipt}>×</Text></Pressable>}</View> : null}
      {receiptScan?.warnings.length ? <View style={styles.scanWarning}>{receiptScan.warnings.map((item, index) => <Text key={`${item}-${index}`} style={styles.scanWarningText}>• {item}</Text>)}</View> : null}
      <View style={styles.toggle}>{(["expense", "income", "transfer"] as TransactionType[]).map((item) => <Pressable key={item} style={[styles.toggleButton, type === item && styles.toggleActive]} onPress={() => { setType(item); if (item === "transfer" && !description) setDescription("Transferência entre contas"); }}><Text style={[styles.toggleText, type === item && styles.toggleTextActive]}>{item === "expense" ? "Saída" : item === "income" ? "Entrada" : "Transferir"}</Text></Pressable>)}</View>
      <View style={styles.descriptionRow}><TextInput placeholder="Descrição" placeholderTextColor={palette.muted} value={description} onChangeText={setDescription} style={[styles.input, styles.descriptionInput]} autoFocus /><Pressable accessibilityLabel="Fotografar cupom" style={styles.inlineCamera} onPress={captureReceipt}><Text style={styles.inlineCameraText}>▣</Text></Pressable></View>
      <TextInput placeholder="R$ 0,00" placeholderTextColor={palette.muted} value={amount} onChangeText={setAmount} style={[styles.input, styles.amountInput]} keyboardType="decimal-pad" />
      <Text style={styles.fieldLabel}>DATA DA COMPRA</Text><TextInput placeholder="AAAA-MM-DD" placeholderTextColor={palette.muted} value={date} onChangeText={setDate} style={styles.input} keyboardType="numbers-and-punctuation" maxLength={10} />
      {type === "expense" && snapshot.trips.length > 0 && <><Text style={styles.fieldLabel}>MODO VIAGEM</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}><Pressable style={[styles.chip, !tripId && styles.chipActive]} onPress={() => setTripId("")}><Text style={[styles.chipText, !tripId && styles.chipTextActive]}>Sem viagem</Text></Pressable>{snapshot.trips.map((item) => <Pressable key={item.id} style={[styles.chip, tripId === item.id && styles.chipActive]} onPress={() => setTripId(item.id)}><Text style={[styles.chipText, tripId === item.id && styles.chipTextActive]}>✈ {item.name} · {item.currency}</Text></Pressable>)}</ScrollView></>}
      {type === "expense" && <><Text style={styles.fieldLabel}>FORMA DE PAGAMENTO</Text><View style={styles.toggle}>{(["debit", "credit"] as const).map((item) => <Pressable key={item} style={[styles.toggleButton, paymentMethod === item && styles.toggleActive]} onPress={() => setPaymentMethod(item)}><Text style={[styles.toggleText, paymentMethod === item && styles.toggleTextActive]}>{item === "credit" ? "Crédito" : "Débito / saldo"}</Text></Pressable>)}</View>{paymentMethod === "credit" && <><Text style={styles.fieldLabel}>CARTÃO</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{creditCards.map((item) => <Pressable key={item.id} style={[styles.chip, cardId === item.id && styles.chipActive]} onPress={() => setCardId(item.id)}><Text style={[styles.chipText, cardId === item.id && styles.chipTextActive]}>{item.name}</Text></Pressable>)}</ScrollView><TextInput placeholder="Quantidade de parcelas" placeholderTextColor={palette.muted} value={installments} onChangeText={setInstallments} style={styles.input} keyboardType="number-pad" /></>}</>}
      {type !== "transfer" && <><Text style={styles.fieldLabel}>CATEGORIA</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{choices.map((item) => <Pressable key={item.id} style={[styles.chip, category === item.name && styles.chipActive]} onPress={() => setCategory(item.name)}><Text style={[styles.chipText, category === item.name && styles.chipTextActive]}>{item.name}</Text></Pressable>)}</ScrollView></>}
      {(paymentMethod !== "credit" || type === "income" || type === "transfer") && <><Text style={styles.fieldLabel}>{type === "transfer" ? "CONTA DE ORIGEM" : "CONTA"}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{accounts.map((item) => <Pressable key={item.id} style={[styles.chip, account === item.name && styles.chipActive]} onPress={() => setAccount(item.name)}><Text style={[styles.chipText, account === item.name && styles.chipTextActive]}>{item.name}</Text></Pressable>)}</ScrollView></>}
      {type === "transfer" && <><Text style={styles.fieldLabel}>CONTA DE DESTINO</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{accounts.filter((item) => item.name !== account).map((item) => <Pressable key={item.id} style={[styles.chip, destinationAccount === item.name && styles.chipActive]} onPress={() => setDestinationAccount(item.name)}><Text style={[styles.chipText, destinationAccount === item.name && styles.chipTextActive]}>{item.name}</Text></Pressable>)}</ScrollView></>}
      {error ? <Text style={styles.error}>{error}</Text> : null}<Pressable disabled={busy || scanning} style={[styles.save, (busy || scanning) && styles.disabled]} onPress={save}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>{scanning ? "Lendo cupom…" : "Salvar lançamento"}</Text>}</Pressable>
    </ScrollView></View></View></Modal>;
}

function makeStyles(p: Palette) { return StyleSheet.create({
  layer: { flex: 1, justifyContent: "flex-end" }, backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,.62)" }, sheet: { maxHeight: "94%", padding: 20, paddingBottom: 34, borderTopLeftRadius: 29, borderTopRightRadius: 29, backgroundColor: p.surface }, handle: { width: 40, height: 4, alignSelf: "center", marginBottom: 16, borderRadius: 2, backgroundColor: p.border }, titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }, eyebrow: { color: p.accent, fontSize: 8, fontWeight: "900", letterSpacing: 1.2 }, title: { marginTop: 4, color: p.text, fontSize: 22, fontWeight: "900" }, cameraButton: { width: 46, height: 46, alignItems: "center", justifyContent: "center", borderRadius: 15, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface2 }, cameraAttached: { borderColor: p.success, backgroundColor: `${p.success}1c` }, cameraIcon: { color: p.accent, fontSize: 18, fontWeight: "900" }, receipt: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12, padding: 10, borderRadius: 15, backgroundColor: p.accentSoft }, receiptImage: { width: 45, height: 45, borderRadius: 10 }, receiptMain: { flex: 1 }, receiptTitle: { color: p.text, fontSize: 10, fontWeight: "900" }, receiptCopy: { marginTop: 3, color: p.muted, fontSize: 8, lineHeight: 12 }, removeReceipt: { color: p.muted, fontSize: 22 }, scanWarning: { gap: 3, marginBottom: 10, padding: 10, borderRadius: 13, backgroundColor: `${p.warning}18` }, scanWarningText: { color: p.warning, fontSize: 8, lineHeight: 12 }, toggle: { flexDirection: "row", gap: 7, marginBottom: 11, padding: 4, borderRadius: 14, backgroundColor: p.surface2 }, toggleButton: { flex: 1, height: 39, alignItems: "center", justifyContent: "center", borderRadius: 11 }, toggleActive: { backgroundColor: p.accent }, toggleText: { color: p.muted, fontSize: 10, fontWeight: "900" }, toggleTextActive: { color: "#fff" }, descriptionRow: { flexDirection: "row", gap: 8 }, descriptionInput: { flex: 1 }, inlineCamera: { width: 52, height: 52, alignItems: "center", justifyContent: "center", borderRadius: 15, borderWidth: 1, borderColor: p.border, backgroundColor: p.bg }, inlineCameraText: { color: p.accent, fontSize: 17, fontWeight: "900" }, input: { height: 52, marginBottom: 10, paddingHorizontal: 15, color: p.text, borderRadius: 15, borderWidth: 1, borderColor: p.border, backgroundColor: p.bg }, amountInput: { height: 64, fontSize: 24, fontWeight: "900" }, fieldLabel: { marginTop: 5, marginBottom: 8, color: p.muted, fontSize: 8, fontWeight: "900", letterSpacing: 1 }, chips: { gap: 7, paddingRight: 20, paddingBottom: 9 }, chip: { minHeight: 36, justifyContent: "center", paddingHorizontal: 13, borderRadius: 12, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface2 }, chipActive: { borderColor: p.accent, backgroundColor: p.accentSoft }, chipText: { color: p.muted, fontSize: 9, fontWeight: "800" }, chipTextActive: { color: p.accent }, error: { marginTop: 7, color: p.warning, fontSize: 9, lineHeight: 14 }, save: { height: 54, alignItems: "center", justifyContent: "center", marginTop: 12, borderRadius: 17, backgroundColor: p.accent }, saveText: { color: "#fff", fontSize: 12, fontWeight: "900" }, disabled: { opacity: .45 },
}); }
