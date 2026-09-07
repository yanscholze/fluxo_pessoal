/**
 * Uma aba que reúne destinos.
 *
 * "Carteira" e "Planos" não são telas: são perguntas grandes demais para uma
 * tela e pequenas demais para uma aba cada. O hub resolve isso mostrando o
 * número que responde a pergunta de imediato e, abaixo, as portas para o
 * detalhe.
 *
 * A alternativa seria uma aba por destino — nove abas numa barra que cabe cinco
 * — ou enfiar tudo numa rolagem só, onde o que fica embaixo não é encontrado.
 */

import { Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScrollView } from "react-native";

import { Body, Card, Label, Small, Texto } from "../ui/primitives.tsx";
import { space, type, usePalette } from "../ui/theme.ts";

export type DestinoDoHub = {
  readonly id: string;
  readonly titulo: string;
  readonly descricao: string;
};

export function HubScreen({
  titulo,
  descricao,
  destinos,
  onAbrir,
  resumo,
}: {
  titulo: string;
  descricao: string;
  destinos: readonly DestinoDoHub[];
  onAbrir: (id: string) => void;
  /** Bloco opcional no topo, com o número que resume a aba. */
  resumo?: React.ReactNode;
}) {
  const palette = usePalette();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.canvas }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl, gap: space.md }}>
        <View>
          <Texto style={[type.title, { color: palette.ink }]}>{titulo}</Texto>
          <Small style={{ marginTop: 2 }}>{descricao}</Small>
        </View>

        {resumo}

        <Card>
          {destinos.map((destino, indice) => (
            <Pressable
              key={destino.id}
              accessibilityRole="button"
              onPress={() => onAbrir(destino.id)}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: space.md,
                paddingVertical: space.md,
                borderBottomWidth: indice === destinos.length - 1 ? 0 : 1,
                borderBottomColor: palette.line,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Body strong>{destino.titulo}</Body>
                <Small style={{ marginTop: 2 }}>{destino.descricao}</Small>
              </View>
              <Texto style={[type.body, { color: palette.inkSubtle }]}>›</Texto>
            </Pressable>
          ))}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

/** Um rótulo com número, para o bloco de resumo do hub. */
export function ResumoDoHub({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <Card>
      <Label>{rotulo}</Label>
      {children}
    </Card>
  );
}
