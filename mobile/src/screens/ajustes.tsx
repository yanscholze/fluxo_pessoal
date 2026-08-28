/**
 * Ajustes.
 *
 * Também é onde os conflitos de sincronização são resolvidos. Eles não têm
 * tela própria de propósito: são raros, e enterrá-los num aviso que some seria
 * o mesmo que descartar a edição do usuário sem avisar.
 */

import { useState } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { appVersion, deviceName } from "../device.ts";
import { isBridgeAvailable, openListenerSettings } from "../notifications/bridge.ts";
import { useLedger } from "../state/ledger.tsx";
import { useSession } from "../state/session.tsx";
import { Body, Button, Card, Divider, Label, Notice, Row, Small } from "../ui/primitives.tsx";
import { space, usePalette } from "../ui/theme.ts";

export function AjustesScreen({ onAbrirCapturas }: { onAbrirCapturas: () => void }) {
  const palette = usePalette();
  const { state, disconnect } = useSession();
  const { sync, conflicts, synchronize, resolveConflict } = useLedger();
  const [desconectando, setDesconectando] = useState(false);

  const conectado = state.status === "conectado" ? state : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.canvas }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xxl }}>
        <Body strong style={{ fontSize: 20 }}>
          Ajustes
        </Body>

        <Card>
          <Label>Conta</Label>
          <View style={{ marginTop: space.sm }}>
            <Body strong>{conectado?.credentials.user.displayName ?? "—"}</Body>
            <Small>{conectado?.credentials.user.email ?? ""}</Small>
            <Small style={{ marginTop: space.sm }}>{conectado?.credentials.baseUrl ?? ""}</Small>
          </View>
        </Card>

        <Card>
          <Label>Sincronização</Label>
          <View style={{ marginTop: space.sm }}>
            <Row>
              <Small tone="muted">Estado</Small>
              <Small tone={sync.offline ? "caution" : "positive"}>
                {sync.running ? "sincronizando…" : sync.offline ? "sem conexão" : "em dia"}
              </Small>
            </Row>
            <Row>
              <Small tone="muted">Aguardando envio</Small>
              <Small tone="muted">{sync.pending}</Small>
            </Row>
            <Row style={{ borderBottomWidth: 0 }}>
              <Small tone="muted">Última sincronização</Small>
              <Small tone="muted">
                {sync.lastRunAt ? new Date(sync.lastRunAt).toLocaleString("pt-BR") : "nunca"}
              </Small>
            </Row>
          </View>

          {sync.error ? (
            <View style={{ marginTop: space.md }}>
              <Notice tone="negative">{sync.error}</Notice>
            </View>
          ) : null}

          <Button
            label="Sincronizar agora"
            variant="secondary"
            onPress={() => void synchronize()}
            busy={sync.running}
            style={{ marginTop: space.md }}
          />
        </Card>

        {conflicts.length ? (
          <Card>
            <Label>Precisam da sua decisão</Label>
            <Body muted style={{ marginTop: space.sm }}>
              Estas alterações não foram aplicadas. O servidor já tinha outra versão do mesmo lançamento, ou
              recusou o dado.
            </Body>

            <View style={{ marginTop: space.md, gap: space.md }}>
              {conflicts.map((linha) => (
                <View key={linha.mutationId} style={{ gap: space.sm }}>
                  <Divider />
                  <Body strong numberOfLines={1}>
                    {descricaoDaMutacao(linha.dataJson)}
                  </Body>
                  <Small tone={linha.status === "conflict" ? "caution" : "negative"}>
                    {linha.message ?? (linha.status === "conflict" ? "Versão divergente." : "Recusado.")}
                  </Small>

                  <View style={{ flexDirection: "row", gap: space.sm }}>
                    {linha.status === "conflict" && linha.serverVersion !== null ? (
                      <Button
                        label="Manter a minha"
                        onPress={() =>
                          // Reenvia sobre a versão que o servidor informou ao
                          // recusar. É isso que significa "a minha vale".
                          void resolveConflict(
                            linha.mutationId,
                            "reenviar",
                            linha.serverVersion ?? linha.baseVersion,
                          )
                        }
                        style={{ flex: 1 }}
                      />
                    ) : null}
                    <Button
                      label={linha.status === "conflict" ? "Ficar com a do servidor" : "Descartar"}
                      variant="secondary"
                      onPress={() => void resolveConflict(linha.mutationId, "descartar", 0)}
                      style={{ flex: 1 }}
                    />
                  </View>
                </View>
              ))}
            </View>
          </Card>
        ) : null}

        {isBridgeAvailable() ? (
          <Card>
            <Label>Leitura de notificações</Label>
            <Body muted style={{ marginTop: space.sm }}>
              Permite que o Fluxo sugira lançamentos a partir dos avisos de compra. As sugestões sempre
              passam por revisão.
            </Body>
            <Button
              label="Abrir ajustes do Android"
              variant="secondary"
              onPress={openListenerSettings}
              style={{ marginTop: space.md }}
            />
          </Card>
        ) : null}

        <Card>
          <Label>Capturas de notificação</Label>
          <Body muted style={{ marginTop: space.sm }}>
            Avisos de compra dos aplicativos do banco viram sugestão de lançamento. Nada entra na sua conta
            sem você confirmar.
          </Body>
          <Button
            label="Ver fila de revisão"
            variant="secondary"
            onPress={onAbrirCapturas}
            style={{ marginTop: space.md }}
          />
        </Card>

        <Card>
          <Label>Aparelho</Label>
          <View style={{ marginTop: space.sm }}>
            <Row>
              <Small tone="muted">Nome</Small>
              <Small tone="muted">{deviceName ?? "desconhecido"}</Small>
            </Row>
            <Row style={{ borderBottomWidth: 0 }}>
              <Small tone="muted">Versão</Small>
              <Small tone="muted">{appVersion}</Small>
            </Row>
          </View>
        </Card>

        <Card>
          <Label>Desconectar</Label>
          <Body muted style={{ marginTop: space.sm }}>
            Apaga deste aparelho todos os dados e o token de acesso. O que já foi sincronizado continua na
            sua conta.
          </Body>
          {sync.pending > 0 ? (
            <View style={{ marginTop: space.md }}>
              <Notice tone="caution">
                {sync.pending} lançamento(s) ainda não subiram. Sincronize antes de desconectar, ou eles se
                perdem.
              </Notice>
            </View>
          ) : null}
          <Button
            label="Desconectar este aparelho"
            variant="danger"
            busy={desconectando}
            onPress={() => {
              setDesconectando(true);
              void disconnect();
            }}
            style={{ marginTop: space.md }}
          />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

/** Rótulo legível para a mutação parada na fila. */
function descricaoDaMutacao(dataJson: string | null): string {
  if (!dataJson) return "Exclusão de lançamento";
  try {
    const dados = JSON.parse(dataJson) as { description?: string };
    return dados.description || "Lançamento";
  } catch {
    return "Lançamento";
  }
}
