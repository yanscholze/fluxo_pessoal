/**
 * Uma conta, por dentro.
 *
 * A lista de contas respondia "quanto tem em cada lugar" e parava aí. Toda
 * pergunta seguinte — o que entrou, o que saiu, por que o saldo é esse — exigia
 * abrir o site. Um app de finanças em que o saldo não é clicável é um cartaz,
 * não uma ferramenta.
 *
 * O que abre aqui é o que se pergunta **olhando um saldo**, nessa ordem: quanto
 * tem, o que aconteceu no mês, e o extrato. O acerto de saldo fecha a tela
 * porque é a ação que se toma quando a resposta não bate com o banco — e
 * quando bate, ninguém precisa dela.
 *
 * A diferença entra como lançamento visível, nunca embutida no saldo: corrigir
 * o número por baixo faria o total fechar e o histórico mentir.
 */

import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { cents } from "@fluxo/core/kernel/money.ts";
import { todayIn } from "@fluxo/core/time/local-date.ts";
import type { ContaView } from "../net/views.ts";
import { ContaEditarScreen } from "./conta-editar.tsx";
import { useLedger } from "../state/ledger.tsx";
import { familiaDoPeso } from "../ui/fonts.ts";
import { money, relativeDate } from "../ui/format.ts";
import { Body, Button, Card, Empty, Figure, Label, Notice, Row, Small, Texto } from "../ui/primitives.tsx";
import { radius, space, type, usePalette } from "../ui/theme.ts";

const NATUREZA: Record<string, string> = {
  checking: "Conta corrente",
  savings: "Poupança",
  investment: "Investimento",
  benefit: "Benefício",
  cash: "Dinheiro",
};

export function ContaDetalheScreen({ conta, onClose }: { conta: ContaView; onClose: () => void }) {
  const palette = usePalette();
  const { transactions } = useLedger();
  const [editando, setEditando] = useState(false);

  /*
   * O extrato sai do razão local, o mesmo que alimenta o resto do aplicativo.
   * Uma consulta própria ao servidor traria os mesmos lançamentos por outro
   * caminho — e dois caminhos divergem no dia em que um deles ganhar um filtro.
   */
  const movimentos = useMemo(
    () =>
      transactions
        .filter((item) => item.accountId === conta.id || item.destinationAccountId === conta.id)
        .sort((esquerda, direita) => direita.occurredOn.localeCompare(esquerda.occurredOn))
        .slice(0, 40),
    [transactions, conta.id],
  );

  const mes = todayIn().slice(0, 7);
  const doMes = movimentos.filter((item) => item.occurredOn.startsWith(mes));
  const entrou = doMes
    .filter((item) => item.kind === "income" || item.destinationAccountId === conta.id)
    .reduce((soma, item) => soma + item.amount, 0);
  const saiu = doMes
    .filter((item) => item.kind === "expense" && item.accountId === conta.id)
    .reduce((soma, item) => soma + item.amount, 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.canvas }} edges={["top", "bottom"]}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: space.lg,
          paddingTop: space.md,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Texto style={[type.title, { fontFamily: familiaDoPeso(type.title.fontWeight), color: palette.ink }]}>
            {conta.name}
          </Texto>
          <Small numberOfLines={1}>
            {NATUREZA[conta.kind] ?? conta.kind}
            {conta.institution ? ` · ${conta.institution}` : ""}
          </Small>
        </View>
        <Pressable accessibilityRole="button" onPress={onClose} hitSlop={12}>
          <Body muted>Fechar</Body>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xxl }}>
        <Card>
          <Label>Saldo</Label>
          <Figure tone={conta.balanceCents < 0 ? "negative" : "neutral"}>
            {money(cents(conta.balanceCents))}
          </Figure>
          {!conta.includeInTotals ? (
            <Small style={{ marginTop: 2 }}>Fora do total do patrimônio.</Small>
          ) : null}
        </Card>

        <Card>
          <Label style={{ marginBottom: space.xs }}>Este mês</Label>
          <Row>
            <Body muted>Entrou</Body>
            <Body strong>{money(cents(entrou))}</Body>
          </Row>
          <Row style={{ borderBottomWidth: 0 }}>
            <Body muted>Saiu</Body>
            <Body strong>{money(cents(saiu))}</Body>
          </Row>
        </Card>

        <Card>
          <Label style={{ marginBottom: space.xs }}>Extrato</Label>
          {movimentos.length === 0 ? (
            <Empty title="Nenhum lançamento" hint="Nada passou por esta conta ainda." />
          ) : (
            movimentos.map((item, indice) => {
              const entrada = item.kind === "income" || item.destinationAccountId === conta.id;
              return (
                <Row
                  key={item.id}
                  style={indice === movimentos.length - 1 ? { borderBottomWidth: 0 } : undefined}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Body numberOfLines={1}>{item.description}</Body>
                    <Small>{relativeDate(item.occurredOn as never)}</Small>
                  </View>
                  <Body strong style={{ color: entrada ? palette.positive : palette.ink }}>
                    {entrada ? "+" : "−"} {money(cents(item.amount))}
                  </Body>
                </Row>
              );
            })
          )}
        </Card>

        {/*
          Uma porta só para nome, cor e acerto de saldo. Separá-las em três
          botões faria a tela perguntar "o que você quer mudar?" antes de a
          pessoa poder olhar as opções.
        */}
        <Button label="Editar conta" variant="secondary" onPress={() => setEditando(true)} />
      </ScrollView>

      <Modal
        visible={editando}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEditando(false)}
      >
        <ContaEditarScreen
          conta={conta}
          onClose={() => {
            setEditando(false);
            // Nome, cor e saldo mudam o que a lista mostra: sem fechar até lá,
            // o detalhe seguiria exibindo o que havia antes.
            onClose();
          }}
        />
      </Modal>
    </SafeAreaView>
  );
}
