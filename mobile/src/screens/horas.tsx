/**
 * Registrar horas trabalhadas num projeto.
 *
 * A pergunta que esta tela responde é feita **longe do computador**: acabou a
 * sessão de trabalho, e o registro precisa acontecer agora, antes de a duração
 * virar estimativa de memória.
 *
 * A duração é digitada em minutos e vai em minutos para a API. A conversão
 * para milésimos de hora acontece uma única vez, no servidor: aceitar "1,5 h"
 * aqui obrigaria o aplicativo a arredondar por conta própria, e o site
 * arredondaria diferente — dois totais para o mesmo trabalho.
 *
 * Os atalhos de 30 min a 4 h existem porque quase toda sessão real cai neles,
 * e digitar em teclado numérico de celular é onde o registro é abandonado.
 */

import { useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { todayIn } from "@fluxo/core/time/local-date.ts";
import { call } from "../net/client.ts";
import type { ProjetoView } from "../net/views.ts";
import { useConnectedSession } from "../state/session.tsx";
import { familiaDoPeso } from "../ui/fonts.ts";
import {
  Body,
  Button,
  Card,
  Label,
  Notice,
  Small,
  Texto,
} from "../ui/primitives.tsx";
import { radius, space, type, usePalette } from "../ui/theme.ts";

/** As durações que cobrem quase toda sessão de trabalho, em minutos. */
const ATALHOS = [30, 60, 90, 120, 180, 240] as const;

/** O mesmo conjunto do domínio, na ordem em que um trabalho costuma andar. */
const ATIVIDADES = [
  { value: "development", label: "Desenvolvimento" },
  { value: "design", label: "Design" },
  { value: "meeting", label: "Reunião" },
  { value: "research", label: "Pesquisa" },
  { value: "support", label: "Suporte" },
] as const;

function rotuloDaDuracao(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `${horas} h` : `${horas} h ${resto}`;
}

export function HorasScreen({
  projeto,
  onClose,
}: {
  projeto: ProjetoView;
  onClose: () => void;
}) {
  const palette = usePalette();
  const { credentials } = useConnectedSession();

  const [minutos, setMinutos] = useState("60");
  const [descricao, setDescricao] = useState("");
  const [atividade, setAtividade] = useState<string>("development");
  const [faturavel, setFaturavel] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);

  const duracao = Number(minutos.replace(/\D/g, ""));
  const valida = Number.isFinite(duracao) && duracao >= 1 && duracao <= 24 * 60;

  async function salvar() {
    if (!valida) {
      setErro("Informe a duração em minutos, de 1 a 1440.");
      return;
    }
    if (descricao.trim().length === 0) {
      setErro("Descreva o que foi feito — é o que dá sentido às horas depois.");
      return;
    }

    setSalvando(true);
    setErro(null);
    try {
      await call(`/api/v1/projects/${projeto.id}/time`, {
        baseUrl: credentials.baseUrl,
        token: credentials.token,
        method: "POST",
        body: {
          workedOn: todayIn(),
          minutes: duracao,
          description: descricao.trim(),
          activity: atividade,
          billable: faturavel,
        },
      });
      setPronto(true);
      onClose();
    } catch (problema) {
      setErro(
        problema instanceof Error
          ? problema.message
          : "Não foi possível registrar.",
      );
    } finally {
      setSalvando(false);
    }
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: palette.canvas }}
      edges={["top", "bottom"]}
    >
      <ScrollView
        contentContainerStyle={{
          padding: space.lg,
          gap: space.md,
          paddingBottom: space.xl,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Texto
              style={[
                type.title,
                { fontFamily: familiaDoPeso(type.title.fontWeight) },
              ]}
            >
              Registrar horas
            </Texto>
            <Small numberOfLines={1}>{projeto.name}</Small>
          </View>
          <Pressable accessibilityRole="button" onPress={onClose} hitSlop={12}>
            <Body muted>Fechar</Body>
          </Pressable>
        </View>

        <Card>
          <Label style={{ marginBottom: space.xs }}>Duração</Label>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: space.xs,
              marginBottom: space.sm,
            }}
          >
            {ATALHOS.map((opcao) => {
              const ativo = duracao === opcao;
              return (
                <Pressable
                  key={opcao}
                  accessibilityRole="button"
                  accessibilityState={{ selected: ativo }}
                  onPress={() => setMinutos(String(opcao))}
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: space.sm,
                    borderRadius: radius.pill,
                    backgroundColor: ativo
                      ? palette.accent
                      : palette.surfaceInset,
                  }}
                >
                  <Small tone={ativo ? "inverse" : "muted"}>
                    {rotuloDaDuracao(opcao)}
                  </Small>
                </Pressable>
              );
            })}
          </View>

          <TextInput
            value={minutos}
            onChangeText={setMinutos}
            keyboardType="number-pad"
            placeholder="minutos"
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
              },
            ]}
          />
        </Card>

        <Card>
          <Label style={{ marginBottom: space.xs }}>O que foi feito</Label>
          <TextInput
            value={descricao}
            onChangeText={setDescricao}
            placeholder="Ajustes na tela de faturas"
            placeholderTextColor={palette.inkSubtle}
            multiline
            style={[
              type.body,
              {
                fontFamily: familiaDoPeso(type.body.fontWeight),
                color: palette.ink,
                backgroundColor: palette.surfaceInset,
                borderRadius: radius.md,
                paddingHorizontal: space.sm,
                paddingVertical: 10,
                minHeight: 76,
                textAlignVertical: "top",
              },
            ]}
          />
        </Card>

        <Card>
          <Label style={{ marginBottom: space.xs }}>Atividade</Label>
          <View
            style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}
          >
            {ATIVIDADES.map((opcao) => {
              const ativo = atividade === opcao.value;
              return (
                <Pressable
                  key={opcao.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: ativo }}
                  onPress={() => setAtividade(opcao.value)}
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: space.sm,
                    borderRadius: radius.pill,
                    backgroundColor: ativo
                      ? palette.accent
                      : palette.surfaceInset,
                  }}
                >
                  <Small tone={ativo ? "inverse" : "muted"}>
                    {opcao.label}
                  </Small>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: faturavel }}
            onPress={() => setFaturavel((atual) => !atual)}
            style={{
              marginTop: space.md,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Body>Faturável</Body>
              <Small>Entra no cálculo do valor/hora do projeto</Small>
            </View>
            <View
              style={{
                width: 44,
                height: 26,
                borderRadius: radius.pill,
                padding: 3,
                backgroundColor: faturavel
                  ? palette.accent
                  : palette.surfaceInset,
                alignItems: faturavel ? "flex-end" : "flex-start",
              }}
            >
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: radius.pill,
                  backgroundColor: palette.canvas,
                }}
              />
            </View>
          </Pressable>
        </Card>

        {erro ? <Notice tone="negative">{erro}</Notice> : null}

        <Button
          label={
            salvando
              ? "Registrando…"
              : `Registrar ${rotuloDaDuracao(valida ? duracao : 0)}`
          }
          onPress={() => void salvar()}
          disabled={salvando || pronto || !valida}
          busy={salvando}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
