/**
 * Registrar ou editar um lançamento.
 *
 * A tela coleta e valida forma; ela não decide nada sobre dinheiro. Quem
 * interpreta "1.234,56" é `parseMoney` do domínio, e quem decide em qual
 * fatura a compra cai é `competenceForPurchase` — as mesmas funções do site.
 * Um `Number(texto.replace(",", "."))` aqui seria a segunda implementação de
 * uma regra que já existe, e a primeira a errar com "1.500".
 *
 * A tela mostra a competência resultante **antes** de salvar. Comprar dia 14
 * num cartão que fecha dia 13 e só descobrir na fatura seguinte é a surpresa
 * que este aplicativo existe para eliminar.
 */

import { useMemo, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { competenceForPurchase } from "@fluxo/core/domain/card/invoice-cycle.ts";
import { scheduleInstallments } from "@fluxo/core/domain/installment/plan.ts";
import type { TransactionKind } from "@fluxo/core/domain/ledger/types.ts";
import { type Cents, parseMoney } from "@fluxo/core/kernel/money.ts";
import { competenceOf } from "@fluxo/core/time/competence.ts";
import { type LocalDate, addDays, isLocalDate, todayIn } from "@fluxo/core/time/local-date.ts";
import { OfflineError } from "../net/client.ts";
import { criarCompraParcelada } from "../net/parcelamento.ts";
import { useLedger } from "../state/ledger.tsx";
import { useConnectedSession } from "../state/session.tsx";
import type { LocalTransaction, TransactionDraft } from "../storage/model.ts";
import { competence as formatCompetence, money } from "../ui/format.ts";
import { Body, Button, Card, Label, Notice, Small , Texto } from "../ui/primitives.tsx";
import { familiaDoPeso } from "../ui/fonts.ts";
import { radius, space, type, usePalette } from "../ui/theme.ts";

/**
 * Os números que se escolhe de fato.
 *
 * O teclado numérico aceitaria qualquer coisa, e a maior parte dos parcelamentos
 * do varejo brasileiro cai nesta lista. Quem precisa de 7× continua podendo
 * lançar pelo site — no telefone, um campo livre custaria mais toque do que
 * resolve.
 */
const OPCOES_DE_PARCELA = [1, 2, 3, 4, 5, 6, 8, 10, 12, 18, 24] as const;

const TIPOS: { readonly value: TransactionKind; readonly label: string }[] = [
  { value: "expense", label: "Despesa" },
  { value: "income", label: "Receita" },
  { value: "transfer", label: "Transferência" },
];

export function LancamentoScreen({
  existing,
  onClose,
}: {
  existing: LocalTransaction | null;
  onClose: () => void;
}) {
  const palette = usePalette();
  const { accounts, cards, categories, create, update, remove, synchronize } = useLedger();
  const { credentials } = useConnectedSession();

  const hoje = todayIn();

  const [kind, setKind] = useState<TransactionKind>(existing?.kind ?? "expense");
  const [descricao, setDescricao] = useState(existing?.description ?? "");
  const [valor, setValor] = useState(existing ? (existing.amount / 100).toFixed(2).replace(".", ",") : "");
  const [data, setData] = useState<string>(existing?.occurredOn ?? hoje);
  const [contaId, setContaId] = useState<string | null>(existing?.accountId ?? accounts[0]?.id ?? null);
  const [cartaoId, setCartaoId] = useState<string | null>(existing?.cardId ?? null);
  const [destinoId, setDestinoId] = useState<string | null>(existing?.destinationAccountId ?? null);
  const [categoriaId, setCategoriaId] = useState<string | null>(existing?.categoryId ?? null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const cartoesDeCredito = useMemo(() => cards.filter((item) => item.kind === "credit"), [cards]);
  const cartoesDeDebito = useMemo(() => cards.filter((item) => item.kind !== "credit"), [cards]);

  /**
   * Débito ou crédito, escolhido antes da conta.
   *
   * Antes a tela punha contas e cartões numa lista só, e a diferença entre
   * pagar no débito e pagar no crédito ficava implícita no nome do item — quem
   * não sabe que "Nubank UV" é cartão de crédito não tem como saber que aquela
   * compra vai para a fatura de outubro em vez de sair do saldo hoje. É a
   * decisão que mais muda o significado do lançamento, e agora ela é explícita,
   * igual ao site.
   */
  const [origem, setOrigem] = useState<"conta" | "credito">(
    existing?.cardId && cards.find((item) => item.id === existing.cardId)?.kind === "credit"
      ? "credito"
      : "conta",
  );
  const [parcelas, setParcelas] = useState(1);

  /*
   * Parcelar só vale ao criar.
   *
   * Transformar um lançamento que já existe num plano de seis parcelas criaria
   * as seis e deixaria a original solta — o endereço de edição do servidor
   * mexe num lançamento, não monta plano. Quem precisa converter refaz: apaga
   * e lança de novo.
   */
  const podeParcelar =
    !existing && kind === "expense" && origem === "credito" && cartoesDeCredito.length > 0;
  const noCartao = kind === "expense" && cartaoId !== null;
  const cartao = useMemo(() => cards.find((item) => item.id === cartaoId) ?? null, [cards, cartaoId]);

  const centavos: Cents | null = useMemo(() => parseMoney(valor), [valor]);
  const dataValida: LocalDate | null = isLocalDate(data) ? data : null;

  // Prévia da competência, calculada pelo domínio — a mesma conta que o
  // servidor vai refazer ao receber.
  const competencia = useMemo(() => {
    if (!dataValida) return null;
    return cartao ? competenceForPurchase(cartao, dataValida) : competenceOf(dataValida);
  }, [cartao, dataValida]);

  /**
   * "12× de R$ 100,00, de out/2026 a set/2027".
   *
   * Sai de `scheduleInstallments`, a mesma função que o servidor chama — a
   * prévia não pode ser uma divisão à parte, senão ela promete um valor e a
   * fatura cobra outro.
   */
  const previaDoParcelamento = useMemo(() => {
    if (!podeParcelar || !cartao || !centavos || centavos <= 0 || !dataValida) return null;
    if (parcelas <= 1) return null;

    const cronograma = scheduleInstallments({
      totalAmount: centavos,
      installmentCount: parcelas,
      purchaseDate: dataValida,
      cycle: cartao,
    });
    const primeira = cronograma[0];
    const ultima = cronograma[cronograma.length - 1];
    if (!primeira || !ultima) return null;

    const valores = new Set(cronograma.map((item) => item.amount));
    const quanto =
      valores.size === 1
        ? `${parcelas}× de ${money(primeira.amount)}`
        : `${parcelas}× de ${money(primeira.amount)} (a última fecha a conta)`;

    return `${quanto}, de ${formatCompetence(primeira.competence)} a ${formatCompetence(ultima.competence)}`;
  }, [podeParcelar, cartao, centavos, dataValida, parcelas]);

  const categoriasVisiveis = categories.filter((categoria) =>
    kind === "income" ? categoria.kind !== "expense" : categoria.kind !== "income",
  );

  async function salvar() {
    if (!centavos || centavos <= 0) {
      setErro("Informe um valor maior que zero.");
      return;
    }
    if (!dataValida) {
      setErro("Informe a data no formato AAAA-MM-DD.");
      return;
    }
    if (!descricao.trim()) {
      setErro("Descreva o lançamento.");
      return;
    }
    if (kind === "transfer" && (!contaId || !destinoId || contaId === destinoId)) {
      setErro("Transferência precisa de contas de origem e destino diferentes.");
      return;
    }
    if (!noCartao && !contaId) {
      setErro("Selecione a conta.");
      return;
    }
    if (podeParcelar && !cartaoId) {
      setErro("Selecione o cartão de crédito.");
      return;
    }

    /*
     * Parcelado é outro caminho, e de propósito.
     *
     * O plano — N parcelas amarradas, cada uma na sua fatura — é montado pelo
     * servidor, pela mesma função que o site chama. Criar as N linhas aqui
     * seria escrever a regra de parcelamento uma segunda vez. Depois de criar,
     * a sincronização traz as parcelas para o razão local.
     */
    if (parcelas > 1 && cartaoId) {
      setSalvando(true);
      setErro(null);
      try {
        await criarCompraParcelada(
          {
            description: descricao.trim(),
            amountCents: centavos,
            occurredOn: dataValida,
            cardId: cartaoId,
            categoryId: categoriaId,
            installmentCount: parcelas,
          },
          credentials,
        );
        await synchronize();
        onClose();
      } catch (problema) {
        setErro(
          problema instanceof OfflineError
            ? "Parcelar precisa de conexão. Sem rede, dá para lançar à vista agora e editar depois."
            : problema instanceof Error
              ? problema.message
              : "Não foi possível registrar a compra parcelada.",
        );
        setSalvando(false);
      }
      return;
    }

    const draft: TransactionDraft = {
      kind,
      description: descricao.trim(),
      amount: centavos,
      occurredOn: dataValida,
      categoryId: categoriaId,
      accountId: noCartao ? null : contaId,
      cardId: noCartao ? cartaoId : null,
      destinationAccountId: kind === "transfer" ? destinoId : null,
      destinationCardId: null,
      competence: null,
      notes: null,
    };

    setSalvando(true);
    setErro(null);
    try {
      if (existing) await update(existing, draft);
      else await create(draft);
      onClose();
    } catch (problema) {
      setErro(problema instanceof Error ? problema.message : "Não foi possível salvar.");
      setSalvando(false);
    }
  }

  async function excluir() {
    if (!existing) return;
    setSalvando(true);
    await remove(existing);
    onClose();
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.canvas }}>
      {/* Puxador da folha: o gesto de arrastar para baixo é o que se tenta
          primeiro num modal de celular, e sem a barrinha ninguém sabe que ele
          existe. */}
      <View style={{ alignItems: "center", paddingTop: space.sm }}>
        <View
          style={{
            width: 36,
            height: 4,
            borderRadius: radius.pill,
            backgroundColor: palette.lineStrong,
          }}
        />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xxl }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Texto style={[type.title, { color: palette.ink }]}>
            {existing ? "Editar lançamento" : "Novo lançamento"}
          </Texto>
          <Pressable onPress={onClose} hitSlop={12}>
            <Texto style={[type.body, { color: palette.inkMuted }]}>Fechar</Texto>
          </Pressable>
        </View>

        {/*
          Tipo primeiro, valor logo abaixo, no mesmo bloco.
          A escolha do tipo muda o significado do número — e de tudo o que vem
          depois —, então precisa vir antes dele, não num cartão separado lá
          embaixo.
        */}
        <View
          style={{
            backgroundColor: palette.surface,
            borderRadius: radius.xl,
            borderWidth: 1,
            borderColor: palette.line,
            padding: space.lg,
            gap: space.md,
          }}
        >
          <Segmentos
            opcoes={TIPOS.map((tipo) => ({ id: tipo.value, label: tipo.label }))}
            selecionado={kind}
            onSelect={(escolha) => {
              setKind(escolha as TransactionKind);
              // Receita e transferência nunca saem de cartão.
              if (escolha !== "expense") setCartaoId(null);
            }}
          />

          <View>
            <Label>Valor</Label>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm }}>
              <Texto
                style={[
                  type.figure,
                  { color: centavos && centavos > 0 ? palette.inkMuted : palette.inkSubtle },
                ]}
              >
                R$
              </Texto>
              <TextInput
                value={valor}
                onChangeText={setValor}
                keyboardType="decimal-pad"
                placeholder="0,00"
                placeholderTextColor={palette.inkSubtle}
                autoFocus={!existing}
                style={[
                  { fontFamily: familiaDoPeso(type.display.fontWeight) },
                  type.display,
                  {
                    flex: 1,
                    color: centavos && centavos > 0
                      ? kind === "income"
                        ? palette.positive
                        : palette.ink
                      : palette.inkSubtle,
                    paddingVertical: space.xs,
                  },
                ]}
              />
            </View>
            {valor.trim() && !centavos ? (
              <Small tone="negative">Valor não reconhecido.</Small>
            ) : null}
          </View>
        </View>

        <Card>
          <Label>Descrição</Label>
          <TextInput
            value={descricao}
            onChangeText={setDescricao}
            placeholder="Mercado, aluguel, salário…"
            placeholderTextColor={palette.inkSubtle}
            maxLength={160}
            style={[
              { fontFamily: familiaDoPeso(type.body.fontWeight) },
              type.body,
              {
                marginTop: space.sm,
                color: palette.ink,
                backgroundColor: palette.surfaceSunken,
                borderRadius: radius.md,
                paddingHorizontal: space.md,
                paddingVertical: 14,
              },
            ]}
          />
        </Card>

        <Card>
          <Label>Quando</Label>

          {/*
            Quase todo lançamento é de hoje ou de ontem. Dois toques resolvem o
            caso comum; digitar a data continua possível para o resto, mas
            deixa de ser o caminho obrigatório — que era pedir `AAAA-MM-DD` no
            teclado do celular.
          */}
          <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.sm }}>
            {[
              { rotulo: "Hoje", valor: hoje },
              { rotulo: "Ontem", valor: addDays(hoje, -1) },
              { rotulo: "Anteontem", valor: addDays(hoje, -2) },
            ].map((atalho) => {
              const ativo = data === atalho.valor;
              return (
                <Pressable
                  key={atalho.rotulo}
                  onPress={() => setData(atalho.valor)}
                  style={{
                    flex: 1,
                    height: 36,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: radius.pill,
                    backgroundColor: ativo ? palette.accentWash : palette.surfaceSunken,
                    borderWidth: 1,
                    borderColor: ativo ? palette.accentEdge : palette.line,
                  }}
                >
                  <Texto
                    style={[
                      type.bodySm,
                      { color: ativo ? palette.accent : palette.inkMuted, fontWeight: ativo ? "600" : "400" },
                    ]}
                  >
                    {atalho.rotulo}
                  </Texto>
                </Pressable>
              );
            })}
          </View>

          <TextInput
            value={data}
            onChangeText={setData}
            placeholder="AAAA-MM-DD"
            placeholderTextColor={palette.inkSubtle}
            keyboardType="numbers-and-punctuation"
            maxLength={10}
            style={[
              { fontFamily: familiaDoPeso(type.body.fontWeight) },
              type.body,
              {
                marginTop: space.sm,
                color: dataValida ? palette.ink : palette.negative,
                backgroundColor: palette.surfaceSunken,
                borderRadius: radius.md,
                paddingHorizontal: space.md,
                paddingVertical: 12,
              },
            ]}
          />

          {competencia ? (
            <View
              style={{
                marginTop: space.sm,
                padding: space.sm + 2,
                borderRadius: radius.md,
                backgroundColor: cartao ? palette.cautionWash : palette.surfaceSunken,
              }}
            >
              <Small tone={cartao ? "caution" : undefined}>
                {cartao
                  ? `Entra na fatura de ${formatCompetence(competencia)}`
                  : `Competência ${formatCompetence(competencia)}`}
              </Small>
            </View>
          ) : null}
        </Card>

        {kind === "expense" ? (
          <Card>
            <Label>Pago com</Label>

            {cartoesDeCredito.length ? (
              <View style={{ marginTop: space.sm }}>
                <Segmentos
                  opcoes={[
                    { id: "conta", label: "Conta / débito" },
                    { id: "credito", label: "Cartão de crédito" },
                  ]}
                  selecionado={origem}
                  onSelect={(escolha) => {
                    const alvo = escolha as "conta" | "credito";
                    setOrigem(alvo);
                    if (alvo === "conta") {
                      setCartaoId(null);
                      setParcelas(1);
                      if (!contaId) setContaId(accounts[0]?.id ?? null);
                    } else {
                      // Uma compra no crédito precisa de um cartão escolhido; o
                      // primeiro é o palpite certo em quem só tem um.
                      setCartaoId((atual) =>
                        atual && cartoesDeCredito.some((item) => item.id === atual)
                          ? atual
                          : (cartoesDeCredito[0]?.id ?? null),
                      );
                    }
                  }}
                />
              </View>
            ) : null}

            <View style={{ marginTop: space.sm }}>
              {origem === "credito" ? (
                <Options
                  options={cartoesDeCredito.map((item) => ({ id: item.id, label: item.name }))}
                  selected={cartaoId}
                  onSelect={setCartaoId}
                />
              ) : (
                <Options
                  options={[
                    ...accounts.map((conta) => ({ id: `conta:${conta.id}`, label: conta.name })),
                    // O cartão de débito fica deste lado, e não do crédito: ele
                    // tira do saldo na hora, que é o que "débito" quer dizer.
                    ...cartoesDeDebito.map((item) => ({ id: `cartao:${item.id}`, label: item.name })),
                  ]}
                  selected={noCartao ? `cartao:${cartaoId}` : contaId ? `conta:${contaId}` : null}
                  onSelect={(escolha) => {
                    const [tipo, id] = escolha.split(":");
                    if (tipo === "cartao") {
                      setCartaoId(id);
                    } else {
                      setCartaoId(null);
                      setContaId(id);
                    }
                  }}
                />
              )}
            </View>
          </Card>
        ) : (
          <Card>
            <Label>{kind === "transfer" ? "Sai de" : "Entra em"}</Label>
            <Options
              options={accounts.map((conta) => ({ id: conta.id, label: conta.name }))}
              selected={contaId}
              onSelect={setContaId}
            />
          </Card>
        )}

        {podeParcelar && cartao ? (
          <Card>
            <Label>Parcelas</Label>
            <View style={{ marginTop: space.sm }}>
              <Options
                options={OPCOES_DE_PARCELA.map((numero) => ({
                  id: String(numero),
                  label: numero === 1 ? "À vista" : `${numero}×`,
                }))}
                selected={String(parcelas)}
                onSelect={(escolha) => setParcelas(Number(escolha))}
              />
            </View>

            {/*
              A prévia sai da **mesma** função que o servidor usa para montar o
              plano. Dividir por N aqui daria um número que não fecha: os
              centavos que sobram têm dono, e quem decide qual parcela fica com
              eles é o domínio.
            */}
            {previaDoParcelamento ? (
              <View
                style={{
                  marginTop: space.sm,
                  padding: space.sm + 2,
                  borderRadius: radius.md,
                  backgroundColor: palette.cautionWash,
                }}
              >
                <Small tone="caution">{previaDoParcelamento}</Small>
              </View>
            ) : null}

            {parcelas > 1 ? (
              <Small tone="muted" style={{ marginTop: space.sm }}>
                Parcelar precisa de conexão: o plano é montado no servidor, com
                a mesma conta do site. Uma compra à vista continua entrando sem
                rede.
              </Small>
            ) : null}
          </Card>
        ) : null}

        {kind === "transfer" ? (
          <Card>
            <Label>Vai para</Label>
            <Options
              options={accounts
                .filter((conta) => conta.id !== contaId)
                .map((conta) => ({ id: conta.id, label: conta.name }))}
              selected={destinoId}
              onSelect={setDestinoId}
            />
          </Card>
        ) : null}

        {kind !== "transfer" ? (
          <Card>
            <Label>Categoria</Label>
            <Options
              options={categoriasVisiveis.map((categoria) => ({ id: categoria.id, label: categoria.name }))}
              selected={categoriaId}
              onSelect={(escolha) => setCategoriaId(escolha === categoriaId ? null : escolha)}
            />
          </Card>
        ) : null}

        {erro ? <Notice tone="negative">{erro}</Notice> : null}

        <Button label={existing ? "Salvar alterações" : "Registrar"} onPress={() => void salvar()} busy={salvando} />

        {existing ? (
          <Button label="Excluir lançamento" variant="danger" onPress={() => void excluir()} disabled={salvando} />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Escolha exclusiva entre três, lado a lado.
 *
 * O tipo do lançamento tem sempre as mesmas três opções e é a decisão que muda
 * todo o resto do formulário — merece um controle que mostre as três de uma
 * vez, e não uma nuvem de pastilhas igual às categorias, que são muitas e
 * variáveis.
 */
function Segmentos({
  opcoes,
  selecionado,
  onSelect,
}: {
  opcoes: readonly { id: string; label: string }[];
  selecionado: string;
  onSelect: (id: string) => void;
}) {
  const palette = usePalette();

  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: palette.surfaceSunken,
        borderRadius: radius.md,
        padding: 3,
        gap: 3,
      }}
    >
      {opcoes.map((opcao) => {
        const ativo = opcao.id === selecionado;
        return (
          <Pressable
            key={opcao.id}
            onPress={() => onSelect(opcao.id)}
            style={{
              flex: 1,
              height: 34,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: radius.sm,
              backgroundColor: ativo ? palette.surface : "transparent",
            }}
          >
            <Texto
              style={[
                type.bodySm,
                { color: ativo ? palette.ink : palette.inkMuted, fontWeight: ativo ? "600" : "400" },
              ]}
            >
              {opcao.label}
            </Texto>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Escolha entre poucas opções. Lista simples vence menu suspenso no celular. */
function Options({
  options,
  selected,
  onSelect,
}: {
  options: readonly { id: string; label: string }[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const palette = usePalette();

  if (!options.length) {
    return <Small style={{ marginTop: space.sm }}>Nada cadastrado. Crie no site primeiro.</Small>;
  }

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.sm }}>
      {options.map((opcao) => {
        const ativo = opcao.id === selected;
        return (
          <Pressable
            key={opcao.id}
            onPress={() => onSelect(opcao.id)}
            style={({ pressed }) => ({
              backgroundColor: ativo ? palette.accentWash : palette.surfaceSunken,
              borderRadius: radius.pill,
              paddingHorizontal: space.md,
              paddingVertical: space.sm,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Body style={{ fontSize: 13, color: ativo ? palette.accent : palette.inkMuted }}>{opcao.label}</Body>
          </Pressable>
        );
      })}
    </View>
  );
}
