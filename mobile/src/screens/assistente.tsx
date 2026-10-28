/** Fluxo IA: context is prepared and conversation history is stored by the server. */
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Alert, AppState, KeyboardAvoidingView, Platform, Pressable, FlatList, TextInput, View } from "react-native";
import { CaretLeft, ClockCounterClockwise, Plus, Sparkle, Trash } from "phosphor-react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { call } from "../net/client.ts";
import type { AnaliseFinanceira, EstadoDoAssistente, MensagemDoAssistente, RespostaDoAssistente } from "../net/views.ts";
import { useConnectedSession } from "../state/session.tsx";
import { familiaDoPeso } from "../ui/fonts.ts";
import { ScreenGlow } from "../ui/mockup.tsx";
import { Body, Button, Card, Notice, Small, Texto } from "../ui/primitives.tsx";
import { radius, space, type, usePalette } from "../ui/theme.ts";

type Props = { onVoltar?: () => void; notificationId?: string; onConfigurar?: () => void };

function useSavedAnalysis(status: EstadoDoAssistente | null, setStatus: Dispatch<SetStateAction<EstadoDoAssistente | null>>) {
  const { credentials } = useConnectedSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const running = useRef(false);
  const reading = useRef(false);
  const version = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  const retryAt = status?.analysis?.lastError && status.analysis.retryAfter ? Date.parse(status.analysis.retryAfter) : 0;
  const cooldown = Number.isFinite(retryAt) && retryAt > now;

  useEffect(() => () => {
    version.current++;
    activeRequest.current?.abort();
  }, [credentials]);

  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(retryAt - Date.now() + 100, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [cooldown, retryAt]);

  const readSaved = useCallback(async (signal: AbortSignal) => {
    if (reading.current || AppState.currentState !== "active") return;
    reading.current = true;
    const current = version.current;
    try {
      const { insights, suggestions, ...analysis } = await call<AnaliseFinanceira>("/api/v1/assistant/analysis", { ...credentials, signal });
      if (!signal.aborted && current === version.current) setStatus((old) => old ? { ...old, insights, suggestions, analysis } : old);
    } catch { /* Offline polling keeps the saved insights. */ }
    finally { reading.current = false; }
  }, [credentials, setStatus]);

  useEffect(() => {
    if (!status?.analysis?.updating && !status?.analysis?.stale) return;
    const controller = new AbortController();
    const timer = setInterval(() => void readSaved(controller.signal), status?.analysis?.updating ? 15_000 : 60_000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [status?.analysis?.updating, status?.analysis?.stale, readSaved]);

  async function refresh() {
    if (running.current || !status || status.analysis?.updating || cooldown) return;
    running.current = true;
    const request = new AbortController();
    activeRequest.current = request;
    const current = version.current;
    setBusy(true);
    setError(null);
    try {
      const { insights, suggestions, ...analysis } = await call<AnaliseFinanceira>("/api/v1/assistant/analysis", { ...credentials, method: "POST", timeoutMs: 50_000, signal: request.signal });
      if (request.signal.aborted || current !== version.current) return;
      version.current++;
      setStatus((old) => old ? { ...old, insights, suggestions, analysis } : old);
      setNow(Date.now());
    } catch {
      if (!request.signal.aborted && current === version.current) setError("Não foi possível atualizar a análise. O último resultado foi mantido. Tente novamente em instantes.");
    } finally { if (activeRequest.current === request) activeRequest.current = null; running.current = false; setBusy(false); }
  }

  return { busy, error, cooldown, refresh };
}

export function AssistenteScreen({ onVoltar, notificationId, onConfigurar }: Props) {
  const palette = usePalette();
  const { credentials } = useConnectedSession();
  const [status, setStatus] = useState<EstadoDoAssistente | null>(null);
  const [messages, setMessages] = useState<readonly MensagemDoAssistente[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [question, setQuestion] = useState("");
  const [contextNotificationId, setContextNotificationId] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const requestEpoch = useRef(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroll = useRef<FlatList<MensagemDoAssistente>>(null);
  const input = useRef<TextInput>(null);
  const analysis = useSavedAnalysis(status, setStatus);

  const load = useCallback(async (id?: string, notice?: string, signal?: AbortSignal) => {
    const epoch = ++requestEpoch.current;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (id) params.set("conversationId", id);
    if (notice) params.set("notificationId", notice);
    try {
      const data = await call<EstadoDoAssistente>(`/api/v1/assistant${params.size ? `?${params}` : ""}`, { ...credentials, signal, timeoutMs: 50_000 });
      if (signal?.aborted || epoch !== requestEpoch.current) return;
      setStatus(data);
      setMessages(data.conversation?.messages ?? []);
      setConversationId(data.conversation?.id);
      setQuestion(data.notificationPrompt ?? "");
      setContextNotificationId(notice);
      setHistoryOpen(false);
    } catch (problem) {
      if (!signal?.aborted) setError(problem instanceof Error ? problem.message : "Não foi possível abrir sua conversa.");
    } finally { setLoading(false); }
  }, [credentials]);

  useEffect(() => {
    const controller = new AbortController();
    void load(undefined, notificationId, controller.signal);
    return () => controller.abort();
  }, [load, notificationId]);

  async function ask() {
    const text = question.trim();
    if (text.length < 3 || busy || loading) return;
    const epoch = ++requestEpoch.current;
    setBusy(true);
    setError(null);
    try {
      const reply = await call<RespostaDoAssistente>("/api/v1/assistant", {
        ...credentials, method: "POST", timeoutMs: 50_000,
        body: { question: text, ...(conversationId ? { conversationId } : {}), ...(contextNotificationId ? { notificationId: contextNotificationId } : {}) },
      });
      const stamp = new Date().toISOString();
      setMessages((old) => [...old,
        { id: `${stamp}-user`, role: "user", content: text, createdAt: stamp },
        { id: `${stamp}-assistant`, role: "assistant", content: reply.answer, createdAt: stamp, advice: reply },
      ]);
      setConversationId(reply.conversationId);
      setQuestion("");
      if (reply.remaining !== undefined) setStatus((old) => old ? { ...old, advice: { ...old.advice, remaining: reply.remaining! } } : old);
      call<EstadoDoAssistente>("/api/v1/assistant", { ...credentials, timeoutMs: 50_000 }).then((data) => { if (epoch === requestEpoch.current) setStatus(data); }).catch(() => undefined);
      requestAnimationFrame(() => scroll.current?.scrollToEnd({ animated: true }));
    } catch (problem) {
      setError(`${problem instanceof Error ? problem.message : "Não foi possível conversar agora."} Sua pergunta foi mantida.`);
    } finally { setBusy(false); }
  }

  async function removeConversation() {
    if (!conversationId || busy || loading) return;
    const id = conversationId;
    const epoch = ++requestEpoch.current;
    setDeleting(true);
    setBusy(true);
    setError(null);
    try {
      await call("/api/v1/assistant", { ...credentials, method: "DELETE", body: { conversationId: id } });
      setStatus((old) => old ? { ...old, conversation: null, conversations: old.conversations?.filter((item) => item.id !== id) } : old);
      setMessages([]);
      setConversationId(undefined);
      setQuestion("");
      setContextNotificationId(undefined);
      setHistoryOpen(false);
      call<EstadoDoAssistente>("/api/v1/assistant", { ...credentials, timeoutMs: 50_000 }).then((data) => { if (epoch === requestEpoch.current) setStatus(data); }).catch(() => undefined);
    } catch (problem) {
      setError(`${problem instanceof Error ? problem.message : "Não foi possível apagar a conversa."} O histórico foi mantido.`);
    } finally { setDeleting(false); setBusy(false); }
  }

  function confirmRemoval() {
    Alert.alert("Excluir esta conversa?", "Todas as mensagens desta conversa serão apagadas da sua conta. Seus dados financeiros permanecem intactos. Esta ação não pode ser desfeita.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Excluir conversa", style: "destructive", onPress: () => void removeConversation() },
    ]);
  }

  const disabled = !status?.configured || (status?.advice.remaining ?? 0) <= 0;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.canvas }} edges={["top"]}>
      <ScreenGlow height={260} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 12, gap: 12 }}>
          {onVoltar ? <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={onVoltar} style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? palette.surfaceRaised : palette.surface, borderWidth: 1, borderColor: palette.line })}><CaretLeft size={20} color={palette.ink} /></Pressable> : null}
          <View style={{ flex: 1 }}><Texto style={[type.heading, { color: palette.ink }]}>Fluxo IA</Texto><Small>Seus números, com mais clareza.</Small></View>
          {conversationId ? <Pressable accessibilityRole="button" accessibilityLabel="Excluir conversa atual" disabled={busy || loading} onPress={confirmRemoval} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", opacity: busy || loading ? .5 : 1 }}><Trash size={21} color={palette.inkMuted} /></Pressable> : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Nova conversa" disabled={busy || loading} onPress={() => void load()} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", opacity: busy || loading ? .5 : 1 }}><Plus size={22} color={palette.accent} /></Pressable>
        </View>

        <FlatList ref={scroll} data={messages} keyExtractor={messageKey} renderItem={renderMessage} ItemSeparatorComponent={MessageGap} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 14 }} ListHeaderComponent={<>
          {!status?.configured && !loading ? <Card><Body>Conecte seu provedor para conversar sobre suas finanças. Os avisos essenciais e o restante do Fluxo continuam disponíveis.</Body>{onConfigurar ? <Button label="Configurar integração" variant="secondary" onPress={onConfigurar} style={{ marginTop: space.sm }} /> : <Small style={{ marginTop: space.sm }}>Acesse Configurações → Integrações.</Small>}</Card> : null}
          {status?.conversations?.length ? <View><Pressable accessibilityRole="button" accessibilityState={{ expanded: historyOpen }} onPress={() => setHistoryOpen(!historyOpen)} style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8 }}><ClockCounterClockwise size={18} color={palette.inkSubtle} /><Body muted>Conversas anteriores</Body></Pressable>{historyOpen ? <Card style={{ padding: 8 }}>{status.conversations.map((conversation) => <Pressable key={conversation.id} accessibilityRole="button" accessibilityState={{ selected: conversation.id === conversationId }} disabled={busy || loading} onPress={() => void load(conversation.id)} style={{ minHeight: 48, padding: 12, borderRadius: radius.md, backgroundColor: conversation.id === conversationId ? palette.accentWash : "transparent" }}><Body numberOfLines={2}>{conversation.title}</Body></Pressable>)}</Card> : null}</View> : null}
          {loading ? <Small>Carregando sua conversa…</Small> : null}
          {status ? <View style={{ gap: 8, marginVertical: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}><Body strong style={{ flex: 1 }}>Análise financeira</Body><Button label="Atualizar análise" variant="ghost" busy={analysis.busy} disabled={analysis.busy || status.analysis?.updating || analysis.cooldown} onPress={() => void analysis.refresh()} /></View>
            <View accessibilityLiveRegion="polite"><Small>{analysisStatus(status, analysis.busy, analysis.cooldown)}</Small></View>
            {analysis.error ? <Notice tone="caution">{analysis.error}</Notice> : null}
          </View> : null}
          {!messages.length && !loading ? <>
            {status?.insights?.slice(0, 2).map((insight) => <Card key={insight.key} style={{ padding: 14 }}><Body strong>{insight.title}</Body><Small style={{ marginTop: 5 }}>{insight.body}</Small><Button label="Conversar sobre isso" disabled={disabled || busy} variant="ghost" onPress={() => { setQuestion(insight.question); input.current?.focus(); }} style={{ marginTop: 6, alignSelf: "flex-start", paddingHorizontal: 0 }} /></Card>)}
            <View style={{ paddingVertical: 18, gap: 10 }}><Sparkle size={30} color={palette.accent} /><Texto style={[type.heading, { color: palette.ink }]}>O que gostaria de entender?</Texto><Body muted>Posso explicar seus gastos e compromissos e ajudar a planejar uma reserva com os dados registrados no Fluxo.</Body></View>
            {status?.suggestions?.map((suggestion) => <Pressable key={suggestion} accessibilityRole="button" disabled={disabled || busy} onPress={() => { setQuestion(suggestion); input.current?.focus(); }} style={({ pressed }) => ({ minHeight: 48, borderWidth: 1, borderColor: palette.line, borderRadius: radius.md, padding: 12, backgroundColor: pressed ? palette.accentWash : palette.surface, opacity: disabled ? .5 : 1 })}><Body>{suggestion}</Body></Pressable>)}
          </> : null}
        </>} ListFooterComponent={busy ? <Small tone="muted">{deleting ? "Apagando conversa…" : "Analisando seu contexto financeiro…"}</Small> : null} />

        <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16, borderTopWidth: 1, borderTopColor: palette.line, backgroundColor: palette.surface }}>
          {error ? <View style={{ marginBottom: 8 }}><Notice tone="negative">{error}</Notice>{!status ? <Button label="Tentar novamente" variant="ghost" onPress={() => void load(undefined, notificationId)} /> : null}</View> : null}
          {contextNotificationId && !messages.length ? <Small style={{ marginBottom: 8 }}>Pergunta preparada pela notificação. Revise antes de enviar.</Small> : null}
          <Small style={{ marginBottom: 6 }}>Sua mensagem</Small>
          <TextInput ref={input} accessibilityLabel="Sua mensagem para Fluxo IA" value={question} onChangeText={setQuestion} multiline maxLength={500} editable={!disabled && !busy && !loading} placeholder="Pergunte sobre suas finanças…" placeholderTextColor={palette.inkSubtle} style={[type.body, { color: palette.ink, fontFamily: familiaDoPeso(type.body.fontWeight), minHeight: 64, maxHeight: 136, textAlignVertical: "top", borderRadius: radius.md, borderWidth: 1, borderColor: palette.lineStrong, backgroundColor: palette.surfaceSunken, padding: 12 }]} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8 }}><Small style={{ flex: 1 }}>{status?.advice.remaining === 0 ? "Cota esgotada. Volta amanhã." : `${status?.advice.remaining ?? "—"} consultas hoje`}</Small><Button label="Enviar" busy={busy} disabled={disabled || loading || question.trim().length < 3} onPress={() => void ask()} /></View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function analysisStatus(state: EstadoDoAssistente, busy: boolean, cooldown: boolean): string {
  if (busy || state.analysis?.updating) return "Atualizando análise… O último resultado continua disponível.";
  if (!state.insights?.length && !state.analysis?.generatedAt) return state.analysis?.lastError ? "Análise financeira ainda não disponível. Tente atualizar mais tarde." : "Análise financeira ainda não disponível.";
  if (state.analysis?.lastError) return cooldown ? "A atualização encontrou um problema. O último resultado foi mantido; tente novamente mais tarde." : "A atualização encontrou um problema. O último resultado foi mantido.";
  if (state.analysis?.stale) return "Atualização pendente. Estes são os últimos insights disponíveis.";
  if (state.analysis?.generatedAt) {
    const date = new Date(state.analysis.generatedAt);
    if (!Number.isNaN(date.getTime())) return `Atualizado em ${date.toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}.`;
  }
  return state.insights?.length ? "Insights salvos a partir dos seus registros." : "Análise financeira ainda não disponível.";
}

function Message({ message }: { message: MensagemDoAssistente }) {
  const palette = usePalette();
  const user = message.role === "user";
  return <Card style={{ alignSelf: user ? "flex-end" : "flex-start", maxWidth: "96%", padding: 15, backgroundColor: user ? palette.accentWash : palette.surface, borderColor: user ? palette.accentEdge : palette.line }}><Small style={{ marginBottom: 7 }}>{user ? "Você" : "Fluxo IA"}</Small><Body>{message.content}</Body>{message.advice?.actions.map((action) => <View key={action.label} style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: palette.line, paddingTop: 10 }}><Body strong>{action.label}</Body><Small tone={action.priority === "alta" ? "negative" : "muted"} style={{ marginTop: 3 }}>{action.reason}</Small></View>)}{message.advice?.warnings.map((warning) => <Small key={warning} tone="caution" style={{ marginTop: 8 }}>{warning}</Small>)}</Card>;
}

function MessageGap() { return <View style={{ height: 14 }} />; }

function messageKey(message: MensagemDoAssistente) { return message.id; }
function renderMessage({ item }: { item: MensagemDoAssistente }) { return <Message message={item} />; }
