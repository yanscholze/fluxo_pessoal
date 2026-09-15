import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { CaretLeft } from "phosphor-react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { cents } from "@fluxo/core/kernel/money.ts";
import { fetchInstallments, type InstallmentPlanView } from "../net/views.ts";
import { useRemoto } from "../state/remote.tsx";
import { competence, money, relativeDate } from "../ui/format.ts";
import { Empty, Small, Texto } from "../ui/primitives.tsx";
import { radius, type, usePalette } from "../ui/theme.ts";

export function ParcelamentosScreen({ onVoltar }: { onVoltar?: () => void }) {
  const palette = usePalette();
  const remoto = useRemoto(fetchInstallments);
  const [mostrarQuitados, setMostrarQuitados] = useState(false);
  const dados = remoto.dados;
  const maximo = Math.max(1, ...(dados?.commitment.map((mes) => mes.amountCents) ?? [1]));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.canvas }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40, gap: 14 }} refreshControl={<RefreshControl refreshing={remoto.carregando} onRefresh={remoto.recarregar} tintColor={palette.accent} />}>
        <View style={{ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Voltar aos cartões" onPress={onVoltar} style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: palette.line, backgroundColor: pressed ? palette.surfaceRaised : palette.surface })}><CaretLeft size={20} color={palette.ink} /></Pressable>
          <View><Texto style={[type.title, { color: palette.ink }]}>Parcelamentos</Texto><Small>Compras divididas no cartão</Small></View>
        </View>

        <View style={{ borderRadius: radius.lg, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.surface, padding: 16 }}>
          <Small>Ainda em aberto</Small><Texto style={[type.figure, { color: dados?.totals.openCents ? palette.ink : palette.positive, marginTop: 4 }]}>{dados ? money(cents(dados.totals.openCents)) : "—"}</Texto>
          <View style={{ height: 5, borderRadius: 3, overflow: "hidden", backgroundColor: palette.surfaceInset, marginTop: 12 }}><View style={{ width: `${limite(dados?.totals.percentPaid ?? 0)}%`, height: 5, backgroundColor: palette.accent }} /></View>
          <Small style={{ marginTop: 7 }}>{Math.round(dados?.totals.percentPaid ?? 0)}% de {dados ? money(cents(dados.totals.totalCents)) : "—"} já pago</Small>
        </View>

        {dados?.commitment.length ? <View style={{ borderRadius: radius.lg, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.surface, padding: 16 }}><Texto style={[type.bodyStrong, { color: palette.ink }]}>Comprometimento mensal</Texto><View style={{ height: 106, flexDirection: "row", alignItems: "flex-end", gap: 7, marginTop: 15 }}>{dados.commitment.slice(0, 7).map((mes, indice) => <View key={mes.competence} style={{ flex: 1, alignItems: "center" }}><View style={{ height: 80, width: "100%", justifyContent: "flex-end", alignItems: "center" }}><View style={{ width: "62%", minHeight: 4, height: Math.max(4, (mes.amountCents / maximo) * 80), borderRadius: 4, backgroundColor: indice === 0 ? palette.accent : palette.lineStrong }} /></View><Texto style={[type.caption, { color: indice === 0 ? palette.ink : palette.inkSubtle, marginTop: 6 }]}>{competence(mes.competence as never).slice(0, 3)}</Texto></View>)}</View></View> : null}

        <Texto style={[type.bodyStrong, { color: palette.ink, marginTop: 3 }]}>Em andamento ({dados?.active.length ?? 0})</Texto>
        {dados?.active.length === 0 ? <Empty title="Nenhum parcelamento aberto" /> : null}
        {dados?.active.map((plano) => <Plano key={plano.planId} plano={plano} />)}

        {dados?.settled.length ? <><Pressable onPress={() => setMostrarQuitados((atual) => !atual)} style={{ minHeight: 42, alignItems: "center", justifyContent: "center" }}><Small tone="muted">{mostrarQuitados ? "Ocultar" : "Mostrar"} {dados.settled.length} quitados</Small></Pressable>{mostrarQuitados ? dados.settled.map((plano) => <Plano key={plano.planId} plano={plano} quitado />) : null}</> : null}
        {remoto.erro ? <Small tone="negative">{remoto.erro}</Small> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Plano({ plano, quitado }: { plano: InstallmentPlanView; quitado?: boolean }) {
  const palette = usePalette();
  const progresso = limite(plano.percentPaid);
  return <View style={{ borderRadius: radius.lg, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.surface, padding: 16, opacity: quitado ? 0.68 : 1 }}><View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}><View style={{ flex: 1, minWidth: 0 }}><Texto numberOfLines={1} style={[type.bodyStrong, { color: palette.ink }]}>{plano.label}</Texto><Small style={{ marginTop: 2 }}>{plano.cardName}</Small></View><View style={{ backgroundColor: quitado ? palette.positiveWash : palette.accentWash, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 4 }}><Small style={{ color: quitado ? palette.positive : palette.accent }}>{quitado ? "Quitado" : `${plano.paidCount}/${plano.totalCount}`}</Small></View></View><View style={{ flexDirection: "row", marginTop: 13 }}><View style={{ flex: 1 }}><Small>Valor restante</Small><Texto style={[type.figureSm, { color: palette.ink, marginTop: 2 }]}>{money(cents(plano.openAmount))}</Texto></View><View style={{ alignItems: "flex-end" }}><Small>Próxima parcela</Small><Texto style={[type.bodyStrong, { color: palette.ink, marginTop: 4 }]}>{plano.nextDueDate ? relativeDate(plano.nextDueDate as never) : "—"}</Texto></View></View><View style={{ height: 5, borderRadius: 3, overflow: "hidden", backgroundColor: palette.surfaceInset, marginTop: 13 }}><View style={{ width: `${progresso}%`, height: 5, backgroundColor: plano.overdueCount > 0 ? palette.negative : palette.accent }} /></View>{plano.overdueCount > 0 ? <Small tone="negative" style={{ marginTop: 6 }}>{plano.overdueCount} parcela(s) em atraso</Small> : null}</View>;
}

function limite(valor: number): number { return Math.max(0, Math.min(100, Number.isFinite(valor) ? valor : 0)); }
