import { openDatabaseAsync } from "expo-sqlite";
import { FlexWidget, TextWidget, requestWidgetUpdate, type WidgetInfo, type WidgetRepresentation, type WidgetTaskHandlerProps } from "react-native-android-widget";
import { databaseNameFor } from "./database-name";
import { migrateDatabase, readLocalSnapshot } from "./database";
import { accountBalanceAtMonth, budgetTotals, currentInvoiceTotals } from "./finance-period";
import { getSession } from "./session";
import type { FinanceSnapshot } from "./types";

export const SUMMARY_WIDGET = "FluxoSummary";
export const QUICK_ENTRY_WIDGET = "FluxoQuickEntry";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

type WidgetNumbers = { free: number; balance: number; invoice: number; month: string };

function numbersFrom(snapshot: FinanceSnapshot): WidgetNumbers {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const month = today.slice(0, 7);
  const totals = budgetTotals(snapshot, month);
  const balance = snapshot.accounts
    .filter((account) => account.kind !== "credit-card")
    .reduce((sum, account) => sum + accountBalanceAtMonth(account, snapshot.transactions, month, month), 0);
  return { free: totals.free, balance, invoice: currentInvoiceTotals(snapshot, today).total, month };
}

const colors = {
  light: { bg: "#F7FBFA", surface: "#FFFFFF", text: "#142B35", muted: "#698087", accent: "#0F6B68", accentSoft: "#DDF2EF" },
  dark: { bg: "#0B1114", surface: "#121C20", text: "#F2F7F6", muted: "#94A7AD", accent: "#35B7AA", accentSoft: "#183C3B" },
} as const;

function metric(label: string, value: string, dark: boolean) {
  const p = dark ? colors.dark : colors.light;
  return <FlexWidget style={{ flex: 1, flexDirection: "column" }}>
    <TextWidget text={label} style={{ color: p.muted, fontSize: 9, fontWeight: "700" }} />
    <TextWidget text={value} maxLines={1} truncate="END" style={{ color: p.text, fontSize: 15, fontWeight: "900", marginTop: 3 }} />
  </FlexWidget>;
}

function summaryWidget(data: WidgetNumbers | null, info: WidgetInfo, dark: boolean) {
  const p = dark ? colors.dark : colors.light;
  const compact = info.height < 105 || info.width < 250;
  if (!data) return <FlexWidget clickAction="OPEN_APP" accessibilityLabel="Abrir o Fluxo" style={{ height: "match_parent", width: "match_parent", padding: 16, borderRadius: 22, backgroundColor: p.surface, justifyContent: "center" }}>
    <TextWidget text="FLUXO" style={{ color: p.accent, fontSize: 10, fontWeight: "900", letterSpacing: 1.4 }} />
    <TextWidget text="Abra o aplicativo para conectar sua conta" style={{ color: p.text, fontSize: 14, fontWeight: "800", marginTop: 7 }} />
  </FlexWidget>;
  return <FlexWidget clickAction="OPEN_APP" accessibilityLabel="Resumo financeiro do Fluxo" style={{ height: "match_parent", width: "match_parent", padding: compact ? 14 : 18, borderRadius: 22, backgroundColor: p.surface, flexDirection: "column" }}>
    <FlexWidget style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <TextWidget text="FLUXO" style={{ color: p.accent, fontSize: 10, fontWeight: "900", letterSpacing: 1.4 }} />
      <TextWidget text={`${data.month.slice(5)}/${data.month.slice(0, 4)}`} style={{ color: p.muted, fontSize: 9, fontWeight: "700" }} />
    </FlexWidget>
    <TextWidget text="LIVRE PARA GASTAR" style={{ color: p.muted, fontSize: 8, fontWeight: "800", marginTop: compact ? 8 : 12, letterSpacing: 0.8 }} />
    <TextWidget text={money.format(data.free)} maxLines={1} truncate="END" style={{ color: data.free < 0 ? "#D98200" : p.accent, fontSize: compact ? 22 : 29, fontWeight: "900", marginTop: 2 }} />
    {!compact && <FlexWidget style={{ flexDirection: "row", marginTop: 13, paddingTop: 11, borderTopWidth: 1, borderColor: p.accentSoft }}>
      {metric("Saldo", money.format(data.balance), dark)}
      {metric("Fatura", money.format(data.invoice), dark)}
    </FlexWidget>}
  </FlexWidget>;
}

function quickEntryWidget(dark: boolean) {
  const p = dark ? colors.dark : colors.light;
  return <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: "fluxo://new-transaction" }} accessibilityLabel="Registrar novo lançamento no Fluxo" style={{ height: "match_parent", width: "match_parent", padding: 13, borderRadius: 20, backgroundColor: p.accent, flexDirection: "row", alignItems: "center", justifyContent: "center" }}>
    <TextWidget text="＋" style={{ color: "#FFFFFF", fontSize: 23, fontWeight: "700", marginRight: 7 }} />
    <TextWidget text="Novo lançamento" maxLines={1} truncate="END" style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "900" }} />
  </FlexWidget>;
}

async function readWidgetNumbers() {
  const session = await getSession();
  if (!session) return null;
  const db = await openDatabaseAsync(databaseNameFor(session.user.id));
  try {
    await migrateDatabase(db);
    return numbersFrom(await readLocalSnapshot(db));
  } finally {
    await db.closeAsync();
  }
}

function representation(name: string, info: WidgetInfo, data: WidgetNumbers | null): WidgetRepresentation {
  if (name === QUICK_ENTRY_WIDGET) return { light: quickEntryWidget(false), dark: quickEntryWidget(true) };
  return { light: summaryWidget(data, info, false), dark: summaryWidget(data, info, true) };
}

export async function handleWidgetTask({ widgetInfo, renderWidget }: WidgetTaskHandlerProps) {
  const data = widgetInfo.widgetName === SUMMARY_WIDGET ? await readWidgetNumbers() : null;
  renderWidget(representation(widgetInfo.widgetName, widgetInfo, data));
}

export async function updateAndroidWidgets(snapshot: FinanceSnapshot) {
  const data = numbersFrom(snapshot);
  await Promise.all([
    requestWidgetUpdate({ widgetName: SUMMARY_WIDGET, renderWidget: (info) => representation(SUMMARY_WIDGET, info, data) }),
    requestWidgetUpdate({ widgetName: QUICK_ENTRY_WIDGET, renderWidget: (info) => representation(QUICK_ENTRY_WIDGET, info, null) }),
  ]);
}
