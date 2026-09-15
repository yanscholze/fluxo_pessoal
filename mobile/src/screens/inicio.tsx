import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { BellSimple, Briefcase, CreditCard, ForkKnife, Lightning, MusicNotes, ShoppingCart } from "phosphor-react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { cents, type Cents } from "@fluxo/core/kernel/money.ts";
import { todayIn } from "@fluxo/core/time/local-date.ts";
import type { Tela } from "../shell.tsx";
import { fetchDashboard } from "../net/views.ts";
import { useLedger } from "../state/ledger.tsx";
import { useRemoto } from "../state/remote.tsx";
import { useConnectedSession } from "../state/session.tsx";
import type { LocalTransaction } from "../storage/model.ts";
import { GraficoDeLinha } from "../ui/charts.tsx";
import { money, relativeDate } from "../ui/format.ts";
import { IconBubble, ProfileButton } from "../ui/mockup.tsx";
import { Empty, Small, Texto } from "../ui/primitives.tsx";
import { radius, type, usePalette } from "../ui/theme.ts";

type AbaInicio = "transacoes" | "pendencias";

export function InicioScreen({ onOpenTransaction, onNavigate }: { onOpenTransaction: (id: string) => void; onNavigate: (tela: Tela) => void }) {
  const palette = usePalette();
  const { credentials } = useConnectedSession();
  const { transactions, categories, sync, synchronize } = useLedger();
  const painel = useRemoto(fetchDashboard);
  const [aba, setAba] = useState<AbaInicio>("transacoes");
  const dados = painel.dados;
  const hoje = todayIn();
  const nomeCompleto = credentials.user?.displayName?.trim() || "Yan";
  const categorias = useMemo(() => new Map(categories.map((categoria) => [categoria.id, categoria.name])), [categories]);
  const recentes = useMemo(() => transactions.filter((item) => item.occurredOn <= hoje && item.state === "confirmed").slice(0, 5), [transactions, hoje]);
  const serieDeGastos = useMemo(() => {
    const despesas = transactions.filter((item) => item.kind === "expense" && item.state === "confirmed" && item.competence === dados?.competence).slice(0, 14).reverse().map((item) => item.amount);
    return despesas.length > 1 ? despesas : [0, 0];
  }, [transactions, dados?.competence]);
  const pendencias = dados?.upcoming ?? [];
  // A primeira renderização pode receber uma resposta antiga do cache durante
  // a migração. Cada bloco tolera campos ausentes e é substituído pelos dados
  // atuais assim que a consulta termina, sem derrubar o aplicativo.
  const livre = separarDinheiro(dados?.freeToSpend?.amountCents ?? null);
  const atualizar = () => { void synchronize(); painel.recarregar(); };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.canvas }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 36, gap: 16 }} refreshControl={<RefreshControl refreshing={sync.running || painel.carregando} onRefresh={atualizar} tintColor={palette.accent} />}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1 }}><Small>Bom dia,</Small><Texto style={[type.heading, { color: palette.ink, marginTop: 1 }]}>{nomeCompleto}</Texto></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Pendências" onPress={() => onNavigate("avisos")} style={({ pressed }) => ({ width: 48, height: 48, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.65 : 1 })}>
            <BellSimple size={22} color={palette.inkMuted} />
            {pendencias.length > 0 ? <View style={{ position: "absolute", top: 9, right: 9, width: 7, height: 7, borderRadius: 4, backgroundColor: palette.accent }} /> : null}
          </Pressable>
          <ProfileButton onPress={() => onNavigate("configuracoes")} name={nomeCompleto} />
        </View>

        <View style={{ alignItems: "center", paddingTop: 20, paddingBottom: 4 }}>
          <Texto style={[type.label, { color: palette.inkSubtle, textTransform: "uppercase", letterSpacing: 1.7 }]}>Livre para gastar</Texto>
          <View style={{ flexDirection: "row", alignItems: "baseline", marginTop: 5 }}>
            <Texto style={[type.display, { color: livre.negativo ? palette.negative : palette.ink }]}>{livre.inteiro}</Texto>
            <Texto style={{ color: livre.negativo ? palette.negative : palette.accent, fontSize: 28, lineHeight: 34, fontWeight: "700", letterSpacing: -1 }}>{livre.casas}</Texto>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "center", gap: 18, marginTop: 10 }}>
            <LegendaFluxo label="Entradas" value={dados?.monthFlow ? money(cents(dados.monthFlow.incomeCents)) : "—"} color={palette.positive} />
            <LegendaFluxo label="Saídas" value={dados?.monthFlow ? money(cents(dados.monthFlow.expenseCents)) : "—"} color={palette.negative} />
          </View>
        </View>

        <View style={{ backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, borderRadius: radius.lg, padding: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Texto style={[type.bodyStrong, { color: palette.ink }]}>Gastos — {mesAtual(dados?.competence)}</Texto>
            <View style={{ borderRadius: radius.pill, backgroundColor: palette.accentWash, paddingHorizontal: 9, paddingVertical: 4 }}><Small style={{ color: palette.accent }}>−{dados?.monthFlow ? money(cents(dados.monthFlow.expenseCents)) : "—"}</Small></View>
          </View>
          <View style={{ marginTop: 8 }}><GraficoDeLinha valores={serieDeGastos} altura={106} /></View>
        </View>

        <View style={{ flexDirection: "row", borderRadius: radius.md, backgroundColor: palette.surfaceInset, padding: 3 }}>
          <Segmento label="Transações" active={aba === "transacoes"} onPress={() => setAba("transacoes")} />
          <Segmento label={`Pendências (${pendencias.length})`} active={aba === "pendencias"} onPress={() => setAba("pendencias")} />
        </View>

        {aba === "transacoes" ? (
          recentes.length ? <View>{recentes.map((item) => <LinhaTransacao key={item.id} item={item} categoria={item.categoryId ? categorias.get(item.categoryId) ?? "Sem categoria" : "Sem categoria"} onPress={() => onOpenTransaction(item.id)} />)}</View> : <Empty title="Nenhum lançamento" hint="Use o botão de mais para registrar o primeiro." />
        ) : (
          pendencias.length ? <View style={{ gap: 8 }}>{pendencias.slice(0, 5).map((item, indice) => (
            <View key={`${item.date}-${item.description}-${indice}`} style={{ minHeight: 62, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, borderRadius: radius.md, paddingHorizontal: 12 }}>
              <IconBubble tone={item.kind === "fatura" ? "accent" : "caution"}>{iconePendencia(item.kind, palette)}</IconBubble>
              <View style={{ flex: 1, minWidth: 0 }}><Texto style={[type.body, { color: palette.ink }]} numberOfLines={1}>{item.description}</Texto><Small tone="caution">{relativeDate(item.date as never)}</Small></View>
              <Texto style={[type.bodyStrong, { color: palette.negative }]}>{money(cents(item.amountCents))}</Texto>
            </View>
          ))}</View> : <Empty title="Tudo em dia" hint="Nenhuma pendência prevista para este ciclo." />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Segmento({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const palette = usePalette();
  return <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={onPress} style={({ pressed }) => ({ flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: 9, backgroundColor: active ? palette.accent : "transparent", opacity: pressed ? 0.78 : 1 })}><Texto style={[type.bodySm, { color: active ? palette.accentInk : palette.inkSubtle, fontWeight: "600" }]}>{label}</Texto></Pressable>;
}

function LegendaFluxo({ label, value, color }: { label: string; value: string; color: string }) {
  const palette = usePalette();
  return <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}><View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} /><Small style={{ color: palette.inkSubtle }}>{label} {valorCompacto(value)}</Small></View>;
}

function LinhaTransacao({ item, categoria, onPress }: { item: LocalTransaction; categoria: string; onPress: () => void }) {
  const palette = usePalette();
  const entrada = item.kind === "income";
  return <Pressable onPress={onPress} android_ripple={{ color: palette.accentWash }} style={({ pressed }) => ({ minHeight: 58, flexDirection: "row", alignItems: "center", gap: 12, opacity: pressed ? 0.72 : 1 })}>
    <IconBubble tone={entrada ? "positive" : "muted"}>{iconeTransacao(item, palette)}</IconBubble>
    <View style={{ flex: 1, minWidth: 0 }}><Texto style={[type.body, { color: palette.ink }]} numberOfLines={1}>{item.description}</Texto><Small numberOfLines={1}>{relativeDate(item.occurredOn)} · {categoria}</Small></View>
    <Texto style={[type.bodyStrong, { color: entrada ? palette.positive : palette.ink }]}>{entrada ? "+" : ""}{money(item.amount as Cents)}</Texto>
  </Pressable>;
}

function iconeTransacao(item: LocalTransaction, palette: ReturnType<typeof usePalette>) {
  const props = { size: 19, color: item.kind === "income" ? palette.positive : palette.inkMuted, weight: "fill" as const };
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

function separarDinheiro(valor: number | null): { inteiro: string; casas: string; negativo: boolean } {
  if (valor === null) return { inteiro: "R$ —", casas: "", negativo: false };
  const formatado = money(cents(valor));
  const indice = formatado.lastIndexOf(",");
  return indice >= 0 ? { inteiro: formatado.slice(0, indice), casas: formatado.slice(indice), negativo: valor < 0 } : { inteiro: formatado, casas: "", negativo: valor < 0 };
}

function mesAtual(competencia?: string): string {
  if (!competencia) return "Mês atual";
  const [ano, mes] = competencia.split("-").map(Number);
  const nome = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(ano, mes - 1, 1)));
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

function valorCompacto(valor: string): string { return valor.replace(/,00$/, "").replace(/^R\$\s*/, "R$ "); }
