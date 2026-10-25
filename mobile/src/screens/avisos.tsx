/** Central compartilhada com o web. Abrir e atualizar preservam o estado de leitura. */
import { useState } from "react";
import { Pressable, View } from "react-native";

import type { Aviso } from "../notifications/avisos.ts";
import { useAvisos } from "../state/avisos.tsx";
import { Body, Button, Card, Empty, Label, Notice, Small } from "../ui/primitives.tsx";
import { TelaRemota } from "../ui/tela-remota.tsx";
import { radius, space, usePalette } from "../ui/theme.ts";

const LABEL: Record<Aviso["category"], string> = {
  critical: "Crítica", attention: "Atenção", insight: "Insight", opportunity: "Oportunidade", reminder: "Lembrete",
};

export function AvisosScreen({ onVoltar, onIrPara }: {
  onVoltar?: () => void;
  onIrPara?: (screen: string, notificationId?: string) => void;
}) {
  const central = useAvisos();
  const palette = usePalette();
  const [filter, setFilter] = useState<"unread" | "all" | "resolved">("unread");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = filter === "resolved" ? central.data?.history ?? [] : (central.data?.alerts ?? []).filter((item) => filter === "all" || !item.readAt);

  async function read(ids: readonly string[] | "all") {
    setBusy(ids === "all" ? "all" : ids[0]);
    setError(null);
    try { await central.markRead(ids); }
    catch { setError("Não foi possível salvar a leitura. Tente novamente."); }
    finally { setBusy(null); }
  }

  function open(aviso: Aviso, ai: boolean) {
    if (!aviso.readAt) void read([aviso.id]);
    onIrPara?.(ai ? "assistente" : aviso.screen === "faturas" ? "cartoes" : aviso.screen, ai ? aviso.id : undefined);
  }

  return <TelaRemota titulo="Notificações" descricao={`${central.unreadCount} não lida(s). O que merece sua atenção.`} onVoltar={onVoltar}
    remoto={{ dados: central.data, carregando: central.loading, offline: false, erro: central.error, recarregar: () => void central.refresh() }}>
    {() => <>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        {([["unread", "Não lidas"], ["all", "Todas"], ["resolved", "Resolvidas"]] as const).map(([value, label]) =>
          <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: filter === value }} onPress={() => setFilter(value)}
            style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: filter === value ? palette.accentWash : palette.surface, borderWidth: 1, borderColor: filter === value ? palette.accent : palette.line }}>
            <Small tone={filter === value ? "muted" : "subtle"}>{label}</Small>
          </Pressable>)}
      </View>
      {central.unreadCount > 0 ? <Button label="Marcar todas como lidas" variant="secondary" disabled={busy !== null} busy={busy === "all"} onPress={() => void read("all")} /> : null}
      {error ? <Notice tone="negative">{error}</Notice> : null}
      {list.length === 0 ? <Card><Empty title={filter === "unread" ? "Tudo conferido" : "Sem notificações aqui"} hint="Ler um aviso não remove o compromisso. Os resolvidos continuam disponíveis no histórico." /></Card> : list.map((aviso) =>
        <CartaoDeAviso key={aviso.id ?? aviso.key} aviso={aviso} busy={busy !== null} onRead={() => void read([aviso.id])} onOpen={onIrPara ? () => open(aviso, false) : undefined} onAsk={onIrPara ? () => open(aviso, true) : undefined} />)}
    </>}
  </TelaRemota>;
}

function CartaoDeAviso({ aviso, busy, onRead, onOpen, onAsk }: {
  aviso: Aviso; busy: boolean; onRead: () => void; onOpen?: () => void; onAsk?: () => void;
}) {
  const palette = usePalette();
  const color = notificationColor(aviso, palette);
  const unread = !aviso.readAt && !aviso.resolvedAt;
  return <Card>
    <View style={{ flexDirection: "row", gap: space.sm }}>
      <View style={{ width: unread ? 4 : 2, borderRadius: radius.pill, backgroundColor: unread ? color : palette.line }} />
      <View style={{ flex: 1, minWidth: 0, gap: space.sm }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap", gap: 4 }}>
          <Label style={{ color }}>{LABEL[aviso.category] ?? "Aviso"}</Label>
          <Small>{aviso.resolvedAt ? "Resolvida" : unread ? "Não lida" : "Lida"}</Small>
        </View>
        <Body strong={unread}>{aviso.title}</Body>
        <Small tone="muted">{aviso.body}</Small>
        {aviso.updatedAt ? <Small>{new Date(aviso.updatedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</Small> : null}
        <NotificationActions onOpen={onOpen} onAsk={onAsk} onRead={onRead} unread={unread} busy={busy} />
      </View>
    </View>
  </Card>;
}

function notificationColor(aviso: Aviso, palette: ReturnType<typeof usePalette>): string {
  if (aviso.priority >= 4) return palette.negative;
  if (aviso.category === "opportunity") return palette.positive;
  return aviso.priority >= 2 ? palette.caution : palette.accent;
}

function NotificationActions({ onOpen, onAsk, onRead, unread, busy }: {
  onOpen?: () => void; onAsk?: () => void; onRead: () => void; unread: boolean; busy: boolean;
}) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
    {onOpen ? <Button label="Ver detalhes" variant="secondary" onPress={onOpen} /> : null}
    {onAsk ? <Button label="Perguntar à IA" variant="secondary" onPress={onAsk} /> : null}
    {unread ? <Button label="Marcar como lida" variant="ghost" onPress={onRead} disabled={busy} /> : null}
  </View>;
}
