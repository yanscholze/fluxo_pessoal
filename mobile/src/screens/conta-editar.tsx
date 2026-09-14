/**
 * Editar uma conta.
 *
 * Nome, cor e o acerto de saldo no mesmo lugar — porque são as três coisas que
 * se quer mudar **olhando a conta**, e até aqui nenhuma delas existia: nem no
 * celular, nem no site. Cadastrar era possível; corrigir, não. Um nome digitado
 * errado ficava errado, e a única saída seria apagar a conta e perder o
 * histórico junto.
 *
 * A cor não é enfeite. Ela é o que faz a conta ser reconhecida antes de o nome
 * ser lido — na lista, no ponto ao lado do saldo, na fatia do gráfico. Duas
 * contas do mesmo banco com a mesma cor cinza obrigam a ler o nome toda vez.
 *
 * A paleta é a mesma dos gráficos, então a cor escolhida aqui continua legível
 * lá. O seletor livre do sistema existe no site, onde há mouse e diálogo de
 * cores; aqui a fileira mostra também a cor que veio de lá, para o celular não
 * dizer que a conta está sem cor só porque ela não é uma das nove.
 *
 * O acerto de saldo fica embaixo, separado por uma linha, porque é de outra
 * natureza: nome e cor são aparência e se corrigem à vontade; o acerto **cria
 * um lançamento** e mexe no dinheiro.
 */

import { useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { cents, parseMoney } from "@fluxo/core/kernel/money.ts";
import { todayIn } from "@fluxo/core/time/local-date.ts";
import { call } from "../net/client.ts";
import type { ContaView } from "../net/views.ts";
import { useLedger } from "../state/ledger.tsx";
import { useConnectedSession } from "../state/session.tsx";
import { familiaDoPeso } from "../ui/fonts.ts";
import { money } from "../ui/format.ts";
import { Body, Button, Card, Figure, Label, Notice, Small, Texto } from "../ui/primitives.tsx";
import { radius, space, type, usePalette } from "../ui/theme.ts";

/**
 * As cores possíveis.
 *
 * A mesma paleta dos gráficos, mais um cinza neutro para quem não quer
 * distinguir. São atalhos legíveis por construção: qualquer uma delas continua
 * distinguível na fatia do gráfico e ao lado do acento da interface.
 */
const CORES = [
  "#6d4aff",
  "#2563eb",
  "#0891b2",
  "#0d9668",
  "#65a30d",
  "#b45309",
  "#db2777",
  "#9333ea",
  "#64748b",
] as const;

export function ContaEditarScreen({ conta, onClose }: { conta: ContaView; onClose: () => void }) {
  const palette = usePalette();
  const { credentials } = useConnectedSession();
  const { synchronize } = useLedger();

  const [nome, setNome] = useState(conta.name);
  const [cor, setCor] = useState(conta.color || CORES[8]);
  const [real, setReal] = useState((conta.balanceCents / 100).toFixed(2).replace(".", ","));

  const [salvando, setSalvando] = useState(false);
  const [acertando, setAcertando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<string | null>(null);

  const mudouIdentidade = nome.trim() !== conta.name || cor !== (conta.color || CORES[8]);

  /*
   * A cor escolhida no site entra na fileira.
   *
   * O site oferece, além destas nove, o seletor do sistema — e uma conta pintada
   * com o azul exato do banco não bate com nenhuma das nove. Sem esta linha, o
   * celular mostraria a fileira inteira sem nada marcado, como se a conta não
   * tivesse cor; e salvar o nome levaria junto uma cor que ninguém escolheu.
   *
   * A fileira deriva da cor **gravada**, e não da que está selecionada agora.
   * Derivando da selecionada, tocar numa das nove apagaria da tela a cor livre
   * original — e não haveria caminho de volta sem fechar a tela e perder o que
   * já foi digitado.
   */
  const corGravada = conta.color || CORES[8];
  const paleta: readonly string[] = CORES.some(
    (opcao) => opcao.toLowerCase() === corGravada.toLowerCase(),
  )
    ? CORES
    : [...CORES, corGravada];

  // Quem converte é o domínio, o mesmo `parseMoney` do site e do servidor. Um
  // `Number(texto.replace(",", "."))` aqui seria a segunda implementação de uma
  // regra que já existe, e a primeira a errar com "1.500".
  const informado = parseMoney(real);
  const diferenca = informado === null ? 0 : informado - conta.balanceCents;
  const entrada = diferenca > 0;

  async function salvarIdentidade() {
    if (nome.trim().length === 0) {
      setErro("A conta precisa de um nome.");
      return;
    }

    setSalvando(true);
    setErro(null);
    setFeito(null);
    try {
      await call(`/api/v1/accounts/${conta.id}`, {
        baseUrl: credentials.baseUrl,
        token: credentials.token,
        method: "PATCH",
        body: { name: nome.trim(), color: cor },
      });
      await synchronize();
      setFeito("Conta atualizada.");
    } catch (problema) {
      setErro(problema instanceof Error ? problema.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  /**
   * O acerto cria um lançamento, nunca mexe no saldo por baixo.
   *
   * Corrigir o número direto faria o total fechar e o histórico mentir: o
   * extrato mostraria um saldo que nenhuma soma das suas linhas produz. Como
   * lançamento, a diferença aparece com nome e data, e pode ser questionada.
   */
  async function acertarSaldo() {
    if (diferenca === 0) {
      setErro("O saldo informado é igual ao que o Fluxo já tem.");
      return;
    }

    setAcertando(true);
    setErro(null);
    setFeito(null);
    try {
      await call("/api/v1/transactions", {
        baseUrl: credentials.baseUrl,
        token: credentials.token,
        method: "POST",
        body: {
          kind: entrada ? "income" : "expense",
          description: `Acerto de saldo · ${conta.name}`,
          amount: (Math.abs(diferenca) / 100).toFixed(2),
          occurredOn: todayIn(),
          state: "confirmed",
          accountId: conta.id,
        },
      });
      await synchronize();
      setFeito(`Lançado ${entrada ? "entrada" : "saída"} de ${money(cents(Math.abs(diferenca)))}.`);
      onClose();
    } catch (problema) {
      setErro(problema instanceof Error ? problema.message : "Não foi possível acertar.");
    } finally {
      setAcertando(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.canvas }} edges={["top", "bottom"]}>
      <ScrollView
        contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xxl }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Texto style={[type.title, { fontFamily: familiaDoPeso(type.title.fontWeight), color: palette.ink }]}>
            Editar conta
          </Texto>
          <Pressable accessibilityRole="button" onPress={onClose} hitSlop={12}>
            <Body muted>Fechar</Body>
          </Pressable>
        </View>

        <Card>
          <Label style={{ marginBottom: space.xs }}>Nome</Label>
          <TextInput
            value={nome}
            onChangeText={setNome}
            maxLength={60}
            placeholderTextColor={palette.inkSubtle}
            style={[
              type.body,
              {
                fontFamily: familiaDoPeso(type.body.fontWeight),
                color: palette.ink,
                backgroundColor: palette.surfaceInset,
                borderRadius: radius.md,
                paddingHorizontal: space.sm,
                paddingVertical: 10,
              },
            ]}
          />

          <Label style={{ marginTop: space.lg, marginBottom: space.xs }}>Cor</Label>
          <Small style={{ marginBottom: space.sm }}>
            É por ela que a conta é reconhecida antes de o nome ser lido.
          </Small>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {paleta.map((opcao) => {
              const escolhida = cor.toLowerCase() === opcao.toLowerCase();
              return (
                <Pressable
                  key={opcao}
                  accessibilityRole="button"
                  accessibilityLabel={`Cor ${opcao}`}
                  accessibilityState={{ selected: escolhida }}
                  onPress={() => setCor(opcao)}
                  style={({ pressed }) => ({
                    width: 40,
                    height: 40,
                    borderRadius: radius.pill,
                    backgroundColor: opcao,
                    // A seleção é um anel, e não uma marca dentro do círculo:
                    // um "✓" precisa de contraste contra nove cores diferentes,
                    // e em duas delas ficaria ilegível.
                    borderWidth: escolhida ? 3 : 0,
                    borderColor: palette.ink,
                    transform: [{ scale: pressed ? 0.92 : 1 }],
                  })}
                />
              );
            })}
          </View>

          <View style={{ marginTop: space.lg }}>
            <Button
              label={salvando ? "Salvando…" : "Salvar"}
              onPress={() => void salvarIdentidade()}
              disabled={salvando || !mudouIdentidade}
              busy={salvando}
            />
          </View>
        </Card>

        <Card>
          <Label>Acertar saldo</Label>
          <Small style={{ marginTop: 2, marginBottom: space.md }}>
            O Fluxo soma os lançamentos para chegar ao saldo. Informe o que o banco mostra e a
            diferença entra como lançamento — nunca embutida no número.
          </Small>

          <Label style={{ marginBottom: space.xs }}>Saldo no Fluxo</Label>
          <Figure>{money(cents(conta.balanceCents))}</Figure>

          <Label style={{ marginTop: space.md, marginBottom: space.xs }}>
            Saldo que o banco mostra
          </Label>
          <TextInput
            value={real}
            onChangeText={setReal}
            keyboardType="decimal-pad"
            placeholderTextColor={palette.inkSubtle}
            style={[
              type.figureSm,
              {
                fontFamily: familiaDoPeso(type.figureSm.fontWeight),
                color: palette.ink,
                backgroundColor: palette.surfaceInset,
                borderRadius: radius.md,
                paddingHorizontal: space.sm,
                paddingVertical: 12,
                textAlign: "right",
              },
            ]}
          />

          {diferenca !== 0 ? (
            <View style={{ marginTop: space.md }}>
              <Notice tone="info">
                Entra no extrato de hoje como {entrada ? "receita" : "despesa"} de{" "}
                {money(cents(Math.abs(diferenca)))}, com o nome “Acerto de saldo”. Dá para editar ou
                apagar depois.
              </Notice>
            </View>
          ) : null}

          <View style={{ marginTop: space.md }}>
            <Button
              label={
                diferenca === 0
                  ? "Sem diferença"
                  : `Lançar ${entrada ? "entrada" : "saída"} de ${money(cents(Math.abs(diferenca)))}`
              }
              variant="secondary"
              onPress={() => void acertarSaldo()}
              disabled={acertando || diferenca === 0}
              busy={acertando}
            />
          </View>
        </Card>

        {erro ? <Notice tone="negative">{erro}</Notice> : null}
        {feito ? <Notice tone="positive">{feito}</Notice> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
