"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "../../ui/dialog.tsx";
import { Button, LinkButton } from "../../ui/controls.tsx";
import { Clock, Plus, Send, Sparkles, Trash2 } from "../../ui/icons.tsx";
import { Badge, Panel } from "../../ui/primitives.tsx";
import type { AiAdvice, AiMessage, AssistantState, FinancialInsight } from "../../ui/ai/contracts.ts";

type Reply = AiAdvice & { remaining: number; conversationId: string };
const PRIORITY = { alta: "negative", media: "caution", baixa: "neutral" } as const;

async function stateRequest(conversationId?: string, notificationId?: string, signal?: AbortSignal): Promise<AssistantState> {
  const query = new URLSearchParams();
  if (conversationId) query.set("conversationId", conversationId);
  if (notificationId) query.set("notificationId", notificationId);
  const response = await fetch(`/api/v1/assistant${query.size ? `?${query}` : ""}`, { signal, cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message ?? "Não foi possível carregar a conversa.");
  return body.data as AssistantState;
}

type ChatProps = { initialState: AssistantState; notificationId?: string; conversationId?: string };

/** Conversation state is independent of the visual layout. Only the server owns history. */
function useConversation({ initialState, notificationId }: ChatProps) {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [messages, setMessages] = useState<readonly AiMessage[]>(initialState.conversation?.messages ?? []);
  const [currentId, setCurrentId] = useState<string | undefined>(initialState.conversation?.id);
  const [question, setQuestion] = useState(initialState.notificationPrompt ?? "");
  const [contextNotificationId, setContextNotificationId] = useState(notificationId);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const requestEpoch = useRef(0);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (messages.length) end.current?.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" }); }, [messages.length]);

  const selectConversation = useCallback(async (id?: string) => {
    const epoch = ++requestEpoch.current;
    setLoading(true);
    setError(null);
    try {
      const data = await stateRequest(id);
      if (epoch !== requestEpoch.current) return;
      setState(data);
      setMessages(data.conversation?.messages ?? []);
      setCurrentId(data.conversation?.id);
      setQuestion("");
      setContextNotificationId(undefined);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Não foi possível abrir esta conversa.");
    } finally { setLoading(false); requestAnimationFrame(() => input.current?.focus()); }
  }, []);

  async function ask() {
    const text = question.trim();
    if (text.length < 3 || busy || loading) return;
    const epoch = ++requestEpoch.current;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/assistant", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: text, ...(currentId ? { conversationId: currentId } : {}), ...(contextNotificationId ? { notificationId: contextNotificationId } : {}) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Não foi possível conversar agora. Sua pergunta foi mantida.");
      const reply = body.data as Reply;
      const createdAt = new Date().toISOString();
      setMessages((previous) => [...previous,
        { id: crypto.randomUUID(), role: "user", content: text, createdAt },
        { id: crypto.randomUUID(), role: "assistant", content: reply.answer, createdAt, advice: reply },
      ]);
      setCurrentId(reply.conversationId);
      setState((previous) => ({ ...previous, advice: { ...previous.advice, remaining: reply.remaining } }));
      setQuestion("");
      // Refresh metadata only after an explicit message, never call the model on render.
      stateRequest().then((data) => { if (epoch === requestEpoch.current) setState(data); }).catch(() => undefined);
      window.dispatchEvent(new Event("fluxo:notifications-refresh"));
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Confira sua conexão e tente novamente. Sua pergunta foi mantida.");
    } finally { setBusy(false); requestAnimationFrame(() => input.current?.focus()); }
  }

  function openDelete() { setDeleteError(null); setConfirmDelete(true); }

  async function removeConversation() {
    if (!currentId || busy || loading || deleting) return;
    const id = currentId;
    const epoch = ++requestEpoch.current;
    setDeleting(true);
    setDeleteError(null);
    try {
      const response = await fetch("/api/v1/assistant", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ conversationId: id }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Não foi possível apagar a conversa.");
      // Clear only after the server confirms deletion. A failed refresh cannot restore this history.
      setState((old) => ({ ...old, conversation: null, conversations: old.conversations?.filter((item) => item.id !== id) }));
      setMessages([]);
      setCurrentId(undefined);
      setQuestion("");
      setContextNotificationId(undefined);
      setError(null);
      setConfirmDelete(false);
      stateRequest().then((data) => { if (epoch === requestEpoch.current) setState(data); }).catch(() => undefined);
      router.replace("/");
    } catch (problem) {
      setDeleteError(problem instanceof Error ? problem.message : "Não foi possível apagar a conversa. O histórico foi mantido.");
    } finally { setDeleting(false); }
  }

  const navDisabled = busy || loading || deleting;
  const interactionDisabled = !state.configured || state.advice.remaining <= 0 || navDisabled;
  const submitDisabled = interactionDisabled || question.trim().length < 3;
  const hasNotificationContext = Boolean(contextNotificationId) && messages.length === 0;
  const quotaCopy = state.advice.remaining <= 0 ? "Você usou as consultas de hoje. A cota volta amanhã." : "As sugestões usam os registros atuais. Dados ausentes ou estimativas devem aparecer identificados.";
  return { state, messages, currentId, question, busy, loading, error, end, input, setQuestion, selectConversation, ask, navDisabled, interactionDisabled, submitDisabled, hasNotificationContext, quotaCopy, confirmDelete, deleting, deleteError, setConfirmDelete, openDelete, removeConversation };
}

export function AssistantChat(props: ChatProps) {
  const { state, messages, currentId, question, busy, loading, error, end, input, setQuestion, selectConversation, ask, navDisabled, interactionDisabled, submitDisabled, hasNotificationContext, quotaCopy, confirmDelete, deleting, deleteError, setConfirmDelete, openDelete, removeConversation } = useConversation(props);
  return (
    <div className="space-y-4">
      {!state.configured ? <Panel variant="inset"><p className="text-body-sm text-ink-muted">Conecte seu provedor de IA para conversar sobre suas finanças. O restante do Fluxo e os avisos essenciais continuam disponíveis.</p><LinkButton className="mt-3" href="/configuracoes?aba=integracoes">Configurar integração</LinkButton></Panel> : null}
      <Insights insights={state.insights ?? []} disabled={interactionDisabled} onPick={(text) => { setQuestion(text); input.current?.focus(); }} />
      <Panel padding="none">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4 sm:px-5">
          <div><h2 className="flex items-center gap-2 text-heading font-semibold text-ink"><Sparkles size={18} className="text-accent" aria-hidden />Sua conversa</h2><p className="mt-1 text-caption text-ink-subtle">Contexto dos seus dados • sem alterar lançamentos</p></div>
          <div className="flex flex-wrap items-center gap-2"><span className="text-caption text-ink-subtle">{state.advice.remaining} consultas hoje</span>{currentId ? <Button icon={Trash2} variant="ghost" disabled={navDisabled} onClick={openDelete} aria-label="Excluir conversa atual" title="Excluir conversa atual" className="min-h-11">Excluir</Button> : null}<Button icon={Plus} disabled={navDisabled} onClick={() => void selectConversation()}>Nova conversa</Button></div>
        </header>
        <ConversationHistory conversations={state.conversations ?? []} currentId={currentId} disabled={navDisabled} onSelect={(id) => void selectConversation(id)} />
        <div role="log" aria-label="Mensagens da conversa" aria-live="polite" aria-busy={navDisabled} className="max-h-[65dvh] min-h-64 space-y-5 overflow-y-auto overscroll-contain p-4 sm:p-5">
          <ConversationBody loading={loading} messages={messages} suggestions={state.suggestions ?? []} disabled={interactionDisabled} onPick={(text) => { setQuestion(text); input.current?.focus(); }} />
          {busy ? <p role="status" className="text-body-sm text-accent">Analisando seu contexto financeiro…</p> : null}<div ref={end} />
        </div>
        <form onSubmit={(event) => { event.preventDefault(); void ask(); }} className="border-t border-line p-4 sm:p-5">
          {hasNotificationContext ? <p className="mb-2 text-caption text-accent">Pergunta preparada a partir da notificação. Revise antes de enviar.</p> : null}
          {error ? <p role="alert" className="mb-3 rounded-md bg-negative-wash p-3 text-body-sm text-negative">{error}</p> : null}
          <label htmlFor="fluxo-ai-question" className="mb-2 block text-body-sm font-medium text-ink">Sua mensagem</label>
          <div className="flex flex-col items-end gap-2 sm:flex-row"><textarea ref={input} id="fluxo-ai-question" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={500} rows={2} disabled={interactionDisabled} placeholder="Pergunte sobre suas finanças…" className="min-h-20 w-full resize-y rounded-xl border border-line-strong bg-surface-sunken px-3 py-3 text-body text-ink placeholder:text-ink-subtle focus:border-accent focus:outline-none disabled:opacity-50" /><Button type="submit" variant="primary" icon={Send} busy={busy} disabled={submitDisabled} className="min-h-11">Enviar</Button></div>
          <p className="mt-2 text-caption text-ink-subtle">{quotaCopy}</p>
        </form>
      </Panel>
      <ConfirmDialog open={confirmDelete} onClose={() => { if (!deleting) setConfirmDelete(false); }} onConfirm={() => void removeConversation()} title="Excluir esta conversa?" consequence="Todas as mensagens desta conversa serão apagadas do histórico da sua conta. Seus dados financeiros permanecem intactos. Esta ação não pode ser desfeita." confirmLabel="Excluir conversa" busy={deleting} error={deleteError} />
    </div>
  );
}

function ChatMessage({ message }: { message: AiMessage }) {
  const user = message.role === "user";
  return <article className={`max-w-measure-lg rounded-xl border p-4 ${user ? "ml-auto border-accent-edge bg-accent-wash" : "mr-auto border-line bg-surface-sunken"}`}><p className="mb-2 text-caption font-semibold text-ink-subtle">{user ? "Você" : "Fluxo IA"}</p><p className="whitespace-pre-wrap break-words text-body leading-relaxed text-ink">{message.content}</p>{message.advice?.actions.length ? <ul className="mt-4 space-y-2 border-t border-line pt-3">{message.advice.actions.map((action) => <li key={action.label} className="text-body-sm text-ink"><Badge tone={PRIORITY[action.priority]}>{action.priority}</Badge><span className="ml-2 font-medium">{action.label}</span><span className="mt-1 block text-ink-muted">{action.reason}</span></li>)}</ul> : null}{message.advice?.warnings.length ? <ul className="mt-3 space-y-1">{message.advice.warnings.map((warning) => <li key={warning} className="text-caption text-caution">{warning}</li>)}</ul> : null}</article>;
}

function Insights({ insights, disabled, onPick }: { insights: readonly FinancialInsight[]; disabled: boolean; onPick: (text: string) => void }) {
  if (!insights.length) return null;
  return <div className="grid items-start gap-3 md:grid-cols-3" aria-label="O que merece atenção">
    {insights.slice(0, 3).map((insight) => <Panel key={insight.key} variant="inset" padding="sm">
      <p className="flex items-start gap-2 text-body-sm font-semibold text-ink"><Sparkles size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden />{insight.title}</p>
      <p className="mt-2 text-caption text-ink-muted">{insight.body}</p>
      <button type="button" disabled={disabled} onClick={() => onPick(insight.question)} className="mt-2 min-h-11 text-body-sm font-medium text-accent disabled:opacity-50">Conversar sobre isso →</button>
    </Panel>)}
  </div>;
}

function ConversationHistory({ conversations, currentId, disabled, onSelect }: {
  conversations: NonNullable<AssistantState["conversations"]>; currentId?: string; disabled: boolean; onSelect: (id: string) => void;
}) {
  if (!conversations.length) return null;
  return <details className="border-b border-line px-4 py-2 sm:px-5">
    <summary className="min-h-11 cursor-pointer py-3 text-body-sm text-ink-muted"><Clock size={15} className="mr-2 inline text-ink-subtle" aria-hidden />Conversas anteriores</summary>
    <ul className="mb-2 grid max-h-48 gap-1 overflow-y-auto sm:grid-cols-2">{conversations.map((conversation) => <li key={conversation.id}>
      <button type="button" aria-current={currentId === conversation.id ? "true" : undefined} disabled={disabled} onClick={() => onSelect(conversation.id)} className={`w-full truncate rounded-md px-3 py-3 text-left text-body-sm ${currentId === conversation.id ? "bg-accent-wash text-accent" : "text-ink-muted hover:bg-surface-inset"}`}>{conversation.title}</button>
    </li>)}</ul>
  </details>;
}

function ConversationBody({ loading, messages, suggestions, disabled, onPick }: {
  loading: boolean; messages: readonly AiMessage[]; suggestions: readonly string[]; disabled: boolean; onPick: (text: string) => void;
}) {
  if (loading) return <p className="py-6 text-body-sm text-ink-subtle" role="status">Carregando sua conversa…</p>;
  if (messages.length) return messages.map((message) => <ChatMessage key={message.id} message={message} />);
  return <div className="mx-auto max-w-measure py-5">
    <span className="mb-3 inline-flex size-11 items-center justify-center rounded-xl bg-accent-wash text-accent"><Sparkles size={23} aria-hidden /></span>
    <h3 className="text-heading font-semibold text-ink">O que você gostaria de entender?</h3>
    <p className="mt-2 text-body-sm text-ink-muted">Posso explicar seus gastos, dívidas e compromissos e ajudar a planejar uma reserva usando os números registrados no Fluxo.</p>
    {suggestions.length ? <ul className="mt-5 flex flex-wrap gap-2">{suggestions.map((suggestion) => <li key={suggestion}>
      <button type="button" disabled={disabled} onClick={() => onPick(suggestion)} className="min-h-11 rounded-xl border border-line px-3 py-2 text-left text-body-sm text-ink-muted hover:border-accent-edge hover:text-accent disabled:opacity-50">{suggestion}</button>
    </li>)}</ul> : null}
  </div>;
}
