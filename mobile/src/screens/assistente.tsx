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
import { SafeAreaView } from "react-native-safe-area-context";

import { call } from "../net/client.ts";
import { useConnectedSession } from "../state/session.tsx";
import { useRemoto } from "../state/remote.tsx";
import { fetchAssistente, type RespostaDoAssistente } from "../net/views.ts";
import { familiaDoPeso } from "../ui/fonts.ts";
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
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.canvas }} edges={[]}>
      <ScrollView
        contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xxl }}
        keyboardShouldPersistTaps="handled"
      >
        <View>
          <Texto style={[type.title, { fontFamily: familiaDoPeso(type.title.fontWeight), color: palette.ink }]}>
            Assistente
          </Texto>
          <Small style={{ marginTop: 2 }}>
            Pergunte sobre o seu dinheiro. A resposta usa os seus números, não exemplos.
          </Small>
        </View>

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
