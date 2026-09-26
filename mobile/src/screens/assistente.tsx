/**
 * O assistente.
 *
 * Uma pergunta em português sobre o próprio dinheiro, respondida com os números
 * reais do razão. A tela é uma caixa de texto e uma resposta — sem histórico de
 * conversa, e isso é decisão, não falta: conversa convida a perguntar de novo
 * em vez de agir, e o que esta tela precisa entregar é **o que fazer**.
 *
 * Por isso a resposta vem em três partes, na ordem em que servem: o resumo de
 * uma linha, as ações concretas, e os avisos. Quem lê só a primeira linha já
 * sai com algo; quem lê tudo sai com um plano.
 *
 * A cota aparece antes de perguntar, não depois. Descobrir que acabou **depois**
 * de escrever a pergunta é a pior ordem possível.
 */

import { useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { CaretLeft } from "phosphor-react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { cents } from "@fluxo/core/kernel/money.ts";
import { call } from "../net/client.ts";
import { useConnectedSession } from "../state/session.tsx";
import { useRemoto } from "../state/remote.tsx";
import { fetchAssistente, fetchDashboard, type DashboardView, type RespostaDoAssistente } from "../net/views.ts";
import { familiaDoPeso } from "../ui/fonts.ts";
import { money } from "../ui/format.ts";
import { ScreenGlow } from "../ui/mockup.tsx";
import { Body, Button, Card, Empty, Label, Notice, Small, Texto } from "../ui/primitives.tsx";
import { radius, space, type, usePalette } from "../ui/theme.ts";

const PRIORIDADE: Record<string, { rotulo: string; tom: "negative" | "caution" | "muted" }> = {
  alta: { rotulo: "Agora", tom: "negative" },
  media: { rotulo: "Em breve", tom: "caution" },
  baixa: { rotulo: "Quando der", tom: "muted" },
};

/** Perguntas que valem a primeira cota de quem nunca usou. */
const SUGESTOES = [
  "Posso gastar R$ 300 este mês sem apertar?",
  "Onde estou gastando mais do que percebo?",
  "Como faço para quitar a fatura mais rápido?",
];

export function AssistenteScreen({ onVoltar }: { onVoltar?: () => void }) {
  const palette = usePalette();
  const { credentials } = useConnectedSession();
  const estado = useRemoto(fetchAssistente);
  const painel = useRemoto(fetchDashboard);

  const [pergunta, setPergunta] = useState("");
  const [resposta, setResposta] = useState<RespostaDoAssistente | null>(null);
  const [perguntando, setPerguntando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function perguntar() {
    if (pergunta.trim().length < 3) {
      setErro("Escreva a pergunta inteira — três letras não dão contexto.");
      return;
    }

    setPerguntando(true);
    setErro(null);
    try {
      const dados = await call<RespostaDoAssistente>("/api/v1/assistant", {
        baseUrl: credentials.baseUrl,
        token: credentials.token,
        method: "POST",
        body: { question: pergunta.trim() },
      });
      setResposta(dados);
      // A cota consumida precisa aparecer: o contador some do estado se não
      // for recarregado, e o próximo "restam N" seria o de antes da pergunta.
      estado.recarregar();
    } catch (problema) {
      setErro(problema instanceof Error ? problema.message : "Não foi possível perguntar agora.");
    } finally {
      setPerguntando(false);
    }
  }

  const configurado = estado.dados?.configured ?? true;
  const restantes = estado.dados?.advice.remaining ?? null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.canvas }} edges={["top"]}>
      <ScreenGlow height={420} />
      <ScrollView
        contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xxl }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          {onVoltar ? <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={onVoltar} style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: palette.line, backgroundColor: pressed ? palette.surfaceRaised : palette.surface })}><CaretLeft size={20} color={palette.ink} /></Pressable> : null}
          <View style={{ flex: 1 }}><Texto style={[type.label, { color: palette.accent, letterSpacing: 1.8 }]}>TARS // SISTEMA FINANCEIRO</Texto><Texto style={[type.title, { fontFamily: familiaDoPeso(type.title.fontWeight), color: palette.ink, marginTop: 6 }]}>Status do Fluxo</Texto><Small style={{ marginTop: 3 }}>Visão imediata do ciclo e comando do assistente.</Small></View>
        </View>

        <NucleoTars dados={painel.dados} />

        {!configurado ? (
          <Notice tone="caution">
            O assistente não está ligado nesta instalação: falta a chave da OpenAI nos segredos do
            servidor. O resto do aplicativo funciona normalmente.
          </Notice>
        ) : null}

        <Card>
          <Label style={{ marginBottom: space.xs }}>Sua pergunta</Label>
          <TextInput
            value={pergunta}
            onChangeText={setPergunta}
            multiline
            editable={configurado}
            placeholder="Posso gastar R$ 300 este mês sem apertar?"
            placeholderTextColor={palette.inkSubtle}
            style={[
              type.body,
              {
                fontFamily: familiaDoPeso(type.body.fontWeight),
                color: palette.ink,
                backgroundColor: palette.surfaceInset,
                borderRadius: radius.md,
                paddingHorizontal: space.sm,
                paddingVertical: 10,
                minHeight: 84,
                textAlignVertical: "top",
              },
            ]}
          />

          {restantes !== null ? (
            <Small style={{ marginTop: space.xs }}>
              {restantes > 0
                ? `${restantes} pergunta${restantes === 1 ? "" : "s"} hoje`
                : "Cota de hoje esgotada — volta amanhã."}
            </Small>
          ) : null}

          <View style={{ marginTop: space.md }}>
            <Button
              label={perguntando ? "Pensando…" : "Perguntar"}
              onPress={() => void perguntar()}
              disabled={perguntando || !configurado || restantes === 0}
              busy={perguntando}
            />
          </View>
        </Card>

        {!resposta && configurado ? (
          <Card>
            <Label style={{ marginBottom: space.xs }}>Para começar</Label>
            {/*
              A sugestão preenche o campo em vez de perguntar direto: a cota é
              curta, e mandar uma pergunta que o usuário não escreveu gastaria
              uma delas numa dúvida que talvez não fosse a dele.
            */}
            {SUGESTOES.map((item) => (
              <Pressable
                key={item}
                accessibilityRole="button"
                onPress={() => setPergunta(item)}
                style={{ paddingVertical: space.xs }}
              >
                <Body muted>{item}</Body>
              </Pressable>
            ))}
          </Card>
        ) : null}

        {erro ? <Notice tone="negative">{erro}</Notice> : null}

        {resposta ? (
          <>
            <Card>
              <Label style={{ marginBottom: space.xs }}>Resposta</Label>
              <Body strong>{resposta.summary}</Body>
              <Body muted style={{ marginTop: space.sm }}>
                {resposta.answer}
              </Body>
            </Card>

            {resposta.actions.length > 0 ? (
              <Card>
                <Label style={{ marginBottom: space.xs }}>O que fazer</Label>
                {resposta.actions.map((acao, indice) => {
                  const nivel = PRIORIDADE[acao.priority] ?? PRIORIDADE.baixa;
                  return (
                    <View
                      key={`${acao.label}-${indice}`}
                      style={{
                        paddingVertical: space.sm,
                        borderBottomWidth: indice === resposta.actions.length - 1 ? 0 : 1,
                        borderBottomColor: palette.line,
                      }}
                    >
                      <Body>{acao.label}</Body>
                      <Small tone={nivel.tom} style={{ marginTop: 2 }}>
                        {nivel.rotulo} · {acao.reason}
                      </Small>
                    </View>
                  );
                })}
              </Card>
            ) : null}

            {resposta.warnings.length > 0 ? (
              <Card>
                <Label style={{ marginBottom: space.xs }}>Atenção</Label>
                {resposta.warnings.map((aviso, indice) => (
                  <Small key={indice} tone="caution" style={{ paddingVertical: 3 }}>
                    {aviso}
                  </Small>
                ))}
              </Card>
            ) : null}
          </>
        ) : null}

        {estado.erro && !resposta ? (
          <Card>
            <Empty title="Não deu para saber a cota" hint={estado.erro} />
          </Card>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function NucleoTars({ dados }: { dados: DashboardView | null }) {
  const palette = usePalette();
  const alertas = dados
    ? [
        ...(dados.cards ?? []).filter((item) => (item.currentInvoice?.outstandingCents ?? 0) > 0).slice(0, 2).map((item) => `${item.name}: ${money(cents(item.currentInvoice?.outstandingCents ?? 0))}`),
        ...(dados.openTasks ?? []).slice(0, 2).map((item) => item.title),
      ]
    : [];

  return (
    <View style={{ borderWidth: 1, borderColor: palette.line, backgroundColor: palette.surfaceSunken, padding: 12, overflow: "hidden" }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Texto style={[type.label, { color: palette.inkSubtle }]}>NÚCLEO // ONLINE</Texto>
        <Texto style={[type.label, { color: palette.accent }]}>CICLO ATIVO</Texto>
      </View>

      <View style={{ height: 276, alignItems: "center", justifyContent: "center" }}>
        <View style={{ position: "absolute", width: 250, height: 250, borderRadius: 125, borderWidth: 1, borderColor: palette.accentEdge }} />
        <View style={{ position: "absolute", width: 204, height: 204, borderRadius: 102, borderWidth: 1, borderColor: palette.lineStrong }} />
        <View style={{ position: "absolute", width: 142, height: 142, borderRadius: 71, borderWidth: 1, borderColor: palette.accentEdge }} />
        <View style={{ position: "absolute", width: 86, height: 86, borderRadius: 43, borderWidth: 2, borderColor: palette.accent }} />
        <View style={{ position: "absolute", left: 30, right: 30, height: 1, backgroundColor: palette.accentEdge, opacity: 0.45 }} />
        <View style={{ position: "absolute", top: 18, bottom: 18, width: 1, backgroundColor: palette.accentEdge, opacity: 0.45 }} />
        <View style={{ zIndex: 2, width: 190, alignItems: "center" }}>
          <Texto style={[type.label, { color: palette.inkSubtle }]}>LIVRE PARA GASTAR</Texto>
          <Texto style={{ color: dados && dados.freeToSpend.amountCents < 0 ? palette.negative : palette.accent, fontSize: 27, lineHeight: 32, fontWeight: "500", letterSpacing: -0.8, marginTop: 6 }}>
            {dados ? money(cents(dados.freeToSpend.amountCents)) : "—"}
          </Texto>
          <Small style={{ textAlign: "center", marginTop: 4 }}>projeção do ciclo</Small>
        </View>
      </View>

      <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: palette.line, borderBottomWidth: 1, borderBottomColor: palette.line }}>
        <PainelTars label="Em conta" value={dados ? money(cents(dados.freeToSpend.liquidBalanceCents)) : "—"} />
        <View style={{ width: 1, backgroundColor: palette.line }} />
        <PainelTars label="Faturas" value={dados ? money(cents(dados.freeToSpend.openInvoicesCents)) : "—"} />
      </View>

      <View style={{ marginTop: 12 }}>
        <Texto style={[type.label, { color: palette.inkSubtle }]}>SINAIS PRIORITÁRIOS</Texto>
        {alertas.length ? alertas.map((alerta, indice) => (
          <View key={`${alerta}-${indice}`} style={{ flexDirection: "row", gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: palette.line }}>
            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: palette.accent, marginTop: 7 }} />
            <Small tone="muted" style={{ flex: 1 }}>{alerta}</Small>
          </View>
        )) : <Small style={{ marginTop: 8 }}>Nenhuma pendência crítica detectada.</Small>}
      </View>
    </View>
  );
}

function PainelTars({ label, value }: { label: string; value: string }) {
  const palette = usePalette();
  return <View style={{ flex: 1, paddingVertical: 11, paddingHorizontal: 8 }}><Texto style={[type.label, { color: palette.inkSubtle }]}>{label.toUpperCase()}</Texto><Texto style={[type.bodyStrong, { color: palette.ink, marginTop: 4 }]}>{value}</Texto></View>;
}
