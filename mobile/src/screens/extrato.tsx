/**
 * Extrato.
 *
 * Lista o que já aconteceu e o que está previsto, agrupado por dia. A
 * separação entre confirmado e previsto é visual e explícita: previsão
 * apresentada como fato é a forma mais direta de fazer alguém gastar dinheiro
 * que ainda não recebeu.
 */

import { useMemo, useState } from "react";
import { Pressable, RefreshControl, SectionList, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { todayIn } from "@fluxo/core/time/local-date.ts";
import { useLedger } from "../state/ledger.tsx";
import type { LocalTransaction } from "../storage/model.ts";
import { money, relativeDate } from "../ui/format.ts";
import { Body, Empty, Label, Row, Small } from "../ui/primitives.tsx";
import { radius, space, usePalette } from "../ui/theme.ts";

type Filtro = "tudo" | "confirmado" | "previsto";

export function ExtratoScreen({ onOpenTransaction }: { onOpenTransaction: (id: string) => void }) {
  const palette = usePalette();
  const { transactions, categories, sync, synchronize } = useLedger();
  const [filtro, setFiltro] = useState<Filtro>("tudo");

  const hoje = todayIn();
  const nomeDaCategoria = useMemo(
    () => new Map(categories.map((categoria) => [categoria.id, categoria.name])),
    [categories],
  );

  const secoes = useMemo(() => {
    const visiveis = transactions.filter((item) => {
      if (filtro === "confirmado") return item.state === "confirmed";
      if (filtro === "previsto") return item.state === "planned";
      return true;
    });

    const porDia = new Map<string, LocalTransaction[]>();
    for (const item of visiveis) {
      const chave = item.occurredOn as string;
      const lista = porDia.get(chave);
      if (lista) lista.push(item);
      else porDia.set(chave, [item]);
    }

    return [...porDia.entries()]
      .sort((esquerda, direita) => direita[0].localeCompare(esquerda[0]))
      .map(([dia, itens]) => ({ title: dia, data: itens }));
  }, [transactions, filtro]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.canvas }} edges={["top"]}>
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm }}>
        <Body strong style={{ fontSize: 20 }}>
          Extrato
        </Body>

        <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.md }}>
          {(["tudo", "confirmado", "previsto"] as const).map((opcao) => (
            <Chip key={opcao} label={rotulo(opcao)} active={filtro === opcao} onPress={() => setFiltro(opcao)} />
          ))}
        </View>
      </View>

      <SectionList
        sections={secoes}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl }}
        refreshControl={
          <RefreshControl refreshing={sync.running} onRefresh={() => void synchronize()} tintColor={palette.accent} />
        }
        ListEmptyComponent={
          <Empty
            title="Nenhum lançamento neste filtro"
            hint={filtro === "previsto" ? "Recorrências e parcelas futuras aparecem aqui." : undefined}
          />
        }
        renderSectionHeader={({ section }) => (
          <View style={{ paddingTop: space.lg, paddingBottom: space.xs }}>
            <Label>{relativeDate(section.title as never, hoje)}</Label>
          </View>
        )}
        renderItem={({ item }) => (
          <Row onPress={() => onOpenTransaction(item.id)}>
            <View style={{ flex: 1 }}>
              <Body numberOfLines={1}>{item.description}</Body>
              <Small>
                {item.categoryId ? (nomeDaCategoria.get(item.categoryId) ?? "sem categoria") : "sem categoria"}
                {item.state === "planned" ? " · previsto" : ""}
                {item.installmentNumber ? ` · parcela ${item.installmentNumber}` : ""}
              </Small>
            </View>
            <Body
              strong
              style={{
                color:
                  item.kind === "income"
                    ? palette.positive
                    : item.state === "planned"
                      ? palette.inkMuted
                      : palette.ink,
              }}
            >
              {item.kind === "income" ? "+ " : "− "}
              {money(item.amount)}
            </Body>
          </Row>
        )}
      />
    </SafeAreaView>
  );
}

function rotulo(filtro: Filtro): string {
  return filtro === "tudo" ? "Tudo" : filtro === "confirmado" ? "Confirmados" : "Previstos";
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: active ? palette.accentWash : palette.surfaceSunken,
        borderRadius: radius.pill,
        paddingHorizontal: space.md,
        paddingVertical: space.sm,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Small style={{ color: active ? palette.accent : palette.inkSubtle }}>{label}</Small>
    </Pressable>
  );
}
