import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { parseImportedText, type MobileImportResult } from "../import";
import type { Palette } from "../theme";
import type { FinanceCard, FinanceSnapshot, FinanceTransaction } from "../types";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
type Mode = { kind: "history" } | { kind: "card"; card: FinanceCard; month: string };

export function ImportSheet({ open, mode, snapshot, palette, onClose, onImport }: { open: boolean; mode: Mode; snapshot: FinanceSnapshot; palette: Palette; onClose: () => void; onImport: (items: FinanceTransaction[]) => Promise<void> | void }) {
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const usableAccounts = snapshot.accounts.filter((item) => item.kind !== "credit-card");
  const initialAccount = mode.kind === "card" ? mode.card.linkedAccount : usableAccounts[0]?.name ?? "Nubank";
  const [account, setAccount] = useState(initialAccount); const [result, setResult] = useState<MobileImportResult | null>(null);
  const [files, setFiles] = useState<string[]>([]); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);

  async function chooseFiles() {
    setError(""); setBusy(true); setResult(null); setFiles([]);
    try {
      const picked = await DocumentPicker.getDocumentAsync({ multiple: mode.kind === "history", copyToCacheDirectory: true, type: ["text/csv", "application/json", "application/x-ofx", "text/plain", "application/pdf"] });
      if (picked.canceled) return;
      const combined: FinanceTransaction[] = []; let ignored = 0; let expandedInstallments = 0; const names: string[] = [];
      for (const asset of picked.assets) {
        const extension = (asset.name.split(".").pop() ?? "csv").toLowerCase();
        if (extension === "pdf") throw new Error("PDF ainda exige extração visual. Exporte esta fatura em CSV; OFX, CSV e JSON já são lidos por inteiro.");
        const text = await FileSystem.readAsStringAsync(asset.uri);
        const parsed = parseImportedText(text, extension, { account, card: mode.kind === "card" ? mode.card : undefined, invoiceMonth: mode.kind === "card" ? mode.month : undefined });
        combined.push(...parsed.items); ignored += parsed.ignored; expandedInstallments += parsed.expandedInstallments; names.push(asset.name);
      }
      const months = combined.map((item) => item.invoiceMonth ?? item.date.slice(0, 7)).sort();
      setFiles(names); setResult({ items: combined, ignored, expandedInstallments, firstMonth: months[0], lastMonth: months.at(-1) });
      if (!combined.length) setError("Não encontrei lançamentos válidos. O arquivo precisa ter data, descrição e valor.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não consegui ler esse arquivo."); }
    finally { setBusy(false); }
  }

  async function confirm() { if (!result?.items.length) return; setBusy(true); try { await onImport(result.items); close(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Não consegui salvar a importação."); } finally { setBusy(false); } }
  function close() { setResult(null); setFiles([]); setError(""); setBusy(false); onClose(); }
  const visibleItems = mode.kind === "card" ? result?.items.filter((item) => item.invoiceMonth === mode.month) ?? [] : result?.items ?? [];
  const visibleTotal = visibleItems.reduce((sum, item) => sum + (item.type === "expense" ? item.amount : -item.amount), 0);

  return <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
    <View style={styles.layer}><Pressable style={styles.backdrop} onPress={close} /><View style={styles.sheet}>
      <View style={styles.handle} /><Text style={styles.eyebrow}>{mode.kind === "history" ? "MIGRAÇÃO DE HISTÓRICO" : "IMPORTAÇÃO DE FATURA"}</Text><Text style={styles.title}>{mode.kind === "history" ? "Trazer dados do app antigo" : `${mode.card.name} · ${mode.month.slice(5, 7)}/${mode.month.slice(0, 4)}`}</Text>
      <Text style={styles.copy}>{mode.kind === "history" ? "Selecione um ou vários CSV, OFX ou JSON. O Fluxo preserva as datas para reconstruir sua vida financeira." : "A competência escolhida será respeitada. Parcelas como 3/10 também criam as anteriores e futuras."}</Text>
      {mode.kind === "history" && <><Text style={styles.fieldLabel}>CONTA PADRÃO</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{usableAccounts.map((item) => <Pressable key={item.id} style={[styles.chip, account === item.name && styles.chipActive]} onPress={() => setAccount(item.name)}><Text style={[styles.chipText, account === item.name && styles.chipTextActive]}>{item.name}</Text></Pressable>)}</ScrollView></>}
      <Pressable style={({ pressed }) => [styles.dropzone, pressed && styles.pressed]} onPress={chooseFiles} disabled={busy}>{busy ? <ActivityIndicator color={palette.accent} /> : <><Text style={styles.uploadIcon}>⇧</Text><Text style={styles.dropTitle}>{files.length ? files.join(", ") : mode.kind === "history" ? "Selecionar arquivos" : "Selecionar fatura"}</Text><Text style={styles.dropCopy}>CSV · OFX · JSON</Text></>}</Pressable>
      {error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text></View> : null}
      {result?.items.length ? <View style={styles.review}>
        <View style={styles.summary}><View><Text style={styles.summaryValue}>{result.items.length}</Text><Text style={styles.summaryLabel}>LANÇAMENTOS CRIADOS</Text></View><View style={styles.summaryRight}><Text style={styles.summaryTotal}>{currency.format(Math.abs(visibleTotal))}</Text><Text style={styles.summaryLabel}>{mode.kind === "card" ? "TOTAL DESTA FATURA" : "SALDO MOVIMENTADO"}</Text></View></View>
        <Text style={styles.period}>{result.firstMonth === result.lastMonth ? `Período: ${result.firstMonth}` : `Histórico: ${result.firstMonth} até ${result.lastMonth}`}{result.expandedInstallments ? ` · ${result.expandedInstallments} parcelas anteriores/futuras geradas` : ""}{result.ignored ? ` · ${result.ignored} linhas ignoradas` : ""}</Text>
        <ScrollView style={styles.preview}>{visibleItems.slice(0, 5).map((item) => <View style={styles.previewRow} key={item.id}><View style={styles.previewMain}><Text style={styles.previewName} numberOfLines={1}>{item.description}</Text><Text style={styles.previewMeta}>{item.date} · {item.category}{item.installments ? ` · ${item.installments}` : ""}</Text></View><Text style={styles.previewValue}>{currency.format(item.amount)}</Text></View>)}</ScrollView>
      </View> : null}
      <View style={styles.actions}><Pressable style={styles.cancel} onPress={close}><Text style={styles.cancelText}>Cancelar</Text></Pressable><Pressable disabled={!result?.items.length || busy} style={[styles.confirm, (!result?.items.length || busy) && styles.disabled]} onPress={confirm}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmText}>Importar {result?.items.length || ""}</Text>}</Pressable></View>
    </View></View>
  </Modal>;
}

function makeStyles(p: Palette) { return StyleSheet.create({
  layer: { flex: 1, justifyContent: "flex-end" }, backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,.62)" }, sheet: { maxHeight: "92%", padding: 21, paddingBottom: 34, borderTopLeftRadius: 29, borderTopRightRadius: 29, backgroundColor: p.surface }, handle: { width: 40, height: 4, alignSelf: "center", marginBottom: 19, borderRadius: 2, backgroundColor: p.border }, eyebrow: { color: p.accent, fontSize: 8, fontWeight: "900", letterSpacing: 1.3 }, title: { marginTop: 5, color: p.text, fontSize: 22, fontWeight: "900", letterSpacing: -.5 }, copy: { marginTop: 7, color: p.muted, fontSize: 10, lineHeight: 15 }, fieldLabel: { marginTop: 15, marginBottom: 8, color: p.muted, fontSize: 8, fontWeight: "900", letterSpacing: 1 }, chips: { gap: 7, paddingRight: 20 }, chip: { minHeight: 35, justifyContent: "center", paddingHorizontal: 12, borderRadius: 11, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface2 }, chipActive: { borderColor: p.accent, backgroundColor: p.accentSoft }, chipText: { color: p.muted, fontSize: 9, fontWeight: "700" }, chipTextActive: { color: p.accent }, dropzone: { minHeight: 112, alignItems: "center", justifyContent: "center", marginTop: 17, borderRadius: 19, borderWidth: 1, borderStyle: "dashed", borderColor: p.accent, backgroundColor: p.accentSoft }, uploadIcon: { color: p.accent, fontSize: 25 }, dropTitle: { maxWidth: "90%", marginTop: 5, color: p.text, fontSize: 11, fontWeight: "900", textAlign: "center" }, dropCopy: { marginTop: 4, color: p.muted, fontSize: 8 }, pressed: { opacity: .7 }, error: { marginTop: 10, padding: 12, borderRadius: 13, backgroundColor: `${p.warning}18` }, errorText: { color: p.warning, fontSize: 9, lineHeight: 14 }, review: { marginTop: 12, padding: 15, borderRadius: 18, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface2 }, summary: { flexDirection: "row", justifyContent: "space-between" }, summaryRight: { alignItems: "flex-end" }, summaryValue: { color: p.text, fontSize: 22, fontWeight: "900" }, summaryTotal: { color: p.accent, fontSize: 17, fontWeight: "900" }, summaryLabel: { marginTop: 2, color: p.muted, fontSize: 7, fontWeight: "900", letterSpacing: .7 }, period: { marginTop: 9, color: p.muted, fontSize: 8, lineHeight: 12 }, preview: { maxHeight: 210, marginTop: 10 }, previewRow: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.border }, previewMain: { flex: 1 }, previewName: { color: p.text, fontSize: 9, fontWeight: "800" }, previewMeta: { marginTop: 3, color: p.muted, fontSize: 7 }, previewValue: { color: p.text, fontSize: 9, fontWeight: "900" }, actions: { flexDirection: "row", gap: 9, marginTop: 15 }, cancel: { flex: 1, height: 51, alignItems: "center", justifyContent: "center", borderRadius: 15, borderWidth: 1, borderColor: p.border }, cancelText: { color: p.text, fontSize: 11, fontWeight: "800" }, confirm: { flex: 1.4, height: 51, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: p.accent }, confirmText: { color: "#fff", fontSize: 11, fontWeight: "900" }, disabled: { opacity: .38 },
}); }
