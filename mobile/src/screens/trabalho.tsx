import { useState, type ReactNode } from "react";
import { Modal, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { Briefcase, CheckCircle, Clock } from "phosphor-react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { cents } from "@fluxo/core/kernel/money.ts";
import { fetchProjetos, type ProjetoView } from "../net/views.ts";
import { useRemoto } from "../state/remote.tsx";
import { useConnectedSession } from "../state/session.tsx";
import { money, relativeDate } from "../ui/format.ts";
import { ScreenHeader } from "../ui/mockup.tsx";
import { Empty, Small, Texto } from "../ui/primitives.tsx";
import { radius, type, usePalette } from "../ui/theme.ts";
import { HorasScreen } from "./horas.tsx";

export function TrabalhoScreen({ onAjustes }: { onAjustes: () => void }) {
  const palette = usePalette();
  const { credentials } = useConnectedSession();
  const remoto = useRemoto(fetchProjetos);
  const [registrando, setRegistrando] = useState<ProjetoView | null>(null);
  const dados = remoto.dados;
  const pendentes = dados?.projects.reduce((total, projeto) => total + projeto.openTasks, 0) ?? 0;
  const encerrar = () => { setRegistrando(null); remoto.recarregar(); };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.canvas }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 36, gap: 14 }} refreshControl={<RefreshControl refreshing={remoto.carregando} onRefresh={remoto.recarregar} tintColor={palette.accent} />}>
        <ScreenHeader title="Projetos" subtitle={`${dados?.totals.activeProjects ?? 0} projetos ativos`} onProfile={onAjustes} profileName={credentials.user.displayName} />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Resumo icon={<Briefcase size={15} color={palette.accent} weight="fill" />} label="Total contratado" value={dados ? money(cents(dados.totals.contractedCents)) : "—"} />
          <Resumo icon={<CheckCircle size={15} color={palette.caution} weight="fill" />} label="Tarefas pendentes" value={`${pendentes}`} />
        </View>
        {remoto.erro ? <Small tone="negative">{remoto.erro}</Small> : null}
        {dados?.projects.length === 0 ? <Empty title="Nenhum projeto" hint="Seus projetos ativos aparecerão aqui." /> : null}
        {dados?.projects.map((projeto) => <ProjetoCard key={projeto.id} projeto={projeto} onPress={() => setRegistrando(projeto)} />)}
      </ScrollView>
      <Modal visible={registrando !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={encerrar}>
        {registrando ? <HorasScreen projeto={registrando} onClose={encerrar} /> : null}
      </Modal>
    </SafeAreaView>
  );
}

function Resumo({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  const palette = usePalette();
  return <View style={{ flex: 1, minHeight: 78, borderRadius: radius.md, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.surface, padding: 12 }}><View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>{icon}<Small>{label}</Small></View><Texto numberOfLines={1} adjustsFontSizeToFit style={[type.figureSm, { color: palette.ink, marginTop: 9 }]}>{value}</Texto></View>;
}

function ProjetoCard({ projeto, onPress }: { projeto: ProjetoView; onPress: () => void }) {
  const palette = usePalette();
  const cor = projeto.color || palette.accent;
  const financeiro = limite(projeto.percentReceived);
  const horas = projeto.estimatedMilli > 0 ? limite((projeto.workedMilli / projeto.estimatedMilli) * 100) : 0;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Abrir ${projeto.name} e registrar horas`} onPress={onPress} style={({ pressed }) => ({ borderRadius: radius.lg, borderWidth: 1, borderColor: palette.line, backgroundColor: pressed ? palette.surfaceRaised : palette.surface, padding: 16 })}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: cor }} /><Texto numberOfLines={1} style={[type.bodyStrong, { color: palette.ink, flex: 1 }]}>{projeto.name}</Texto><View style={{ backgroundColor: `${cor}20`, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 4 }}><Small style={{ color: cor }}>{Math.round(financeiro)}% recebido</Small></View></View>
      <View style={{ flexDirection: "row", marginTop: 10 }}><Small style={{ flex: 1 }}>{projeto.openTasks} tarefas abertas</Small><Small>{projeto.dueOn ? `Prazo ${relativeDate(projeto.dueOn as never)}` : "Sem prazo"}</Small></View>
      <View style={{ height: 5, borderRadius: 3, backgroundColor: palette.surfaceInset, marginTop: 10, overflow: "hidden" }}><View style={{ width: `${financeiro}%`, height: 5, borderRadius: 3, backgroundColor: cor }} /></View>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}><MiniGrafico label="Pagamentos" value={money(cents(projeto.receivedCents))} percent={financeiro} color={cor} /><MiniGrafico label="Progresso" value={`${Math.round(horas)}%`} percent={horas} color={palette.positive} /></View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 12 }}><Clock size={13} color={palette.inkSubtle} /><Small>Toque para registrar horas</Small></View>
    </Pressable>
  );
}

function MiniGrafico({ label, value, percent, color }: { label: string; value: string; percent: number; color: string }) {
  const palette = usePalette();
  const alturas = [0.35, 0.52, 0.44, 0.7, Math.max(0.18, percent / 100)];
  return <View style={{ flex: 1, minHeight: 70, borderRadius: radius.md, backgroundColor: palette.surfaceInset, padding: 10 }}><View style={{ flexDirection: "row", justifyContent: "space-between" }}><Small>{label}</Small><Texto style={[type.caption, { color: palette.ink, fontWeight: "600" }]}>{value}</Texto></View><View style={{ flexDirection: "row", alignItems: "flex-end", height: 28, gap: 3, marginTop: 7 }}>{alturas.map((altura, indice) => <View key={indice} style={{ flex: 1, height: Math.max(3, altura * 28), borderRadius: 2, backgroundColor: indice === alturas.length - 1 ? color : `${color}48` }} />)}</View></View>;
}

function limite(valor: number): number { return Math.max(0, Math.min(100, Number.isFinite(valor) ? valor : 0)); }
