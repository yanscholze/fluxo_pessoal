/**
 * A tela inicial, desenhada no Figma e ligada aos números reais.
 *
 * A ordem é a do protótipo, de cima para baixo: quem é você, quanto sobra,
 * quanto saiu no mês, e o que aconteceu. O bloco do "livre para gastar" é o
 * único com aura própria — um brilho radial atrás do número — porque é a
 * pergunta que faz alguém abrir o aplicativo.
 *
 * **Nenhum número é calculado aqui.** A folga, as entradas e as saídas vêm
 * prontas do servidor, pela mesma conta que o site mostra; o extrato recente
 * vem do razão local, que é o que permite abrir o aplicativo sem rede. Duas
 * origens, de propósito: a conta precisa ser a mesma do site, e a lista precisa
 * existir no avião.
 *
 * A terceira aba, Capturas, é a fila de revisão das notificações do banco. Ela
 * é a única lista aqui que **não** é fato consumado: é sugestão esperando um
 * sim. Por isso mostra a confiança da leitura e leva para a tela de capturas,
 * onde se confirma ou descarta — nada entra no razão a partir daqui.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import {
  ArrowRight,
  BellSimple,
  Briefcase,
  CreditCard,
  ForkKnife,
  Lightning,
  MusicNotes,
  ShoppingCart,
  Sparkle,
} from "phosphor-react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { cents, type Cents } from "@fluxo/core/kernel/money.ts";
import { todayIn } from "@fluxo/core/time/local-date.ts";
import type { Tela } from "../shell.tsx";
import { fetchCaptures } from "../net/captures.ts";
import type { CaptureView } from "../net/types.ts";
import { fetchDashboard } from "../net/views.ts";
import { useLedger } from "../state/ledger.tsx";
import { useRemoto } from "../state/remote.tsx";
import { useConnectedSession } from "../state/session.tsx";
import type { LocalTransaction } from "../storage/model.ts";
import { GraficoDeLinha } from "../ui/charts.tsx";
import { money, relativeDate } from "../ui/format.ts";
import { BrilhoRadial } from "../ui/gradientes.tsx";
import { IconBubble, ProfileButton } from "../ui/mockup.tsx";
import { Empty, Small, Texto } from "../ui/primitives.tsx";
import { radius, type, usePalette } from "../ui/theme.ts";

type AbaInicio = "transacoes" | "pendencias" | "capturas";

export function InicioScreen({
  onOpenTransaction,
  onNavigate,
}: {
  onOpenTransaction: (id: string) => void;
  onNavigate: (tela: Tela) => void;
}) {
  const palette = usePalette();
  const { credentials } = useConnectedSession();
  const { transactions, categories, sync, synchronize } = useLedger();
  const painel = useRemoto(fetchDashboard);
  const [aba, setAba] = useState<AbaInicio>("transacoes");

  const dados = painel.dados;
  const hoje = todayIn();
  const nomeCompleto = credentials.user?.displayName?.trim() || "Yan";

  const categorias = useMemo(
    () => new Map(categories.map((categoria) => [categoria.id, categoria.name])),
    [categories],
  );

  const recentes = useMemo(
    () =>
      transactions
        .filter((item) => item.occurredOn <= hoje && item.state === "confirmed")
        .slice(0, 5),
    [transactions, hoje],
  );

  const serieDeGastos = useMemo(() => {
    const despesas = transactions
      .filter(
        (item) =>
          item.kind === "expense" &&
          item.state === "confirmed" &&
          item.competence === dados?.competence,
      )
      .slice(0, 14)
      .reverse()
      .map((item) => item.amount);
    return despesas.length > 1 ? despesas : [0, 0];
  }, [transactions, dados?.competence]);

  const pendencias = dados?.upcoming ?? [];
  const capturas = useCapturas(aba === "capturas");

  /*
   * A primeira renderização pode receber uma resposta antiga do cache durante
   * uma migração. Cada bloco tolera campo ausente e é substituído pelos dados
   * atuais assim que a consulta termina, sem derrubar o aplicativo.
   */
  const livre = separarDinheiro(dados?.freeToSpend?.amountCents ?? null);
  const atualizar = () => {
    void synchronize();
    painel.recarregar();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.canvas }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 36 }}
        refreshControl={
          <RefreshControl
            refreshing={sync.running || painel.carregando}
            onRefresh={atualizar}
            tintColor={palette.accent}
          />
        }
      >
        {/* Cabeçalho */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: 4,
          }}
        >
          <View style={{ flex: 1 }}>
            <Small>{saudacao()},</Small>
            <Texto style={[type.heading, { color: palette.ink, marginTop: 1 }]}>{nomeCompleto}</Texto>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Avisos"
            onPress={() => onNavigate("avisos")}
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.65 : 1,
            })}
          >
            <BellSimple size={22} color={palette.inkSubtle} />
            {pendencias.length > 0 ? (
              <View
                style={{
                  position: "absolute",
                  top: 10,
                  right: 10,
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: palette.accent,
                }}
              />
            ) : null}
          </Pressable>
          <ProfileButton onPress={() => onNavigate("configuracoes")} name={nomeCompleto} />
        </View>

        {/*
          O herói.

          O brilho radial fica **atrás** do número, preso ao topo do bloco, e é
          o único gradiente da tela. No desenho ele é uma elipse a 20% de
          opacidade; aqui é a mesma elipse, desenhada em SVG.
        */}
        <View style={{ paddingHorizontal: 20, paddingVertical: 24, alignItems: "center" }}>
          <BrilhoRadial cor={palette.accent} opacidade={0.2} cx={50} cy={0} raio={70} />
          <Texto
            style={[
              type.label,
              { color: palette.inkSubtle, textTransform: "uppercase", letterSpacing: 1.8 },
            ]}
          >
            Livre para gastar
          </Texto>
          <View style={{ flexDirection: "row", alignItems: "baseline", marginTop: 8 }}>
            <Texto
              style={{
                fontSize: 52,
                lineHeight: 54,
                fontWeight: "700",
                letterSpacing: -2.2,
                color: livre.negativo ? palette.negative : palette.ink,
              }}
            >
              {livre.inteiro}
            </Texto>
            <Texto
              style={{
                fontSize: 30,
                lineHeight: 36,
                fontWeight: "700",
                letterSpacing: -1,
                color: livre.negativo ? palette.negative : palette.accent,
              }}
            >
              {livre.casas}
            </Texto>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "center", gap: 16, marginTop: 16 }}>
            <LegendaFluxo
              label="Entradas"
              value={dados?.monthFlow ? money(cents(dados.monthFlow.incomeCents)) : "—"}
              color={palette.positive}
            />
            <LegendaFluxo
              label="Saídas"
              value={dados?.monthFlow ? money(cents(dados.monthFlow.expenseCents)) : "—"}
              color={palette.negative}
            />
          </View>
        </View>

        {/* Gastos do mês */}
        <View
          style={{
            marginHorizontal: 20,
            backgroundColor: palette.surface,
            borderWidth: 1,
            borderColor: palette.line,
            borderRadius: radius.lg,
            padding: 16,
          }}
        >
          <View
            style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
          >
            <Texto style={[type.bodyStrong, { color: palette.ink }]}>
              Gastos — {mesAtual(dados?.competence)}
            </Texto>
            <View
              style={{
                borderRadius: radius.sm,
                backgroundColor: palette.surfaceInset,
                paddingHorizontal: 8,
                paddingVertical: 4,
              }}
            >
              <Small style={{ color: palette.accent }}>
                −{dados?.monthFlow ? money(cents(dados.monthFlow.expenseCents)) : "—"}
              </Small>
            </View>
          </View>
          <View style={{ marginTop: 12 }}>
            <GraficoDeLinha valores={serieDeGastos} altura={90} />
          </View>
        </View>

        {/* Abas */}
        <View
          style={{
            flexDirection: "row",
            gap: 4,
            marginHorizontal: 20,
            marginTop: 20,
            borderRadius: radius.md,
            backgroundColor: palette.surfaceInset,
            padding: 4,
          }}
        >
          <Segmento
            label="Transações"
            active={aba === "transacoes"}
            onPress={() => setAba("transacoes")}
          />
          <Segmento
            label={`Pendências (${pendencias.length})`}
            active={aba === "pendencias"}
            onPress={() => setAba("pendencias")}
          />
          <Segmento
            label={capturas.total > 0 ? `Capturas (${capturas.total})` : "Capturas"}
            active={aba === "capturas"}
            onPress={() => setAba("capturas")}
          />
        </View>

        <View style={{ paddingHorizontal: 20, marginTop: 12 }}>
          {aba === "transacoes" ? (
            recentes.length ? (
              <View>
                {recentes.map((item) => (
                  <LinhaTransacao
                    key={item.id}
                    item={item}
                    categoria={
                      item.categoryId
                        ? (categorias.get(item.categoryId) ?? "Sem categoria")
                        : "Sem categoria"
                    }
                    onPress={() => onOpenTransaction(item.id)}
                  />
                ))}
              </View>
            ) : (
              <Empty title="Nenhum lançamento" hint="Use o botão de mais para registrar o primeiro." />
            )
          ) : null}

          {aba === "pendencias" ? (
            pendencias.length ? (
              <View style={{ gap: 12 }}>
                {pendencias.slice(0, 5).map((item, indice) => (
                  <View
                    key={`${item.date}-${item.description}-${indice}`}
                    style={{
                      minHeight: 62,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      backgroundColor: palette.surface,
                      borderWidth: 1,
                      borderColor: palette.line,
                      borderRadius: radius.lg,
                      padding: 16,
                    }}
                  >
                    <IconBubble tone={item.kind === "fatura" ? "accent" : "caution"}>
                      {iconePendencia(item.kind, palette)}
                    </IconBubble>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Texto style={[type.body, { color: palette.ink }]} numberOfLines={1}>
                        {item.description}
                      </Texto>
                      <Small tone="caution">{relativeDate(item.date as never)}</Small>
                    </View>
                    <Texto style={[type.bodyStrong, { color: palette.negative }]}>
                      {money(cents(item.amountCents))}
                    </Texto>
                  </View>
                ))}
              </View>
            ) : (
              <Empty title="Tudo em dia" hint="Nenhuma conta prevista para este ciclo." />
            )
          ) : null}

          {aba === "capturas" ? (
            <ListaDeCapturas
              estado={capturas}
              onVerTodas={() => onNavigate("capturas")}
            />
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * A fila de capturas, carregada só quando a aba é aberta.
 *
 * É a única lista da tela que fala com o servidor por conta própria — as
 * capturas vivem lá, compartilhadas com o site, e não no razão local. Carregar
 * junto com o painel gastaria uma volta de rede em toda abertura do aplicativo
 * para uma aba que nem sempre é visitada.
 */
function useCapturas(ativa: boolean) {
  const { credentials } = useConnectedSession();
  const [pendentes, setPendentes] = useState<readonly CaptureView[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [jaBuscou, setJaBuscou] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const dados = await fetchCaptures({
        baseUrl: credentials.baseUrl,
        token: credentials.token,
      });
      setPendentes(dados.pending);
    } catch (problema) {
      setErro(problema instanceof Error ? problema.message : "Não foi possível ler as capturas.");
    } finally {
      setCarregando(false);
      setJaBuscou(true);
    }
  }, [credentials]);

  useEffect(() => {
    if (ativa && !jaBuscou && !carregando) void carregar();
  }, [ativa, jaBuscou, carregando, carregar]);

  return { pendentes, carregando, erro, jaBuscou, total: pendentes.length, recarregar: carregar };
}

function ListaDeCapturas({
  estado,
  onVerTodas,
}: {
  estado: ReturnType<typeof useCapturas>;
  onVerTodas: () => void;
}) {
  const palette = usePalette();

  if (estado.carregando && !estado.jaBuscou) {
    return <Empty title="Lendo as capturas" hint="Buscando a fila de revisão no servidor." />;
  }

  if (estado.erro) {
    return <Empty title="Não deu para ler as capturas" hint={estado.erro} />;
  }

  if (estado.pendentes.length === 0) {
    return (
      <Empty
        title="Nada esperando revisão"
        hint="As notificações de compra que o Fluxo entender aparecem aqui antes de virar lançamento."
      />
    );
  }

  return (
    <View style={{ gap: 12 }}>
      {estado.pendentes.slice(0, 5).map((captura) => (
        <View
          key={captura.id}
          style={{
            minHeight: 62,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            backgroundColor: palette.surface,
            borderWidth: 1,
            borderColor: palette.line,
            borderRadius: radius.lg,
            padding: 16,
          }}
        >
          <IconBubble tone="accent">
            <Sparkle size={19} color={palette.accent} weight="fill" />
          </IconBubble>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Texto style={[type.body, { color: palette.ink }]} numberOfLines={1}>
              {captura.merchant || captura.description}
            </Texto>
            <Small numberOfLines={1}>
              {captura.sourceLabel || captura.sourceApp} · {relativeDate(captura.occurredOn as never)}
            </Small>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Texto style={[type.bodyStrong, { color: palette.ink }]}>
              {money(cents(captura.amountCents))}
            </Texto>
            {/*
              A confiança aparece porque esta linha é palpite, não fato. Sem
              ela, a lista de sugestões se parece com a de lançamentos — e a
              semelhança é justamente o que faz alguém confirmar no reflexo.
            */}
            <Small tone={captura.confidencePercent >= 80 ? "positive" : "caution"}>
              {captura.confidencePercent}% de certeza
            </Small>
          </View>
        </View>
      ))}

      <Pressable
        accessibilityRole="button"
        onPress={onVerTodas}
        style={({ pressed }) => ({
          minHeight: 48,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: palette.line,
          backgroundColor: pressed ? palette.surfaceRaised : "transparent",
        })}
      >
        <Texto style={[type.bodySm, { color: palette.accent, fontWeight: "600" }]}>
          {estado.pendentes.length > 5
            ? `Mais ${estado.pendentes.length - 5} — revisar todas`
            : "Revisar todas"}
        </Texto>
        <ArrowRight size={15} color={palette.accent} weight="bold" />
      </Pressable>
    </View>
  );
}

function Segmento({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 36,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 4,
        borderRadius: radius.sm,
        backgroundColor: active ? palette.accent : "transparent",
        opacity: pressed ? 0.78 : 1,
      })}
    >
      <Texto
        numberOfLines={1}
        style={[
          type.caption,
          { color: active ? palette.accentInk : palette.inkSubtle, fontWeight: "600" },
        ]}
      >
        {label}
      </Texto>
    </Pressable>
  );
}

function LegendaFluxo({ label, value, color }: { label: string; value: string; color: string }) {
  const palette = usePalette();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Small style={{ color: palette.inkSubtle }}>
        {label} {valorCompacto(value)}
      </Small>
    </View>
  );
}

function LinhaTransacao({
  item,
  categoria,
  onPress,
}: {
  item: LocalTransaction;
  categoria: string;
  onPress: () => void;
}) {
  const palette = usePalette();
  const entrada = item.kind === "income";
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: palette.accentWash }}
      style={({ pressed }) => ({
        minHeight: 58,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 6,
        opacity: pressed ? 0.72 : 1,
      })}
    >
      <IconBubble tone={entrada ? "positive" : "muted"}>{iconeTransacao(item, palette)}</IconBubble>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Texto style={[type.body, { color: palette.ink }]} numberOfLines={1}>
          {item.description}
        </Texto>
        <Small numberOfLines={1}>
          {relativeDate(item.occurredOn)} · {categoria}
        </Small>
      </View>
      <Texto style={[type.bodyStrong, { color: entrada ? palette.positive : palette.ink }]}>
        {entrada ? "+" : ""}
        {money(item.amount as Cents)}
      </Texto>
    </Pressable>
  );
}

function iconeTransacao(item: LocalTransaction, palette: ReturnType<typeof usePalette>) {
  const props = {
    size: 19,
    color: item.kind === "income" ? palette.positive : palette.inkMuted,
    weight: "fill" as const,
  };
  const texto = item.description.toLowerCase();
  if (texto.includes("mercado")) return <ShoppingCart {...props} />;
  if (texto.includes("spotify") || texto.includes("música")) return <MusicNotes {...props} />;
  if (texto.includes("ifood") || texto.includes("comida")) return <ForkKnife {...props} />;
  return <Briefcase {...props} />;
}

function iconePendencia(kind: string, palette: ReturnType<typeof usePalette>) {
  if (kind === "fatura") return <CreditCard size={19} color={palette.accent} weight="fill" />;
  return <Lightning size={19} color={palette.caution} weight="fill" />;
}

/**
 * Parte o valor no separador decimal.
 *
 * O desenho pinta os centavos na cor de destaque e num corpo menor — o número
 * cheio em 52px ocuparia a largura da tela, e os centavos são a parte que menos
 * importa para a decisão de gastar.
 */
function separarDinheiro(valor: number | null): {
  inteiro: string;
  casas: string;
  negativo: boolean;
} {
  if (valor === null) return { inteiro: "R$ —", casas: "", negativo: false };
  const formatado = money(cents(valor));
  const indice = formatado.lastIndexOf(",");
  return indice >= 0
    ? { inteiro: formatado.slice(0, indice), casas: formatado.slice(indice), negativo: valor < 0 }
    : { inteiro: formatado, casas: "", negativo: valor < 0 };
}

/** "Bom dia" às oito da noite é o tipo de detalhe que denuncia protótipo. */
function saudacao(): string {
  const hora = Number(
    new Intl.DateTimeFormat("pt-BR", {
      hour: "numeric",
      hour12: false,
      timeZone: "America/Sao_Paulo",
    }).format(new Date()),
  );
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}

function mesAtual(competencia?: string): string {
  if (!competencia) return "Mês atual";
  const [ano, mes] = competencia.split("-").map(Number);
  const nome = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(ano, mes - 1, 1)),
  );
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

function valorCompacto(valor: string): string {
  return valor.replace(/,00$/, "").replace(/^R\$\s*/, "R$ ");
}
