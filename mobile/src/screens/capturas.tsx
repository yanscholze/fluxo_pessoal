/**
 * Capturas de notificação.
 *
 * O que chega aqui é **sugestão**, nunca lançamento. Nada entra no razão sem
 * alguém confirmar: uma automação que grava sozinha transforma o primeiro
 * falso positivo — um aviso de "compra aprovada" seguido de estorno — num
 * saldo errado que ninguém sabe de onde veio.
 *
 * Diferente do resto do aplicativo, esta tela lê do servidor e não do banco
 * local: a fila de revisão é compartilhada com o site, e é lá que ela vive.
 * Sem rede, a tela diz isso em vez de fingir estar vazia.
 */

import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ApiError, OfflineError } from "../net/client.ts";
import { fetchCaptures, resolveCapture } from "../net/captures.ts";
import type { CapturesView } from "../net/types.ts";
import { isBridgeAvailable, isListenerEnabled, openListenerSettings } from "../notifications/bridge.ts";
import { useLedger } from "../state/ledger.tsx";
import { useConnectedSession } from "../state/session.tsx";
import { cents } from "@fluxo/core/kernel/money.ts";
import { money } from "../ui/format.ts";
import { Body, Button, Card, Empty, Label, Notice, Small } from "../ui/primitives.tsx";
import { space, usePalette } from "../ui/theme.ts";

export function CapturasScreen({ onVoltar }: { onVoltar: () => void }) {
  const palette = usePalette();
  const { credentials } = useConnectedSession();
  const { synchronize } = useLedger();

  const [dados, setDados] = useState<CapturesView | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [offline, setOffline] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [permissao, setPermissao] = useState<boolean | null>(null);
  const [resolvendo, setResolvendo] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      setDados(
        await fetchCaptures({ baseUrl: credentials.baseUrl, token: credentials.token }),
      );
      setOffline(false);
    } catch (problema) {
      if (problema instanceof OfflineError) setOffline(true);
      else setErro(problema instanceof ApiError ? problema.message : "Não foi possível carregar a fila.");
    } finally {
      setCarregando(false);
    }
  }, [credentials]);

  useEffect(() => {
    void carregar();
    void isListenerEnabled().then(setPermissao);
  }, [carregar]);

  const decidir = useCallback(
    async (captureId: string, decision: "confirmar" | "ignorar" | "duplicado") => {
      setResolvendo(captureId);
      try {
        await resolveCapture({
          baseUrl: credentials.baseUrl,
          token: credentials.token,
          captureId,
          decision,
        });
        await carregar();
        // Confirmar cria um lançamento no servidor; sincronizar traz o
        // registro para o aparelho em vez de deixar o extrato desatualizado.
        if (decision === "confirmar") void synchronize();
      } catch (problema) {
        setErro(problema instanceof ApiError ? problema.message : "Não foi possível registrar a decisão.");
      } finally {
        setResolvendo(null);
      }
    },
    [credentials, carregar, synchronize],
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.canvas }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xxl }}
        refreshControl={
          <RefreshControl refreshing={carregando} onRefresh={() => void carregar()} tintColor={palette.accent} />
        }
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md }}>
          <Body strong style={{ fontSize: 20 }}>
            Capturas
          </Body>
          <Button label="Voltar" variant="ghost" onPress={onVoltar} />
        </View>

        {!isBridgeAvailable() ? (
          <Notice tone="caution">
            A leitura de notificações não está disponível nesta versão do aplicativo. Ela exige um build de
            desenvolvimento ou de produção — no Expo Go o módulo nativo não existe.
          </Notice>
        ) : permissao === false ? (
          <Card>
            <Label>Acesso a notificações</Label>
            <Body muted style={{ marginTop: space.sm }}>
              O Fluxo precisa da sua autorização para ler avisos de compra dos aplicativos do banco. O
              Android não pede isso numa janela — a liberação é manual, nos Ajustes.
            </Body>
            <Button
              label="Abrir ajustes do Android"
              variant="secondary"
              onPress={openListenerSettings}
              style={{ marginTop: space.md }}
            />
            <Small style={{ marginTop: space.sm }}>
              Depois de liberar, volte aqui e puxe a tela para baixo.
            </Small>
          </Card>
        ) : null}

        {offline ? <Notice tone="caution">Sem conexão. A fila de revisão fica no servidor.</Notice> : null}
        {erro ? <Notice tone="negative">{erro}</Notice> : null}

        <Card>
          <Label>Aguardando sua decisão</Label>
          <View style={{ marginTop: space.sm, gap: space.md }}>
            {dados?.pending.length ? (
              dados.pending.map((captura) => (
                <View
                  key={captura.id}
                  style={{
                    borderTopWidth: 1,
                    borderTopColor: palette.line,
                    paddingTop: space.md,
                    gap: space.sm,
                  }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md }}>
                    <View style={{ flex: 1 }}>
                      <Body strong numberOfLines={1}>
                        {captura.description}
                      </Body>
                      <Small>
                        {captura.sourceLabel ?? captura.sourceApp}
                        {captura.installment
                          ? ` · parcela ${captura.installment.current}/${captura.installment.total}`
                          : ""}
                        {` · ${Math.round(captura.confidencePercent)}% de confiança`}
                      </Small>
                    </View>
                    <Body strong>{money(cents(captura.amountCents))}</Body>
                  </View>

                  <Small tone="subtle" numberOfLines={2}>
                    {captura.rawText}
                  </Small>

                  <View style={{ flexDirection: "row", gap: space.sm }}>
                    <Button
                      label="Confirmar"
                      onPress={() => void decidir(captura.id, "confirmar")}
                      busy={resolvendo === captura.id}
                      style={{ flex: 1 }}
                    />
                    <Button
                      label="Ignorar"
                      variant="secondary"
                      onPress={() => void decidir(captura.id, "ignorar")}
                      disabled={resolvendo === captura.id}
                      style={{ flex: 1 }}
                    />
                  </View>
                </View>
              ))
            ) : (
              <Empty
                title={carregando ? "Carregando…" : "Nada aguardando revisão"}
                hint="Avisos de compra dos aplicativos do banco aparecem aqui como sugestão."
              />
            )}
          </View>
        </Card>

        {dados?.recent.length ? (
          <Card>
            <Label>Recentes</Label>
            <View style={{ marginTop: space.sm, gap: space.sm }}>
              {dados.recent.slice(0, 10).map((captura) => (
                <View key={captura.id} style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md }}>
                  <View style={{ flex: 1 }}>
                    <Small tone="muted" numberOfLines={1}>
                      {captura.description}
                    </Small>
                    <Small>{captura.status}</Small>
                  </View>
                  <Small tone="muted">{money(cents(captura.amountCents))}</Small>
                </View>
              ))}
            </View>
          </Card>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
