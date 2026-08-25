/**
 * Conectar o aparelho a uma conta.
 *
 * Duas etapas: informar o endereço do servidor e trocar um código pelo token.
 * O usuário nunca digita senha aqui — quem prova identidade é a sessão web em
 * que ele aprova o código. Um aplicativo que pede a senha para depois guardá-la
 * transforma cada aparelho perdido num vazamento.
 *
 * A consulta é por sondagem, não por notificação em tempo real: são poucos
 * segundos de espera, e uma conexão persistente para isso custaria bateria
 * para o resto da vida do aplicativo.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { normalizeBaseUrl, suggestedBaseUrl } from "../config.ts";
import { appVersion, deviceName } from "../device.ts";
import { ApiError, OfflineError } from "../net/client.ts";
import { claimPairing, startPairing } from "../net/pairing.ts";
import type { PairingStart } from "../net/types.ts";
import { useSession } from "../state/session.tsx";
import { Body, Button, Card, Figure, Label, Notice, Small } from "../ui/primitives.tsx";
import { radius, space, type, usePalette } from "../ui/theme.ts";

/** Intervalo entre consultas. Rápido o bastante para parecer instantâneo. */
const POLL_MS = 2500;

export function ConectarScreen() {
  const palette = usePalette();
  const { state, connect } = useSession();
  const identificador = state.status === "carregando" ? "" : state.deviceId;

  const [endereco, setEndereco] = useState(suggestedBaseUrl());
  const [pedido, setPedido] = useState<PairingStart | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const baseUrl = useRef<string>("");

  const pedirCodigo = useCallback(async () => {
    const normalizado = normalizeBaseUrl(endereco);
    if (!normalizado) {
      setErro("Informe o endereço do Fluxo, por exemplo fluxo.seudominio.com.br");
      return;
    }

    setOcupado(true);
    setErro(null);
    baseUrl.current = normalizado;

    try {
      setPedido(
        await startPairing({
          baseUrl: normalizado,
          deviceId: identificador,
          deviceName,
          appVersion,
        }),
      );
    } catch (problema) {
      setErro(
        problema instanceof OfflineError
          ? "Não foi possível falar com esse endereço. Confira o endereço e a conexão."
          : problema instanceof ApiError
            ? problema.message
            : "Não foi possível iniciar a conexão.",
      );
    } finally {
      setOcupado(false);
    }
  }, [endereco, identificador]);

  // Sondagem enquanto houver um código na tela.
  useEffect(() => {
    if (!pedido) return;
    let vivo = true;

    const consultar = async () => {
      try {
        const resultado = await claimPairing({
          baseUrl: baseUrl.current,
          code: pedido.code,
          pollToken: pedido.pollToken,
        });

        if (!vivo) return;

        if (resultado.status === "expirado") {
          setPedido(null);
          setErro("O código expirou. Peça um novo.");
          return;
        }

        if (resultado.status === "aprovado" && resultado.token && resultado.user) {
          await connect({ baseUrl: baseUrl.current, token: resultado.token, user: resultado.user });
        }
      } catch (problema) {
        // Falha de rede durante a espera não invalida o código: a próxima
        // consulta tenta de novo. Só erro do servidor interrompe.
        if (!vivo || problema instanceof OfflineError) return;
        setPedido(null);
        setErro(problema instanceof ApiError ? problema.message : "A conexão falhou.");
      }
    };

    const intervalo = setInterval(() => void consultar(), POLL_MS);
    void consultar();

    return () => {
      vivo = false;
      clearInterval(intervalo);
    };
  }, [pedido, connect]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.canvas }}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }}>
        <View style={{ gap: space.xs, paddingTop: space.lg }}>
          <Figure small>Fluxo</Figure>
          <Body muted>Conecte este aparelho à sua conta.</Body>
        </View>

        {pedido ? (
          <Card>
            <Label>Digite este código no site</Label>
            <View
              style={{
                marginTop: space.md,
                marginBottom: space.md,
                backgroundColor: palette.surfaceSunken,
                borderRadius: radius.control,
                paddingVertical: space.lg,
                alignItems: "center",
              }}
            >
              <Body strong style={{ fontSize: 34, lineHeight: 40, letterSpacing: 8 }}>
                {pedido.code}
              </Body>
            </View>

            <Body muted>
              Abra o Fluxo no navegador, já conectado, e vá em Conectar aparelho. O código vale por dez
              minutos.
            </Body>

            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.md }}>
              <ActivityIndicator color={palette.accent} />
              <Small>Aguardando aprovação…</Small>
            </View>

            <Button
              label="Cancelar"
              variant="ghost"
              onPress={() => setPedido(null)}
              style={{ marginTop: space.md }}
            />
          </Card>
        ) : (
          <Card>
            <Label>Endereço do servidor</Label>
            <TextInput
              value={endereco}
              onChangeText={setEndereco}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="fluxo.seudominio.com.br"
              placeholderTextColor={palette.inkSubtle}
              style={[
                type.body,
                {
                  marginTop: space.sm,
                  color: palette.ink,
                  backgroundColor: palette.surfaceSunken,
                  borderRadius: radius.control,
                  paddingHorizontal: space.md,
                  paddingVertical: 14,
                },
              ]}
            />
            <Small style={{ marginTop: space.sm }}>
              O mesmo endereço que você usa no navegador.
            </Small>

            <Button
              label="Pedir código"
              onPress={() => void pedirCodigo()}
              busy={ocupado}
              disabled={!identificador}
              style={{ marginTop: space.lg }}
            />
          </Card>
        )}

        {erro ? <Notice tone="negative">{erro}</Notice> : null}

        <Card>
          <Label>Como funciona</Label>
          <View style={{ marginTop: space.md, gap: space.sm }}>
            <Small tone="muted">1. O aplicativo gera um código de seis caracteres.</Small>
            <Small tone="muted">2. Você digita o código no site, já autenticado.</Small>
            <Small tone="muted">3. O aplicativo recebe um token próprio, revogável a qualquer momento.</Small>
            <Small>Sua senha não passa por este aparelho.</Small>
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
