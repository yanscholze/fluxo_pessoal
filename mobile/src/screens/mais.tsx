import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  BellSimple, CaretRight, ChartBar, CirclesFour, GearSix, Robot,
  SuitcaseRolling, Wallet,
} from "phosphor-react-native";

import type { Tela } from "../shell.tsx";
import { Body, Card, Label, Small, Texto } from "../ui/primitives.tsx";
import { space, type, usePalette } from "../ui/theme.ts";

const DESTINOS: readonly { label: string; detail: string; tela: Tela; icon: typeof Robot }[] = [
  { label: "TARS", detail: "Seu panorama financeiro", tela: "assistente", icon: Robot },
  { label: "Contas", detail: "Saldos e movimentações", tela: "contas", icon: Wallet },
  { label: "Compromissos", detail: "Recorrências e assinaturas", tela: "recorrencias", icon: CirclesFour },
  { label: "Orçamentos", detail: "Limites e categorias", tela: "orcamentos", icon: ChartBar },
  { label: "Visão geral", detail: "Patrimônio, metas e investimentos", tela: "patrimonio", icon: ChartBar },
  { label: "Viagens", detail: "Planos de viagem", tela: "viagens", icon: SuitcaseRolling },
  { label: "Projetos", detail: "Trabalho e entregas", tela: "trabalho", icon: CirclesFour },
  { label: "Relatórios", detail: "Análises financeiras", tela: "relatorios", icon: ChartBar },
  { label: "Automações e importações", detail: "Capturas e arquivos", tela: "automacoes", icon: Robot },
  { label: "Avisos", detail: "Pendências e notificações", tela: "avisos", icon: BellSimple },
];

export function MaisScreen({ onNavigate }: { onNavigate: (tela: Tela) => void }) {
  const palette = usePalette();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.canvas }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 40, gap: 18 }}>
        <View><Texto style={[type.title, { color: palette.ink }]}>Mais</Texto><Small>Acesse outras áreas do Fluxo.</Small></View>
        <Card style={{ padding: 0, overflow: "hidden" }}>
          {DESTINOS.map(({ label, detail, tela, icon: Icone }, i) => (
            <Pressable key={tela} accessibilityRole="button" accessibilityLabel={label} onPress={() => onNavigate(tela)} style={({ pressed }) => ({ minHeight: 64, flexDirection: "row", alignItems: "center", gap: 13, marginHorizontal: 16, borderBottomWidth: i === DESTINOS.length - 1 ? 0 : 1, borderColor: palette.line, opacity: pressed ? .65 : 1 })}>
              <View style={{ width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: palette.accentWash }}><Icone size={20} color={palette.accent} /></View>
              <View style={{ flex: 1 }}><Body strong>{label}</Body><Small>{detail}</Small></View>
              <CaretRight size={16} color={palette.inkSubtle} />
            </Pressable>
          ))}
        </Card>
        <Label style={{ marginLeft: 3 }}>Aplicativo</Label>
        <Pressable accessibilityRole="button" onPress={() => onNavigate("configuracoes")} style={({ pressed }) => ({ minHeight: 60, flexDirection: "row", alignItems: "center", gap: 13, paddingHorizontal: space.lg, borderWidth: 1, borderColor: palette.line, borderRadius: 18, backgroundColor: palette.surface, opacity: pressed ? .65 : 1 })}>
          <GearSix size={20} color={palette.accent} /><Body strong style={{ flex: 1 }}>Configurações</Body><CaretRight size={16} color={palette.inkSubtle} />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
