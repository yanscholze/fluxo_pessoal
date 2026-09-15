/**
 * Ajustes.
 *
 * Também é onde os conflitos de sincronização são resolvidos. Eles não têm
 * tela própria de propósito: são raros, e enterrá-los num aviso que some seria
 * o mesmo que descartar a edição do usuário sem avisar.
 */

import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { CaretLeft, CaretRight, CirclesFour, Robot, Wallet, Wrench } from "phosphor-react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { Tela } from "../shell.tsx";
import { appVersion, deviceName } from "../device.ts";
import { isBridgeAvailable, openListenerSettings } from "../notifications/bridge.ts";
import { useLedger } from "../state/ledger.tsx";
import { useSession } from "../state/session.tsx";
import { Body, Button, Card, Divider, Label, Notice, Row, Small } from "../ui/primitives.tsx";
import { radius, space, type, useAppearance, usePalette, type AccentId } from "../ui/theme.ts";

export function AjustesScreen({
  onAbrirCapturas,
  onVoltar,
  onNavigate,
}: {
  onAbrirCapturas: () => void;
  onVoltar: () => void;
  onNavigate: (tela: Tela) => void;
}) {
  const palette = usePalette();
  const { accentId, setAccentId, accents } = useAppearance();
  const { state, disconnect } = useSession();
  const { sync, conflicts, synchronize, resolveConflict } = useLedger();
  const [desconectando, setDesconectando] = useState(false);

  const conectado = state.status === "conectado" ? state : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.canvas }} edges={[]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, gap: space.md, paddingBottom: 40 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          <Pressable onPress={onVoltar} hitSlop={12} accessibilityRole="button" accessibilityLabel="Voltar" style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? palette.surfaceRaised : palette.surface, borderWidth: 1, borderColor: palette.line })}>
            <CaretLeft size={20} color={palette.ink} />
          </Pressable>
          <Body strong style={{ fontSize: 24 }}>
            Configurações
          </Body>
        </View>

        <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: palette.accentWash }}><Body strong>{iniciais(conectado?.credentials.user.displayName)}</Body></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Body strong numberOfLines={1}>{conectado?.credentials.user.displayName ?? "—"}</Body>
            <Small numberOfLines={1}>{conectado?.credentials.user.email ?? ""}</Small>
          </View>
        </Card>

        <Grupo titulo="Fluxo">
          <LinhaDeAjuste icon={<Robot size={19} color={palette.accent} />} label="TARS" onPress={() => onNavigate("assistente")} />
          <LinhaDeAjuste icon={<Wallet size={19} color={palette.accent} />} label="Contas e visão geral" onPress={() => onNavigate("contas")} />
          <LinhaDeAjuste icon={<CirclesFour size={19} color={palette.accent} />} label="Planejamento financeiro" onPress={() => onNavigate("recorrencias")} />
          <LinhaDeAjuste icon={<Wrench size={19} color={palette.accent} />} label="Ferramentas e relatórios" onPress={() => onNavigate("relatorios")} ultimo />
        </Grupo>

        <Grupo titulo="Mais recursos">
          <LinhaDeAjuste label="Assinaturas" onPress={() => onNavigate("assinaturas")} />
          <LinhaDeAjuste label="Orçamentos" onPress={() => onNavigate("orcamentos")} />
          <LinhaDeAjuste label="Patrimônio, metas e investimentos" onPress={() => onNavigate("patrimonio")} />
          <LinhaDeAjuste label="Viagens" onPress={() => onNavigate("viagens")} />
          <LinhaDeAjuste label="Automações e importações" onPress={() => onNavigate("automacoes")} ultimo />
        </Grupo>

        <Card>
          <Label>Cor principal</Label>
          <Body muted style={{ marginTop: space.sm }}>
            Roxo é a cor oficial do Fluxo. A escolha vale para toda a interface deste aparelho.
          </Body>
          <View style={{ flexDirection: "row", gap: 12, marginTop: space.lg }}>
            {(Object.keys(accents) as AccentId[]).map((id) => {
              const selecionada = id === accentId;
              return (
                <Pressable
                  key={id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selecionada }}
                  accessibilityLabel={id === "blurple" ? "Roxo oficial" : id}
                  onPress={() => setAccentId(id)}
                  style={({ pressed }) => ({
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor: selecionada ? accents[id].soft : palette.line,
                    opacity: pressed ? 0.68 : 1,
                  })}
                >
                  <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: accents[id].base }} />
                </Pressable>
              );
            })}
          </View>
          <Small style={{ marginTop: space.sm }}>{accentId === "blurple" ? "Roxo oficial" : accentId}</Small>
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

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  const palette = usePalette();
  return <View><Label style={{ marginLeft: 4, marginBottom: 7 }}>{titulo}</Label><View style={{ borderRadius: radius.lg, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.surface, overflow: "hidden" }}>{children}</View></View>;
}

function LinhaDeAjuste({ icon, label, onPress, ultimo }: { icon?: React.ReactNode; label: string; onPress: () => void; ultimo?: boolean }) {
  const palette = usePalette();
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ minHeight: 54, flexDirection: "row", alignItems: "center", gap: 11, marginLeft: 14, paddingRight: 14, borderBottomWidth: ultimo ? 0 : 1, borderBottomColor: palette.line, backgroundColor: pressed ? palette.surfaceRaised : "transparent" })}>{icon ?? <View style={{ width: 19 }} />}<Body style={{ flex: 1 }}>{label}</Body><CaretRight size={16} color={palette.inkSubtle} /></Pressable>;
}

function iniciais(nome?: string): string { return nome?.trim().split(/\s+/).slice(0, 2).map((parte) => parte[0]?.toUpperCase()).join("") || "F"; }

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
