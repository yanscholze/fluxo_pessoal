import type { ReactNode } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import {
  CalendarDots,
  CaretRight,
  ChartLine,
  CreditCard,
  GearSix,
  ListNumbers,
  Robot,
  Target,
  Tray,
  Wallet,
} from "phosphor-react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { cents, type Cents } from "@fluxo/core/kernel/money.ts";
import { todayIn } from "@fluxo/core/time/local-date.ts";
import type { Tela } from "../shell.tsx";
import { fetchDashboard, fetchProjetos } from "../net/views.ts";
import { useLedger } from "../state/ledger.tsx";
import { useRemoto } from "../state/remote.tsx";
import { useConnectedSession } from "../state/session.tsx";
import { money, relativeDate } from "../ui/format.ts";
import { Card, Empty, Label, Notice, Small, Texto } from "../ui/primitives.tsx";
import { radius, space, type, usePalette } from "../ui/theme.ts";

const DATA_LONGA = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

export function InicioScreen({
  onOpenTransaction,
  onNavigate,
}: {
  onOpenTransaction: (id: string) => void;
  onNavigate: (tela: Tela) => void;
}) {
  const palette = usePalette();
  const { credentials } = useConnectedSession();
  const { transactions, sync, synchronize } = useLedger();
  const painel = useRemoto(fetchDashboard);
  const projetos = useRemoto(fetchProjetos);
  const dados = painel.dados;
  const hoje = todayIn();
  const recentes = transactions.filter((item) => item.occurredOn <= hoje).slice(0, 4);
  const nome = credentials.user.displayName.split(" ")[0];
  const comprometido = dados
    ? dados.freeToSpend.openInvoicesCents + dados.freeToSpend.otherCommitmentsCents
    : 0;

  const atualizar = () => {
    void synchronize();
    painel.recarregar();
    projetos.recarregar();
  };

  const atalho = (label: string, tela: Tela, icon: ReactNode) => ({ label, tela, icon });
  const atalhos = [
    atalho("TARS", "assistente", <Robot size={17} color={palette.accent} />),
    atalho("Capturas", "capturas", <Tray size={17} color={palette.accent} />),
    atalho("Cartões", "cartoes", <CreditCard size={17} color={palette.accent} />),
    atalho("Parcelamentos", "parcelamentos", <ListNumbers size={17} color={palette.accent} />),
    atalho("Orçamento", "orcamentos", <Target size={17} color={palette.accent} />),
    atalho("Recorrências", "recorrencias", <CalendarDots size={17} color={palette.accent} />),
    atalho("Visão geral", "patrimonio", <Wallet size={17} color={palette.accent} />),
    atalho("Relatórios", "relatorios", <ChartLine size={17} color={palette.accent} />),
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.canvas }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 17, paddingTop: 17, gap: 17, paddingBottom: 34 }}
        refreshControl={<RefreshControl refreshing={sync.running || painel.carregando} onRefresh={atualizar} tintColor={palette.accent} />}
      >
        <View style={{ position: "absolute", left: -180, top: -210, width: 420, height: 420, borderRadius: 210, backgroundColor: palette.accentWash, opacity: 0.62 }} />

        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 11 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Texto style={[type.label, { color: palette.accent, letterSpacing: 1.65 }]}>
              {dataLonga(dados?.today ?? hoje).toUpperCase()}
            </Texto>
            <Texto style={[type.title, { color: palette.ink, marginTop: 6 }]}>Olá, {nome}</Texto>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ajustes"
            onPress={() => onNavigate("configuracoes")}
            style={({ pressed }) => ({ width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? palette.surfaceRaised : palette.surface })}
          >
            <GearSix size={19} color={palette.inkMuted} />
            {sync.unresolved > 0 ? <View style={{ position: "absolute", top: 6, right: 6, width: 6, height: 6, borderRadius: 3, backgroundColor: palette.accent }} /> : null}
          </Pressable>
        </View>

        <View>
          <Texto style={[type.label, { color: palette.inkSubtle }]}>LIVRE PARA GASTAR</Texto>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 8, paddingBottom: 11, borderBottomWidth: 1, borderBottomColor: palette.accent }}>
            <Texto style={{ fontSize: 18, lineHeight: 20, fontWeight: "500", color: palette.inkSubtle }}>R$</Texto>
            <Texto style={[type.display, { color: dados && dados.freeToSpend.amountCents < 0 ? palette.negative : palette.ink }]}>
              {dados ? numero(money(cents(dados.freeToSpend.amountCents))) : "—"}
            </Texto>
          </View>
          <Small style={{ marginTop: 11, lineHeight: 19 }}>
            {dados
              ? `Medido no dia mais apertado até ${relativeDate(dados.freeToSpend.windowEnd as never)}${dados.freeToSpend.pendingIncomeCents > 0 ? ` · ${money(cents(dados.freeToSpend.pendingIncomeCents))} a receber no período.` : "."}`
              : "Carregando a posição financeira do ciclo."}
          </Small>
          <View style={{ flexDirection: "row", gap: 17, marginTop: 17 }}>
            <MetricaSecundaria label="Em conta" value={dados ? numero(money(cents(dados.freeToSpend.liquidBalanceCents))) : "—"} />
            <MetricaSecundaria label="Comprometido" value={dados ? numero(money(cents(comprometido))) : "—"} muted />
          </View>
          {dados?.benefitFreeToSpend ? (
            <Small style={{ marginTop: 9 }}>Inclui {money(cents(dados.benefitFreeToSpend.amountCents))} em vale-alimentação.</Small>
          ) : null}
        </View>

        {sync.offline || painel.offline ? <Notice tone="caution">Sem conexão. Novos lançamentos ficam salvos no aparelho até a rede voltar.</Notice> : null}
        {sync.pending > 0 ? <Notice tone="info">{sync.pending} lançamento{sync.pending === 1 ? "" : "s"} aguardando envio.</Notice> : null}
        {sync.unresolved > 0 ? <Notice tone="negative">{sync.unresolved} alteração{sync.unresolved === 1 ? " precisa" : " precisam"} da sua decisão.</Notice> : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 17 }}>
          {atalhos.map((item) => (
            <Pressable
              key={item.label}
              accessibilityRole="button"
              onPress={() => onNavigate(item.tela)}
              style={({ pressed }) => ({ minHeight: 40, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 13, borderRadius: radius.md, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.surface, opacity: pressed ? 0.65 : 1 })}
            >
              {item.icon}
              <Texto style={[type.bodySm, { color: palette.ink }]}>{item.label}</Texto>
            </Pressable>
          ))}
        </ScrollView>

        {dados && (dados.upcoming.length > 0 || dados.openTasks.length > 0) ? (
          <Card>
            <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
              <Label>Agenda do ciclo</Label>
              <Small>{dados.upcoming.length + dados.openTasks.length} itens</Small>
            </View>
            <View style={{ marginTop: 8 }}>
              {dados.upcoming.slice(0, 3).map((item) => (
                <LinhaAgenda key={`${item.date}-${item.description}`} titulo={item.description} meta={`${relativeDate(item.date as never)} · ${money(cents(item.amountCents))}`} icon={<CalendarDots size={18} color={palette.accent} />} />
              ))}
              {dados.openTasks.slice(0, Math.max(0, 4 - dados.upcoming.slice(0, 3).length)).map((item) => (
                <LinhaAgenda key={item.id} titulo={item.title} meta={`${item.projectName} · ${item.dueOn ? relativeDate(item.dueOn as never) : "sem prazo"}`} icon={<Target size={18} color={palette.inkSubtle} />} />
              ))}
            </View>
          </Card>
        ) : null}

        {projetos.dados?.projects.length ? (
          <Card>
            <CabecalhoDeCard titulo="Projetos ativos" acao="Ver todos" onPress={() => onNavigate("trabalho")} />
            <View style={{ marginTop: 8 }}>
              {projetos.dados.projects.slice(0, 2).map((projeto) => (
                <Pressable key={projeto.id} onPress={() => onNavigate("trabalho")} style={({ pressed }) => ({ paddingVertical: 11, borderTopWidth: 1, borderTopColor: palette.line, opacity: pressed ? 0.62 : 1 })}>
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
                    <Texto style={[type.body, { color: palette.ink, flex: 1 }]} numberOfLines={1}>{projeto.name}</Texto>
                    <Texto style={[type.bodySm, { color: palette.accent, fontWeight: "500" }]}>{Math.round(projeto.percentReceived)}%</Texto>
                  </View>
                  <View style={{ height: 2, backgroundColor: palette.line, marginTop: 8 }}>
                    <View style={{ height: 2, width: `${Math.min(100, Math.max(0, projeto.percentReceived))}%`, backgroundColor: palette.accent }} />
                  </View>
                  <Small style={{ marginTop: 8 }}>{projeto.openTasks} pendência{projeto.openTasks === 1 ? "" : "s"}{projeto.dueOn ? ` · prazo ${relativeDate(projeto.dueOn as never)}` : ""}</Small>
                </Pressable>
              ))}
            </View>
          </Card>
        ) : null}

        <Card>
          <CabecalhoDeCard titulo="Últimos lançamentos" acao="Ver extrato" onPress={() => onNavigate("lancamentos")} />
          {recentes.length ? (
            <View style={{ marginTop: 8 }}>
              {recentes.map((item) => <LinhaLancamento key={item.id} descricao={item.description} quando={relativeDate(item.occurredOn)} valor={item.amount} entrada={item.kind === "income"} previsto={item.state === "planned"} onPress={() => onOpenTransaction(item.id)} />)}
            </View>
          ) : <Empty title="Nenhum lançamento ainda" hint="Use o botão central para registrar o primeiro." />}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function MetricaSecundaria({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  const palette = usePalette();
  return (
    <View style={{ flex: 1, paddingLeft: 11, borderLeftWidth: 1, borderLeftColor: palette.line }}>
      <Small>{label}</Small>
      <Texto style={[type.figureSm, { color: muted ? palette.inkMuted : palette.ink, marginTop: 3 }]}>{value}</Texto>
    </View>
  );
}

function CabecalhoDeCard({ titulo, acao, onPress }: { titulo: string; acao: string; onPress: () => void }) {
  const palette = usePalette();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <Label>{titulo}</Label>
      <Pressable onPress={onPress} hitSlop={10} style={{ minHeight: 32, flexDirection: "row", alignItems: "center", gap: 3 }}>
        <Small tone="muted">{acao}</Small><CaretRight size={13} color={palette.inkSubtle} />
      </Pressable>
    </View>
  );
}

function LinhaAgenda({ titulo, meta, icon }: { titulo: string; meta: string; icon: ReactNode }) {
  const palette = usePalette();
  return (
    <View style={{ minHeight: 50, flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 10, borderTopWidth: 1, borderTopColor: palette.line }}>
      {icon}<View style={{ flex: 1, minWidth: 0 }}><Texto style={[type.body, { color: palette.ink }]} numberOfLines={1}>{titulo}</Texto><Small numberOfLines={1}>{meta}</Small></View>
    </View>
  );
}

function LinhaLancamento({ descricao, quando, valor, entrada, previsto, onPress }: { descricao: string; quando: string; valor: Cents; entrada: boolean; previsto: boolean; onPress: () => void }) {
  const palette = usePalette();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 10, borderTopWidth: 1, borderTopColor: palette.line, opacity: pressed ? 0.62 : 1 })}>
      <View style={{ flex: 1, minWidth: 0 }}><Texto style={[type.body, { color: previsto ? palette.inkMuted : palette.ink }]} numberOfLines={1}>{descricao}</Texto><Small>{quando}{previsto ? " · previsto" : ""}</Small></View>
      <Texto style={[type.body, { color: entrada ? palette.accent : palette.inkMuted, fontWeight: "500" }]}>{entrada ? "+ " : "− "}{numero(money(valor))}</Texto>
    </Pressable>
  );
}

function numero(valor: string): string {
  return valor.replace(/^R\$\s*/, "");
}

function dataLonga(data: string): string {
  return DATA_LONGA.format(new Date(`${data}T12:00:00Z`));
}
