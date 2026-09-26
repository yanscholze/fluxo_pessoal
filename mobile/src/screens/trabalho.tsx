import { useEffect, useState, type ReactNode } from "react";
import { Modal, Pressable, RefreshControl, ScrollView, TextInput, View } from "react-native";
import { Briefcase, CheckCircle, Clock } from "phosphor-react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { cents } from "@fluxo/core/kernel/money.ts";
import { checklistProgress, stageProgress } from "@fluxo/core/domain/work/checklist.ts";
import { fetchProjetoDetalhe, fetchProjetos, type ProjetoDetalheView, type ProjetoView } from "../net/views.ts";
import { useRemoto } from "../state/remote.tsx";
import { useConnectedSession } from "../state/session.tsx";
import { money, relativeDate } from "../ui/format.ts";
import { GraficoDeLinha } from "../ui/charts.tsx";
import { ScreenHeader } from "../ui/mockup.tsx";
import { Empty, Small, Texto } from "../ui/primitives.tsx";
import { radius, type, usePalette } from "../ui/theme.ts";
import { HorasScreen } from "./horas.tsx";
import { call } from "../net/client.ts";

export function TrabalhoScreen({ onAjustes }: { onAjustes: () => void }) {
  const palette = usePalette();
  const { credentials } = useConnectedSession();
  const remoto = useRemoto(fetchProjetos);
  const [selecionado, setSelecionado] = useState<ProjetoView | null>(null);
  const [detalhe, setDetalhe] = useState<ProjetoDetalheView | null>(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
  const [novaTarefa, setNovaTarefa] = useState("");
  const [tarefaHoras, setTarefaHoras] = useState<string | null>(null);
  const [tarefaAberta, setTarefaAberta] = useState<string | null>(null);
  const [etapasRecolhidas, setEtapasRecolhidas] = useState<Record<string, boolean>>({});
  const dados = remoto.dados;
  const pendentes = dados?.projects.reduce((total, projeto) => total + projeto.openTasks, 0) ?? 0;
  const encerrar = () => { setSelecionado(null); setDetalhe(null); setTarefaHoras(null); remoto.recarregar(); };
  useEffect(() => {
    if (!selecionado) return;
    setCarregandoDetalhe(true);
    void fetchProjetoDetalhe(credentials, selecionado.id).then(setDetalhe).catch(() => setDetalhe(null)).finally(() => setCarregandoDetalhe(false));
  }, [selecionado, credentials]);

  async function atualizarDetalhe() {
    if (!selecionado) return;
    setDetalhe(await fetchProjetoDetalhe(credentials, selecionado.id));
  }
  async function adicionarTarefa(groupId: string | null) {
    if (!selecionado || !novaTarefa.trim()) return;
    await call(`/api/v1/projects/${selecionado.id}/tasks`, { baseUrl: credentials.baseUrl, token: credentials.token, method: "POST", body: { title: novaTarefa.trim(), groupId } });
    setNovaTarefa(""); await atualizarDetalhe();
  }
  const checklistAtual = checklistProgress(detalhe?.tasks ?? []);

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
      {dados?.projects.map((projeto) => <ProjetoCard key={projeto.id} projeto={projeto} onPress={() => setSelecionado(projeto)} />)}
      </ScrollView>
      <Modal visible={selecionado !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={encerrar}>
        {selecionado ? <SafeAreaView style={{ flex: 1, backgroundColor: palette.canvas }} edges={["top", "bottom"]}>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}><View><Texto style={[type.title, { color: palette.ink }]}>{selecionado.name}</Texto><Small>{selecionado.clientName ?? "Projeto próprio"}</Small></View><Pressable onPress={encerrar}><Small>Fechar</Small></Pressable></View>
            {carregandoDetalhe ? <Small>Carregando checklist…</Small> : null}
            {detalhe ? <>
              <View style={{ borderRadius: radius.lg, backgroundColor: palette.surface, padding: 16 }}>
                <Texto style={[type.bodyStrong, { color: palette.ink }]}>Checklist do projeto</Texto>
                <Small>{checklistAtual.completed}/{checklistAtual.total} concluídas · {checklistAtual.percent}%</Small>
                <View style={{ height: 6, borderRadius: 4, backgroundColor: palette.surfaceInset, marginTop: 10, overflow: "hidden" }}><View style={{ height: 6, width: `${checklistAtual.percent}%`, backgroundColor: palette.accent }} /></View>
              </View>
              {[...detalhe.groups, ...(detalhe.tasks.some((task) => !task.archivedAt && !task.groupId) ? [{ id: "", name: "Sem etapa", sortOrder: 999 }] : [])].map((group) => {
                const tarefas = detalhe.tasks.filter((task) => !task.archivedAt && task.groupId === (group.id || null));
                const etapaProgress = group.id ? stageProgress(detalhe.tasks, group.id) : checklistProgress(tarefas);
                const recolhida = etapasRecolhidas[group.id || "none"] ?? false;
                return <View key={group.id || "none"} style={{ borderRadius: radius.lg, backgroundColor: palette.surface, padding: 14, gap: 8 }}>
                  <Pressable accessibilityRole="button" accessibilityState={{ expanded: !recolhida }} onPress={() => setEtapasRecolhidas((state) => ({ ...state, [group.id || "none"]: !recolhida }))}><Texto style={[type.bodyStrong, { color: palette.ink }]}>{recolhida ? "▸" : "▾"} {group.name} <Small>{etapaProgress.completed}/{etapaProgress.total} · {etapaProgress.percent}%</Small></Texto></Pressable>
                  {!recolhida ? tarefas.map((task) => <View key={task.id} style={{ borderTopWidth: 1, borderColor: palette.line, paddingTop: 9 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Pressable accessibilityRole="checkbox" accessibilityLabel={`Concluir ${task.title}`} accessibilityState={{ checked: task.status === "done" }} hitSlop={12} onPress={async () => { await call(`/api/v1/tasks/${task.id}`, { baseUrl: credentials.baseUrl, token: credentials.token, method: "PATCH", body: { status: task.status === "done" ? "todo" : "done" } }); await atualizarDetalhe(); }}>{task.status === "done" ? <CheckCircle size={20} color={palette.positive} weight="fill" /> : <View style={{ width: 17, height: 17, borderRadius: 5, borderWidth: 1.5, borderColor: palette.inkSubtle }} />}</Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Abrir detalhes de ${task.title}`} accessibilityState={{ expanded: tarefaAberta === task.id }} onPress={() => setTarefaAberta((current) => current === task.id ? null : task.id)} style={{ flex: 1, minHeight: 44, justifyContent: "center" }}><Texto style={[type.body, { color: palette.ink }]}>{task.title}</Texto></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Registrar horas em ${task.title}`} hitSlop={12} onPress={() => setTarefaHoras(task.id)} style={{ minHeight: 44, justifyContent: "center" }}><Small style={{ color: palette.accent }}>Registrar horas</Small></Pressable></View>
                    {tarefaAberta === task.id ? <View style={{ marginLeft: 26, gap: 5 }}><Small>Histórico de horas · {Math.round(detalhe.entries.filter((entry) => entry.taskId === task.id).reduce((sum, entry) => sum + entry.durationMilli, 0) / 1000 * 10) / 10} h no total</Small>{detalhe.entries.filter((entry) => entry.taskId === task.id).map((entry) => <Small key={entry.id}>{entry.workedOn} · {Math.round(entry.durationMilli / 1000 * 10) / 10} h · {entry.description}</Small>)}{!detalhe.entries.some((entry) => entry.taskId === task.id) ? <Small>Sem horas registradas ainda.</Small> : null}</View> : null}
                  </View>) : null}
                  {!recolhida ? <View style={{ flexDirection: "row", gap: 8 }}><TextInput value={novaTarefa} onChangeText={setNovaTarefa} placeholder="Novo item do checklist" placeholderTextColor={palette.inkSubtle} style={{ flex: 1, color: palette.ink, backgroundColor: palette.surfaceInset, borderRadius: radius.md, padding: 10 }} /><Pressable onPress={() => void adicionarTarefa(group.id || null)}><Small style={{ color: palette.accent }}>Adicionar</Small></Pressable></View> : null}
                </View>;
              })}
            </> : null}
          </ScrollView>
        </SafeAreaView> : null}
      </Modal>
      <Modal visible={Boolean(selecionado && tarefaHoras)} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setTarefaHoras(null)}>
        {selecionado ? <HorasScreen projeto={selecionado} tasks={detalhe?.tasks.filter((task) => !task.archivedAt && task.status !== "done").map(({ id, title }) => ({ id, title })) ?? []} initialTaskId={tarefaHoras ?? undefined} onClose={() => { setTarefaHoras(null); void atualizarDetalhe(); }} /> : null}
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
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Abrir checklist de ${projeto.name}`} onPress={onPress} style={({ pressed }) => ({ borderRadius: radius.lg, borderWidth: 1, borderColor: palette.line, backgroundColor: pressed ? palette.surfaceRaised : palette.surface, padding: 16 })}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: cor }} /><Texto numberOfLines={1} style={[type.bodyStrong, { color: palette.ink, flex: 1 }]}>{projeto.name}</Texto><View style={{ backgroundColor: `${cor}20`, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 4 }}><Small style={{ color: cor }}>{Math.round(financeiro)}% recebido</Small></View></View>
      <View style={{ flexDirection: "row", marginTop: 10 }}><Small style={{ flex: 1 }}>{projeto.openTasks} tarefas abertas · Checklist {projeto.checklistCompleted}/{projeto.checklistTotal}</Small><Small>{projeto.dueOn ? `Prazo ${relativeDate(projeto.dueOn as never)}` : "Sem prazo"}</Small></View>
      <View style={{ height: 5, borderRadius: 3, backgroundColor: palette.surfaceInset, marginTop: 10, overflow: "hidden" }}><View style={{ width: `${financeiro}%`, height: 5, borderRadius: 3, backgroundColor: cor }} /></View>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}><MiniGrafico label="Pagamentos" value={money(cents(projeto.receivedCents))} percent={financeiro} color={cor} /><MiniGrafico label="Checklist" value={`${projeto.checklistPercent}%`} percent={projeto.checklistPercent} color={palette.positive} /></View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 12 }}><Clock size={13} color={palette.inkSubtle} /><Small>Toque para abrir etapas, histórico e horas</Small></View>
    </Pressable>
  );
}

function MiniGrafico({ label, value, percent, color }: { label: string; value: string; percent: number; color: string }) {
  const palette = usePalette();
  const serie = [Math.max(4, percent * 0.18), Math.max(8, percent * 0.42), Math.max(12, percent * 0.64), Math.max(15, percent * 0.81), Math.max(18, percent)];
  return <View style={{ flex: 1, minHeight: 70, borderRadius: radius.md, backgroundColor: palette.surfaceInset, padding: 10 }}><View style={{ flexDirection: "row", justifyContent: "space-between" }}><Small>{label}</Small><Texto style={[type.caption, { color, fontWeight: "600" }]}>{value}</Texto></View><View style={{ marginTop: 7 }}><GraficoDeLinha valores={serie} altura={28} cor={color} /></View></View>;
}

function limite(valor: number): number { return Math.max(0, Math.min(100, Number.isFinite(valor) ? valor : 0)); }
