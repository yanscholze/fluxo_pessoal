/**
 * Extrato.
 *
 * A tela onde se procura um lançamento para conferir ou corrigir. Três coisas
 * decidem o desenho:
 *
 * 1. **Busca antes de filtro.** Quem abre o extrato quase sempre procura *um*
 *    lançamento, e lembra do nome dele, não do dia. Um campo de busca resolve
 *    em dois toques o que a rolagem resolve em vinte.
 *
 * 2. **Agrupado por dia, com o total do dia.** A pergunta "quanto gastei
 *    terça?" é frequente e não tem resposta numa lista corrida.
 *
 * 3. **Previsto é visualmente distinto, sempre.** Previsão apresentada como
 *    fato é a forma mais direta de fazer alguém gastar dinheiro que ainda não
 *    recebeu.
 */

import { useMemo, useState } from "react";
import { Pressable, RefreshControl, SectionList, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { cents, type Cents } from "@fluxo/core/kernel/money.ts";
import { todayIn } from "@fluxo/core/time/local-date.ts";
import { useLedger } from "../state/ledger.tsx";
import type { LocalTransaction } from "../storage/model.ts";
import { money, relativeDate } from "../ui/format.ts";
import { Empty, Small, Texto } from "../ui/primitives.tsx";
import { radius, space, type, usePalette } from "../ui/theme.ts";

type Filtro = "tudo" | "entradas" | "saidas" | "previsto";

const FILTROS: readonly { readonly id: Filtro; readonly rotulo: string }[] = [
  { id: "tudo", rotulo: "Tudo" },
  { id: "saidas", rotulo: "Saídas" },
  { id: "entradas", rotulo: "Entradas" },
  { id: "previsto", rotulo: "Previsto" },
];

const COMPETENCIA_CURTA = new Intl.DateTimeFormat("pt-BR", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** Forma canônica para comparar texto digitado com descrição salva. */
function normalizar(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

export function ExtratoScreen({ onOpenTransaction }: { onOpenTransaction: (id: string) => void }) {
  const palette = usePalette();
  const { transactions, categories, sync, synchronize } = useLedger();

  const [filtro, setFiltro] = useState<Filtro>("tudo");
  const [busca, setBusca] = useState("");
  const competenciaAtual = hojeCompetencia();
  const totaisDoMes = useMemo(
    () => transactions
      .filter((item) => item.competence === competenciaAtual && item.state === "confirmed")
      .reduce(
        (total, item) => ({
          entrada: total.entrada + (item.kind === "income" ? item.amount : 0),
          saida: total.saida + (item.kind === "expense" ? item.amount : 0),
        }),
        { entrada: 0, saida: 0 },
      ),
    [transactions, competenciaAtual],
  );

  const nomeDaCategoria = useMemo(
    () => new Map(categories.map((categoria) => [categoria.id, categoria.name])),
    [categories],
  );

  const { secoes, total } = useMemo(() => {
    const termo = normalizar(busca);

    const visiveis = transactions.filter((item) => {
      /*
       * "Saídas" e "Entradas" mostram o que **aconteceu**, não o que está
       * projetado.
       *
       * A versão anterior filtrava só pela natureza, e com 67 parcelas
       * projetadas até 2027 o extrato abria mostrando compras que ainda nem
       * foram cobradas — todas marcadas "previsto", todas em datas à frente,
       * empurrando o gasto de verdade para fora da tela. Quem abre o extrato
       * quer conferir o que saiu; para o que vem, existe a aba própria.
       *
       * Por isso "Previsto" é uma aba irmã e não um acréscimo: as três se
       * excluem, e "Tudo" continua sendo o lugar de ver os dois juntos.
       */
      if (filtro === "previsto" && item.state !== "planned") return false;
      if (filtro === "entradas" && (item.kind !== "income" || item.state === "planned")) return false;
      if (filtro === "saidas" && (item.kind !== "expense" || item.state === "planned")) return false;
      if (!termo) return true;

      const categoria = item.categoryId ? (nomeDaCategoria.get(item.categoryId) ?? "") : "";
      return normalizar(`${item.description} ${categoria}`).includes(termo);
    });

    const porDia = new Map<string, LocalTransaction[]>();
    for (const item of visiveis) {
      const chave = item.occurredOn as string;
      const lista = porDia.get(chave);
      if (lista) lista.push(item);
      else porDia.set(chave, [item]);
    }

    const secoes = [...porDia.entries()]
      .sort((esquerda, direita) => direita[0].localeCompare(esquerda[0]))
      .map(([dia, itens]) => ({
        title: dia,
        // O total do dia é só de consumo: transferência entre contas próprias
        // apareceria como saída e faria o dia parecer pior do que foi.
        total: itens.reduce(
          (soma, item) =>
            item.kind === "income" ? soma + item.amount : item.kind === "expense" ? soma - item.amount : soma,
          0,
        ),
        data: itens,
      }));

    return { secoes, total: visiveis.length };
  }, [transactions, filtro, busca, nomeDaCategoria]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.canvas }} edges={["top"]}>
      <View style={{ paddingHorizontal: 17, paddingTop: 17, gap: 17 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Texto style={[type.title, { color: palette.ink }]}>Extrato</Texto>
          <View style={{ borderWidth: 1, borderColor: palette.accent, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }}>
            <Small style={{ color: palette.accent }}>{rotuloCompetencia(competenciaAtual)}</Small>
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 17 }}>
          <View style={{ flex: 1, paddingLeft: 11, borderLeftWidth: 1, borderLeftColor: palette.line }}>
            <Small>Entrou</Small>
            <Texto style={[type.figureSm, { color: palette.ink, marginTop: 3 }]}>{numero(money(cents(totaisDoMes.entrada)))}</Texto>
          </View>
          <View style={{ flex: 1, paddingLeft: 11, borderLeftWidth: 1, borderLeftColor: palette.line }}>
            <Small>Saiu</Small>
            <Texto style={[type.figureSm, { color: palette.inkMuted, marginTop: 3 }]}>{numero(money(cents(totaisDoMes.saida)))}</Texto>
          </View>
        </View>

        <TextInput
          value={busca}
          onChangeText={setBusca}
          placeholder="Buscar por descrição ou categoria"
          placeholderTextColor={palette.inkSubtle}
          returnKeyType="search"
          clearButtonMode="while-editing"
          style={{
            height: 42,
            paddingHorizontal: space.md,
            borderRadius: radius.md,
            backgroundColor: "transparent",
            borderWidth: 1,
            borderColor: palette.line,
            color: palette.ink,
            fontSize: type.body.fontSize,
          }}
        />

        <View style={{ flexDirection: "row", gap: 6 }}>
          {FILTROS.map((opcao) => {
            const ativo = filtro === opcao.id;
            return (
              <Pressable
                key={opcao.id}
                accessibilityRole="button"
                accessibilityState={{ selected: ativo }}
                onPress={() => setFiltro(opcao.id)}
                // O recuo no toque é o que dá peso ao filtro: ele reordena a
                // tela inteira, e sem resposta tátil o dedo não sabe se pegou.
                style={({ pressed }) => ({
                  minHeight: 38,
                  alignItems: "center",
                  justifyContent: "center",
                  paddingHorizontal: 13,
                  borderRadius: radius.md,
                  backgroundColor: ativo ? palette.surface : "transparent",
                  borderWidth: ativo ? 1 : 0,
                  borderColor: palette.line,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Texto
                  style={[
                    type.caption,
                    { color: ativo ? palette.ink : palette.inkMuted, fontWeight: ativo ? "500" : "400" },
                  ]}
                >
                  {opcao.rotulo}
                </Texto>
              </Pressable>
            );
          })}
        </View>
      </View>

      <SectionList
        sections={secoes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingHorizontal: 17,
          paddingTop: 8,
          paddingBottom: space.xxl * 2,
        }}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl refreshing={sync.running} onRefresh={() => void synchronize()} tintColor={palette.accent} />
        }
        ListEmptyComponent={
          <Empty
            title={busca ? "Nada encontrado" : "Nenhum lançamento"}
            hint={
              busca
                ? "Tente outro termo, ou limpe a busca."
                : "Toque no botão de mais para registrar o primeiro."
            }
          />
        }
        renderSectionHeader={({ section }) => (
          <View
            style={{
              flexDirection: "row",
              alignItems: "baseline",
              justifyContent: "space-between",
              paddingTop: space.lg,
              paddingBottom: space.sm,
            }}
          >
            <Texto style={[type.label, { color: palette.inkSubtle }]}>
              {relativeDate(section.title as never).toUpperCase()}
            </Texto>
            <Texto
              style={[
                type.caption,
                { color: section.total < 0 ? palette.inkMuted : palette.positive },
              ]}
            >
              {section.total === 0
                ? ""
                : `${section.total > 0 ? "+" : "−"} ${money(cents(Math.abs(section.total)))}`}
            </Texto>
          </View>
        )}
        renderItem={({ item, index, section }) => (
          <Linha
            transacao={item}
            categoria={item.categoryId ? (nomeDaCategoria.get(item.categoryId) ?? null) : null}
            primeira={index === 0}
            ultima={index === section.data.length - 1}
            hoje={todayIn()}
            onPress={() => onOpenTransaction(item.id)}
          />
        )}
      />
    </SafeAreaView>
  );
}

/**
 * Uma linha do extrato.
 *
 * O dia inteiro é um bloco com cantos arredondados só nas pontas — o mesmo
 * agrupamento visual que o sistema usa em lista, e que faz a leitura por dia
 * acontecer sem precisar de título repetido em cada linha.
 */
function Linha({
  transacao,
  categoria,
  primeira,
  ultima,
  hoje,
  onPress,
}: {
  transacao: LocalTransaction;
  categoria: string | null;
  primeira: boolean;
  ultima: boolean;
  hoje: string;
  onPress: () => void;
}) {
  const palette = usePalette();

  const entrada = transacao.kind === "income";
  const transferencia = transacao.kind === "transfer";
  const previsto = transacao.state === "planned";
  const atrasado = previsto && (transacao.occurredOn as string) < hoje;

  const cor = transferencia
    ? palette.info
    : entrada
      ? palette.positive
      : previsto
        ? palette.inkSubtle
        : palette.negative;

  return (
    <Pressable
      onPress={onPress}
      /*
       * A ondulação nativa, além do fundo que muda.
       *
       * Numa lista longa uma animação por linha custaria caro — um valor
       * compartilhado por item, num extrato de trezentas linhas. O `ripple` do
       * Android roda no sistema, não no JavaScript: custa zero e é a resposta
       * tátil que a mão espera de uma lista.
       */
      android_ripple={{ color: palette.accentWash }}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 11,
        minHeight: 48,
        paddingVertical: 11,
        backgroundColor: pressed ? palette.surface : "transparent",
        borderTopWidth: 1,
        borderTopColor: palette.line,
      })}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Texto
          style={[type.body, { color: previsto ? palette.inkMuted : palette.ink }]}
          numberOfLines={1}
        >
          {transacao.description}
        </Texto>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: 1 }}>
          {categoria ? <Small numberOfLines={1}>{categoria}</Small> : <Small>sem categoria</Small>}
          {transacao.installmentNumber ? <Small>· {transacao.installmentNumber}ª parcela</Small> : null}
        </View>
      </View>

      <View style={{ alignItems: "flex-end" }}>
        <Texto style={[type.bodyStrong, { color: entrada ? palette.positive : palette.ink }]}>
          {entrada ? "+ " : transferencia ? "" : "− "}
          {money(transacao.amount as Cents)}
        </Texto>
        {previsto ? (
          <Texto
            style={[
              type.caption,
              { color: atrasado ? palette.caution : palette.inkSubtle, marginTop: 1 },
            ]}
          >
            {atrasado ? "atrasado" : "previsto"}
          </Texto>
        ) : null}
      </View>
    </Pressable>
  );
}

function hojeCompetencia(): string {
  const hoje = todayIn() as string;
  return hoje.slice(0, 7);
}

function rotuloCompetencia(valor: string): string {
  const [ano, mes] = valor.split("-").map(Number);
  return COMPETENCIA_CURTA
    .format(new Date(Date.UTC(ano, mes - 1, 1)))
    .replace(" de ", " ")
    .replace(".", "");
}

function numero(valor: string): string {
  return valor.replace(/^R\$\s*/, "");
}
