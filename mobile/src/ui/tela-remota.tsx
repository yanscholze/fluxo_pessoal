/**
 * A moldura de uma tela que lê do servidor.
 *
 * Cabeçalho, rolagem, puxar-para-atualizar e os três estados que toda tela
 * online tem — carregando, sem rede, servidor recusou — num lugar só. Antes
 * cada tela desenhava os três à sua maneira, e "sem conexão" aparecia com um
 * texto em uma e outro em outra, o que faz o usuário achar que são problemas
 * diferentes.
 *
 * O aviso de offline é deliberadamente afirmativo sobre o que **não** está
 * sendo mostrado. Uma tela vazia sem explicação faz a pessoa duvidar do próprio
 * dado; dizer "isto é calculado no servidor e eu não o alcancei" devolve a ela
 * o controle da situação.
 */

import type { ReactNode } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { Remoto } from "../state/remote.tsx";
import { Button, Notice, Small, Texto } from "./primitives.tsx";
import { space, type, usePalette } from "./theme.ts";

export function TelaRemota<T>({
  titulo,
  descricao,
  remoto,
  onVoltar,
  acao,
  children,
}: {
  titulo: string;
  descricao?: string;
  remoto: Remoto<T>;
  /** Presente quando a tela veio empilhada, e não de uma aba. */
  onVoltar?: () => void;
  /** Botão à direita do cabeçalho. */
  acao?: ReactNode;
  children: (dados: T) => ReactNode;
}) {
  const palette = usePalette();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.canvas }} edges={[]}>
      <ScrollView
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl, gap: space.md }}
        refreshControl={
          <RefreshControl
            refreshing={remoto.carregando}
            onRefresh={remoto.recarregar}
            tintColor={palette.accent}
          />
        }
      >
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.sm }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            {onVoltar ? (
              <Texto
                accessibilityRole="button"
                onPress={onVoltar}
                style={[type.bodySm, { color: palette.accent, marginBottom: 4 }]}
              >
                ‹ Voltar
              </Texto>
            ) : null}
            <Texto style={[type.title, { color: palette.ink }]}>{titulo}</Texto>
            {descricao ? <Small style={{ marginTop: 2 }}>{descricao}</Small> : null}
          </View>
          {acao}
        </View>

        {remoto.offline ? (
          <Notice tone="caution">
            Sem conexão. Estes números são calculados no servidor — mostrar o último
            que passou por aqui seria mostrar algo que já não vale.
          </Notice>
        ) : null}

        {remoto.erro ? (
          <Notice tone="negative">
            {remoto.erro}
            {"\n"}
            <Texto accessibilityRole="button" onPress={remoto.recarregar} style={{ color: palette.accent }}>
              Tentar de novo
            </Texto>
          </Notice>
        ) : null}

        {remoto.dados ? (
          children(remoto.dados)
        ) : remoto.carregando ? (
          <Small>Carregando…</Small>
        ) : !remoto.offline && !remoto.erro ? (
          <View style={{ gap: space.sm }}>
            <Small>Nada para mostrar ainda.</Small>
            <Button label="Recarregar" variant="ghost" onPress={remoto.recarregar} />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
