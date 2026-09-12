/**
 * As telas de lista: contas, metas, investimentos, recompensas, viagens e
 * automações.
 *
 * Ficam juntas porque são a mesma tela seis vezes — cabeçalho, total, lista —
 * e separá-las em seis arquivos produziria seis cópias da mesma estrutura, que
 * é como a divergência começa: a sétima copia a sexta, inclusive os defeitos.
 *
 * O que muda entre elas é o que cada uma responde, e isso está no comentário de
 * cada função, não na forma.
 */

import { useState } from "react";
import { Modal, Pressable, View } from "react-native";

import { cents } from "@fluxo/core/kernel/money.ts";
import {
  type ContaView,
  fetchAutomacoes,
  fetchContas,
  fetchInvestimentos,
  fetchMetas,
  fetchRecompensas,
  fetchViagens,
} from "../net/views.ts";
import { useRemoto } from "../state/remote.tsx";
import { Medidor } from "../ui/charts.tsx";
import { money, percent, relativeDate } from "../ui/format.ts";
import { Body, Card, Empty, Figure, Label, Row, Small } from "../ui/primitives.tsx";
import { TelaRemota } from "../ui/tela-remota.tsx";
import { ContaDetalheScreen } from "./conta-detalhe.tsx";
import { radius, space, usePalette } from "../ui/theme.ts";

/** Rótulo humano da natureza da conta. */
const NATUREZA: Record<string, string> = {
  checking: "Conta corrente",
  savings: "Poupança",
  cash: "Dinheiro",
  benefit: "Benefício",
  investment: "Investimento",
};

/**
 * Contas.
 *
 * O Início mostra o saldo somado; aqui ele se abre. A pergunta é "onde está o
 * meu dinheiro", e a resposta muda decisão: saber que há R$ 3 mil não é o mesmo
 * que saber que R$ 2,9 mil deles estão na caixinha.
 */
export function ContasScreen({ onVoltar }: { onVoltar?: () => void }) {
  const palette = usePalette();
  const remoto = useRemoto(fetchContas);
  /*
   * A conta aberta.
   *
   * A lista respondia "quanto tem em cada lugar" e parava aí; toda pergunta
   * seguinte exigia abrir o site. Um saldo que não é clicável é um cartaz.
   */
  const [aberta, setAberta] = useState<ContaView | null>(null);

  return (
    <TelaRemota titulo="Contas" descricao="Onde o dinheiro está." remoto={remoto} onVoltar={onVoltar}>
      {(contas) => {
        const total = contas.filter((c) => c.includeInTotals).reduce((s, c) => s + c.balanceCents, 0);

        return (
          <>
            <Card>
              <Label>Somando tudo</Label>
              <Figure tone={total < 0 ? "negative" : "neutral"}>{money(cents(total))}</Figure>
              <Small style={{ marginTop: 2 }}>
                {contas.length} conta{contas.length === 1 ? "" : "s"}
              </Small>
            </Card>

            <Card>
              {contas.length === 0 ? (
                <Empty title="Nenhuma conta" hint="Cadastre no site para elas aparecerem aqui." />
              ) : (
                contas.map((conta, indice) => (
                  <Row key={conta.id} style={indice === contas.length - 1 ? { borderBottomWidth: 0 } : undefined}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Abrir ${conta.name}`}
                      onPress={() => setAberta(conta)}
                      style={{ flexDirection: "row", alignItems: "center", gap: space.sm, flex: 1, minWidth: 0 }}
                    >
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: radius.pill,
                          backgroundColor: conta.color || palette.accent,
                        }}
                      />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Body numberOfLines={1}>{conta.name}</Body>
                        <Small>
                          {NATUREZA[conta.kind] ?? conta.kind}
                          {conta.institution ? ` · ${conta.institution}` : ""}
                        </Small>
                      </View>
                    </Pressable>
                    <Body strong style={{ color: conta.balanceCents < 0 ? palette.negative : palette.ink }}>
                      {money(cents(conta.balanceCents))}
                    </Body>
                  </Row>
                ))
              )}
            </Card>

            <Modal
              visible={aberta !== null}
              animationType="slide"
              presentationStyle="pageSheet"
              onRequestClose={() => setAberta(null)}
            >
              {aberta ? (
                <ContaDetalheScreen
                  conta={aberta}
                  onClose={() => {
                    setAberta(null);
                    // O acerto de saldo muda o número da lista: sem recarregar,
                    // ela mostraria o valor de antes e pareceria que nada foi.
                    remoto.recarregar();
                  }}
                />
              ) : null}
            </Modal>
          </>
        );
      }}
    </TelaRemota>
  );
}

/**
 * Metas.
 *
 * O anel de progresso importa mais que o valor guardado: a meta existe para
 * dizer "quanto falta", e um número absoluto sem o alvo ao lado não responde.
 */
export function MetasScreen({ onVoltar }: { onVoltar?: () => void }) {
  const remoto = useRemoto(fetchMetas);

  return (
    <TelaRemota titulo="Metas" descricao="Quanto falta para cada uma." remoto={remoto} onVoltar={onVoltar}>
      {(dados) => (
        <>
          <Card>
            <Label>Guardado nas metas</Label>
            <Figure>{money(cents(dados.totals.current))}</Figure>
            <Small style={{ marginTop: 2, marginBottom: space.sm }}>
              de {money(cents(dados.totals.target))} · {percent(dados.totals.percent)}
            </Small>
            <Medidor valor={dados.totals.percent} total={100} tom="positive" />
          </Card>

          <Card>
            {dados.goals.length === 0 ? (
              <Empty title="Nenhuma meta" hint="Crie no site para acompanhar aqui." />
            ) : (
              dados.goals.map((meta, indice) => (
                <View
                  key={meta.goalId}
                  style={{
                    paddingVertical: space.md,
                    borderBottomWidth: indice === dados.goals.length - 1 ? 0 : 1,
                    borderBottomColor: "transparent",
                    gap: 6,
                  }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Body numberOfLines={1}>{meta.name}</Body>
                      <Small tone={meta.isAchieved ? "positive" : "subtle"}>
                        {meta.isAchieved
                          ? "alcançada"
                          : `faltam ${money(cents(meta.remaining))}${
                              meta.monthsRemaining !== null ? ` · ~${meta.monthsRemaining} meses` : ""
                            }`}
                      </Small>
                    </View>
                    <Body strong>{percent(meta.percent)}</Body>
                  </View>
                  <Medidor valor={meta.percent} total={100} tom={meta.isAchieved ? "positive" : "accent"} />
                </View>
              ))
            )}
          </Card>
        </>
      )}
    </TelaRemota>
  );
}

/**
 * Investimentos.
 *
 * O rendimento vem junto do valor porque é ele que diz se valeu a pena. Saldo
 * de investimento sem o ganho ao lado é só um número parado.
 */
export function InvestimentosScreen({ onVoltar }: { onVoltar?: () => void }) {
  const palette = usePalette();
  const remoto = useRemoto(fetchInvestimentos);

  return (
    <TelaRemota
      titulo="Investimentos"
      descricao="Quanto rendeu, não só quanto tem."
      remoto={remoto}
      onVoltar={onVoltar}
    >
      {(dados) => (
        <>
          <Card>
            <Label>Valor de mercado</Label>
            <Figure>{money(cents(dados.totals.currentValueCents))}</Figure>
            <Small
              tone={dados.totals.yieldCents >= 0 ? "positive" : "negative"}
              style={{ marginTop: 2 }}
            >
              {dados.totals.yieldCents >= 0 ? "+" : "−"}
              {money(cents(Math.abs(dados.totals.yieldCents)))} ({percent(dados.totals.yieldPercent, 1)}) sobre o
              aportado
            </Small>
          </Card>

          {dados.byClass.length > 0 ? (
            <Card>
              <Label style={{ marginBottom: space.xs }}>Por classe</Label>
              {dados.byClass.map((classe, indice) => (
                <Row key={classe.label} style={indice === dados.byClass.length - 1 ? { borderBottomWidth: 0 } : undefined}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Body>{classe.label}</Body>
                    <Small>{percent(classe.percent, 1)}</Small>
                  </View>
                  <Body strong>{money(cents(classe.valueCents))}</Body>
                </Row>
              ))}
            </Card>
          ) : null}

          <Card>
            <Label style={{ marginBottom: space.xs }}>Ativos</Label>
            {dados.investments.length === 0 ? (
              <Empty title="Nenhum investimento" hint="Cadastre no site para acompanhar aqui." />
            ) : (
              dados.investments.map((ativo, indice) => (
                <Row
                  key={ativo.id}
                  style={indice === dados.investments.length - 1 ? { borderBottomWidth: 0 } : undefined}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Body numberOfLines={1}>{ativo.name}</Body>
                    <Small tone={ativo.yieldCents >= 0 ? "positive" : "negative"}>
                      {ativo.yieldCents >= 0 ? "+" : "−"}
                      {money(cents(Math.abs(ativo.yieldCents)))} · {percent(ativo.yieldPercent, 1)}
                    </Small>
                  </View>
                  <Body strong style={{ color: palette.ink }}>
                    {money(cents(ativo.currentValueCents))}
                  </Body>
                </Row>
              ))
            )}
          </Card>
        </>
      )}
    </TelaRemota>
  );
}

/** Recompensas: pontos e cashback acumulados por cartão. */
export function RecompensasScreen({ onVoltar }: { onVoltar?: () => void }) {
  const remoto = useRemoto(fetchRecompensas);

  return (
    <TelaRemota
      titulo="Recompensas"
      descricao="O que os cartões devolveram."
      remoto={remoto}
      onVoltar={onVoltar}
    >
      {(dados) => (
        <Card>
          {dados.cards.length === 0 ? (
            <Empty title="Nenhum cartão com recompensa" hint="Configure no site para acompanhar aqui." />
          ) : (
            dados.cards.map((cartao, indice) => (
              <Row
                key={cartao.cardId}
                style={indice === dados.cards.length - 1 ? { borderBottomWidth: 0 } : undefined}
              >
                <Body numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                  {cartao.cardName}
                </Body>
                <View style={{ alignItems: "flex-end" }}>
                  {cartao.balance.pointsBalance ? (
                    <Body strong>{cartao.balance.pointsBalance.toLocaleString("pt-BR")} pts</Body>
                  ) : null}
                  {cartao.balance.cashbackCents ? (
                    <Small tone="positive">{money(cents(cartao.balance.cashbackCents))}</Small>
                  ) : null}
                </View>
              </Row>
            ))
          )}
        </Card>
      )}
    </TelaRemota>
  );
}

/** Viagens: quanto cada uma custou. */
export function ViagensScreen({ onVoltar }: { onVoltar?: () => void }) {
  const remoto = useRemoto(fetchViagens);

  return (
    <TelaRemota titulo="Viagens" descricao="Quanto cada uma custou." remoto={remoto} onVoltar={onVoltar}>
      {(dados) => (
        <Card>
          {dados.trips.length === 0 ? (
            <Empty title="Nenhuma viagem" hint="Crie no site e marque os gastos com a etiqueta dela." />
          ) : (
            dados.trips.map((viagem, indice) => (
              <Row key={viagem.id} style={indice === dados.trips.length - 1 ? { borderBottomWidth: 0 } : undefined}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Body numberOfLines={1}>{viagem.name}</Body>
                  {viagem.startsOn ? <Small>{relativeDate(viagem.startsOn as never)}</Small> : null}
                </View>
                <Body strong>{money(cents(viagem.spentCents))}</Body>
              </Row>
            ))
          )}
        </Card>
      )}
    </TelaRemota>
  );
}

/**
 * Automações.
 *
 * Saiu de dentro das configurações. Automação não é preferência de aparência
 * nem de conta: é uma regra que mexe no dinheiro sozinha, e quem tem regra
 * ativa precisa conseguir olhá-la sem caçar num menu de ajustes.
 */
export function AutomacoesScreen({ onVoltar }: { onVoltar?: () => void }) {
  const remoto = useRemoto(fetchAutomacoes);

  return (
    <TelaRemota
      titulo="Automações"
      descricao="Regras que classificam sozinhas o que chega."
      remoto={remoto}
      onVoltar={onVoltar}
    >
      {(regras) => (
        <Card>
          {regras.length === 0 ? (
            <Empty
              title="Nenhuma automação"
              hint="Regras de recebimento classificam um comprovante assim que ele chega."
            />
          ) : (
            regras.map((regra, indice) => (
              <Row key={regra.id} style={indice === regras.length - 1 ? { borderBottomWidth: 0 } : undefined}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Body numberOfLines={1}>{regra.payerName}</Body>
                  <Small>
                    vai para {regra.target}
                    {regra.lastMatchedAt ? ` · usada ${relativeDate(regra.lastMatchedAt.slice(0, 10) as never)}` : ""}
                  </Small>
                </View>
              </Row>
            ))
          )}
        </Card>
      )}
    </TelaRemota>
  );
}
