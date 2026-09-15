import { useMemo, useState, type ReactNode } from "react";
import { Pressable, RefreshControl, SectionList, TextInput, View } from "react-native";
import { ArrowDown, ArrowUp, Briefcase, Clock, MagnifyingGlass, Receipt } from "phosphor-react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { cents, type Cents } from "@fluxo/core/kernel/money.ts";
import { todayIn } from "@fluxo/core/time/local-date.ts";
import { useLedger } from "../state/ledger.tsx";
import { useConnectedSession } from "../state/session.tsx";
import type { LocalTransaction } from "../storage/model.ts";
import { money, relativeDate } from "../ui/format.ts";
import { IconBubble, ProfileButton } from "../ui/mockup.tsx";
import { Empty, Small, Texto } from "../ui/primitives.tsx";
import { radius, space, type, usePalette } from "../ui/theme.ts";

type Filtro = "tudo" | "entradas" | "saidas" | "previsto";
const FILTROS: readonly { id: Filtro; rotulo: string }[] = [
  { id: "tudo", rotulo: "Tudo" },
  { id: "entradas", rotulo: "Entradas" },
  { id: "saidas", rotulo: "Saídas" },
  { id: "previsto", rotulo: "Previstos" },
];
const COMPETENCIA_CURTA = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });

export function ExtratoScreen({ onOpenTransaction, onAjustes }: { onOpenTransaction: (id: string) => void; onAjustes: () => void }) {
  const palette = usePalette();
  const { credentials } = useConnectedSession();
  const { transactions, categories, sync, synchronize } = useLedger();
  const [filtro, setFiltro] = useState<Filtro>("tudo");
  const [busca, setBusca] = useState("");
  const [buscaVisivel, setBuscaVisivel] = useState(false);
  const competenciaAtual = (todayIn() as string).slice(0, 7);

  const totais = useMemo(() => transactions.filter((item) => item.competence === competenciaAtual).reduce((total, item) => {
    if (item.state === "planned") total.previsto += item.amount;
    else if (item.kind === "income") total.entrada += item.amount;
    else if (item.kind === "expense") total.saida += item.amount;
    return total;
  }, { entrada: 0, saida: 0, previsto: 0 }), [transactions, competenciaAtual]);
  const nomeDaCategoria = useMemo(() => new Map(categories.map((categoria) => [categoria.id, categoria.name])), [categories]);
  const secoes = useMemo(() => {
    const termo = normalizar(busca);
    const visiveis = transactions.filter((item) => {
      if (filtro === "previsto" && item.state !== "planned") return false;
      if (filtro === "entradas" && (item.kind !== "income" || item.state === "planned")) return false;
      if (filtro === "saidas" && (item.kind !== "expense" || item.state === "planned")) return false;
      const categoria = item.categoryId ? nomeDaCategoria.get(item.categoryId) ?? "" : "";
      return !termo || normalizar(`${item.description} ${categoria}`).includes(termo);
    });
    const porDia = new Map<string, LocalTransaction[]>();
    for (const item of visiveis) porDia.set(item.occurredOn as string, [...(porDia.get(item.occurredOn as string) ?? []), item]);
    return [...porDia.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([title, data]) => ({ title, data }));
  }, [transactions, filtro, busca, nomeDaCategoria]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.canvas }} edges={["top"]}>
      <View style={{ paddingHorizontal: 20, paddingTop: 12, gap: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <View style={{ flex: 1 }}><Texto style={[type.title, { color: palette.ink }]}>Extrato</Texto><Small style={{ marginTop: 1 }}>{rotuloCompetencia(competenciaAtual)}</Small></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Buscar lançamentos" onPress={() => { setBuscaVisivel((atual) => !atual); if (buscaVisivel) setBusca(""); }} style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}><MagnifyingGlass size={21} color={palette.inkMuted} /></Pressable>
          <ProfileButton onPress={onAjustes} name={credentials.user.displayName} />
        </View>

        <View style={{ flexDirection: "row", gap: 8 }}>
          <ResumoFluxo label="Entrou" value={money(cents(totais.entrada))} color={palette.positive} icon={<ArrowUp size={12} color={palette.positive} />} />
          <ResumoFluxo label="Saiu" value={money(cents(totais.saida))} color={palette.negative} icon={<ArrowDown size={12} color={palette.negative} />} />
          <ResumoFluxo label="Previsto" value={money(cents(totais.previsto))} color={palette.caution} icon={<Clock size={12} color={palette.caution} />} />
        </View>

        {buscaVisivel ? <TextInput autoFocus value={busca} onChangeText={setBusca} placeholder="Buscar lançamento" placeholderTextColor={palette.inkSubtle} returnKeyType="search" style={{ height: 44, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, color: palette.ink, fontSize: type.body.fontSize }} /> : null}

        <View style={{ flexDirection: "row", gap: 7 }}>
          {FILTROS.map((opcao) => {
            const ativo = filtro === opcao.id;
            return <Pressable key={opcao.id} accessibilityRole="tab" accessibilityState={{ selected: ativo }} onPress={() => setFiltro(opcao.id)} style={({ pressed }) => ({ minHeight: 38, alignItems: "center", justifyContent: "center", paddingHorizontal: 15, borderRadius: radius.pill, backgroundColor: ativo ? palette.accent : palette.surfaceInset, opacity: pressed ? 0.8 : 1 })}><Texto style={[type.caption, { color: ativo ? palette.accentInk : palette.inkSubtle, fontWeight: "600" }]}>{opcao.rotulo}</Texto></Pressable>;
          })}
        </View>
      </View>

      <SectionList
        sections={secoes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: space.xxl * 2 }}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={sync.running} onRefresh={() => void synchronize()} tintColor={palette.accent} />}
        ListEmptyComponent={<Empty title={busca ? "Nada encontrado" : "Nenhum lançamento"} hint={busca ? "Tente outro termo." : "Use o botão de mais para registrar o primeiro."} />}
        renderSectionHeader={({ section }) => <View style={{ paddingTop: 14, paddingBottom: 8 }}><Texto style={[type.label, { color: palette.inkSubtle }]}>{relativeDate(section.title as never)}</Texto></View>}
        renderItem={({ item }) => <Linha transacao={item} categoria={item.categoryId ? nomeDaCategoria.get(item.categoryId) ?? null : null} hoje={todayIn()} onPress={() => onOpenTransaction(item.id)} />}
      />
    </SafeAreaView>
  );
}

function ResumoFluxo({ label, value, color, icon }: { label: string; value: string; color: string; icon: ReactNode }) {
  const palette = usePalette();
  return <View style={{ flex: 1, minHeight: 64, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.surface, paddingHorizontal: 4 }}><View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>{icon}<Texto style={[type.caption, { color }]}>{label}</Texto></View><Texto numberOfLines={1} adjustsFontSizeToFit style={[type.bodyStrong, { color: palette.ink, marginTop: 5 }]}>{value}</Texto></View>;
}

function Linha({ transacao, categoria, hoje, onPress }: { transacao: LocalTransaction; categoria: string | null; hoje: string; onPress: () => void }) {
  const palette = usePalette();
  const entrada = transacao.kind === "income";
  const previsto = transacao.state === "planned";
  const atrasado = previsto && (transacao.occurredOn as string) < hoje;
  return <Pressable onPress={onPress} android_ripple={{ color: palette.accentWash }} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 58, paddingHorizontal: 12, marginBottom: 7, borderRadius: radius.md, backgroundColor: pressed ? palette.surfaceRaised : palette.surface, borderWidth: 1, borderColor: palette.line })}>
    <IconBubble tone={entrada ? "positive" : previsto ? "caution" : "muted"}>{entrada ? <Briefcase size={19} color={palette.positive} weight="fill" /> : <Receipt size={19} color={previsto ? palette.caution : palette.inkMuted} weight="fill" />}</IconBubble>
    <View style={{ flex: 1, minWidth: 0 }}><Texto style={[type.body, { color: palette.ink }]} numberOfLines={1}>{transacao.description}</Texto><Small numberOfLines={1}>{categoria ?? "Sem categoria"}{transacao.installmentNumber ? ` · ${transacao.installmentNumber}ª parcela` : ""}</Small></View>
    <View style={{ alignItems: "flex-end" }}><Texto style={[type.bodyStrong, { color: entrada ? palette.positive : palette.ink }]}>{entrada ? "+" : ""}{money(transacao.amount as Cents)}</Texto>{previsto ? <Small tone={atrasado ? "caution" : "muted"}>{atrasado ? "atrasado" : "previsão"}</Small> : null}</View>
  </Pressable>;
}

function normalizar(valor: string): string { return valor.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim(); }
function rotuloCompetencia(valor: string): string { const [ano, mes] = valor.split("-").map(Number); const texto = COMPETENCIA_CURTA.format(new Date(Date.UTC(ano, mes - 1, 1))); return texto.charAt(0).toUpperCase() + texto.slice(1); }
