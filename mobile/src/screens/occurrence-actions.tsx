import { useState } from "react";
import { Modal, ScrollView, View } from "react-native";

import { cents } from "@fluxo/core/kernel/money.ts";
import { call } from "../net/client.ts";
import type { RecurrenceView } from "../net/views.ts";
import { useConnectedSession } from "../state/session.tsx";
import { money, relativeDate } from "../ui/format.ts";
import { Body, Button, Card, Notice, Small } from "../ui/primitives.tsx";
import { space } from "../ui/theme.ts";

type Movement = { id: string; description: string; occurredOn: string; amountCents: number };

/** Reconhece um movimento já registrado, sem criar uma segunda entrada/saída. */
export function OccurrenceActions({ rule, onDone }: { rule: RecurrenceView; onDone: () => void }) {
  const { credentials } = useConnectedSession();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"link" | "create">("link");
  const [movements, setMovements] = useState<Movement[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!rule.pending) return;
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ recurrenceId: rule.id, competence: rule.pending.competence });
      const result = await call<{ transactions: Movement[] }>(`/api/v1/recurrences/confirm?${query}`, credentials);
      setMovements(result.transactions);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar os lançamentos.");
    } finally { setLoading(false); }
  }

  function begin() {
    setMode("link");
    setSelected("");
    setMovements([]);
    setOpen(true);
    void load();
  }

  async function confirm() {
    if (!rule.pending) return;
    setBusy(true);
    setError(null);
    try {
      await call("/api/v1/recurrences/confirm", { ...credentials, method: "POST",
        body: { recurrenceId: rule.id, competence: rule.pending.competence,
          ...(mode === "link" ? { transactionId: selected } : {}) } });
      setOpen(false);
      onDone();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível dar baixa.");
    } finally { setBusy(false); }
  }

  return <>
    <Button label="Dar baixa" variant="secondary" onPress={begin} />
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => { if (!busy) setOpen(false); }}>
      <View style={{ flex: 1, backgroundColor: "rgba(9,16,30,0.65)", justifyContent: "center", padding: space.lg }}>
        <View accessibilityViewIsModal style={{ maxHeight: "85%" }}>
          <Card style={{ flexShrink: 1 }}>
            <Body strong>Dar baixa no compromisso</Body>
            <Small>{rule.description} · {money(cents(rule.pending?.amountCents ?? rule.amountCents))}</Small>
            <ScrollView style={{ marginVertical: space.md }} contentContainerStyle={{ gap: space.sm }}>
              <Button label="Já está no extrato" variant={mode === "link" ? "primary" : "secondary"} disabled={busy} onPress={() => { setMode("link"); setError(null); }} />
              <Button label="Ainda não foi lançado" variant={mode === "create" ? "primary" : "secondary"} disabled={busy} onPress={() => { setMode("create"); setError(null); }} />
              {mode === "link" ? <>
                <Small>Movimentos confirmados da mesma conta ou cartão, ainda sem vínculo.</Small>
                {loading ? <Small>Carregando…</Small> : movements.map((item) => <Button key={item.id}
                  label={`${item.description} · ${money(cents(item.amountCents))} · ${relativeDate(item.occurredOn as never)}`}
                  variant={selected === item.id ? "primary" : "secondary"} disabled={busy} onPress={() => setSelected(item.id)} />)}
                {!loading && !movements.length && !error ? <Small>Nenhum lançamento disponível. Escolha criar somente se ainda não estiver no extrato.</Small> : null}
                {selected ? <Small>Será usado o valor real do lançamento. Seu saldo será preservado.</Small> : null}
              </> : <Notice tone="caution">Esta opção cria um novo movimento na conta ou cartão da recorrência. Use somente se ainda não foi registrado.</Notice>}
              {error ? <><Notice tone="negative">{error}</Notice>{mode === "link" ? <Button label="Atualizar lista" variant="ghost" disabled={loading} onPress={() => void load()} /> : null}</> : null}
            </ScrollView>
            <View style={{ gap: space.sm }}>
              <Button label={mode === "link" ? "Vincular lançamento" : "Criar e dar baixa"} busy={busy}
                disabled={mode === "link" && (!selected || loading)} onPress={() => void confirm()} />
              <Button label="Cancelar" variant="ghost" disabled={busy} onPress={() => setOpen(false)} />
            </View>
          </Card>
        </View>
      </View>
    </Modal>
  </>;
}
