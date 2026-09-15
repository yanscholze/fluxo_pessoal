import { useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { Briefcase, CreditCard, House, Plus, Receipt } from "phosphor-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AjustesScreen } from "./screens/ajustes.tsx";
import { AssinaturasScreen } from "./screens/assinaturas.tsx";
import { AssistenteScreen } from "./screens/assistente.tsx";
import { AvisosScreen } from "./screens/avisos.tsx";
import { CapturasScreen } from "./screens/capturas.tsx";
import { CarteiraScreen } from "./screens/carteira.tsx";
import { ExtratoScreen } from "./screens/extrato.tsx";
import { ImportarScreen } from "./screens/importar.tsx";
import { InicioScreen } from "./screens/inicio.tsx";
import { LancamentoScreen } from "./screens/lancamento.tsx";
import {
  AutomacoesScreen,
  ContasScreen,
  InvestimentosScreen,
  MetasScreen,
  RecompensasScreen,
  ViagensScreen,
} from "./screens/listas.tsx";
import { OrcamentosScreen } from "./screens/orcamentos.tsx";
import { ParcelamentosScreen } from "./screens/parcelamentos.tsx";
import { PatrimonioScreen } from "./screens/patrimonio.tsx";
import { PlanejamentoScreen } from "./screens/planejamento.tsx";
import { RelatoriosScreen } from "./screens/relatorios.tsx";
import { SaudeScreen } from "./screens/saude.tsx";
import { TrabalhoScreen } from "./screens/trabalho.tsx";
import { useLedger } from "./state/ledger.tsx";
import { Texto } from "./ui/primitives.tsx";
import { elevation, radius, type, usePalette } from "./ui/theme.ts";

export type Tela =
  | "painel"
  | "avisos"
  | "saude"
  | "relatorios"
  | "lancamentos"
  | "contas"
  | "cartoes"
  | "parcelamentos"
  | "recorrencias"
  | "assinaturas"
  | "orcamentos"
  | "metas"
  | "patrimonio"
  | "investimentos"
  | "recompensas"
  | "viagens"
  | "trabalho"
  | "assistente"
  | "automacoes"
  | "capturas"
  | "importar"
  | "configuracoes";

const ABAS: readonly { id: Tela; label: string }[] = [
  { id: "painel", label: "Início" },
  { id: "lancamentos", label: "Extrato" },
  { id: "cartoes", label: "Cartões" },
  { id: "trabalho", label: "Projetos" },
];

const GRUPO_ATIVO: Partial<Record<Tela, Tela>> = {
  painel: "painel",
  avisos: "painel",
  saude: "painel",
  relatorios: "painel",
  contas: "painel",
  recorrencias: "painel",
  assinaturas: "painel",
  orcamentos: "painel",
  metas: "painel",
  patrimonio: "painel",
  investimentos: "painel",
  recompensas: "cartoes",
  viagens: "painel",
  assistente: "painel",
  automacoes: "painel",
  capturas: "painel",
  importar: "painel",
  configuracoes: "painel",
  lancamentos: "lancamentos",
  cartoes: "cartoes",
  parcelamentos: "cartoes",
  trabalho: "trabalho",
};

export function Shell() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { transactions, sync } = useLedger();
  const [tela, setTela] = useState<Tela>("painel");
  const [editando, setEditando] = useState<string | null>(null);
  const [folhaAberta, setFolhaAberta] = useState(false);

  const emEdicao = useMemo(
    () => (editando ? transactions.find((item) => item.id === editando) ?? null : null),
    [editando, transactions],
  );

  const abrirLancamento = (id: string | null) => {
    setEditando(id);
    setFolhaAberta(true);
  };

  const ativa = GRUPO_ATIVO[tela] ?? tela;
  const esconderAbas = tela === "configuracoes" || tela === "parcelamentos";

  return (
    <View style={{ flex: 1, backgroundColor: palette.canvas }}>
      <View style={{ flex: 1 }}>
        <Conteudo tela={tela} onAbrirLancamento={abrirLancamento} onIrPara={setTela} />
      </View>

      {!esconderAbas ? <View
        style={{
          flexDirection: "row",
          alignItems: "stretch",
          flex: 0,
          borderTopWidth: 1,
          borderTopColor: palette.line,
          backgroundColor: palette.surface,
          paddingBottom: insets.bottom,
        }}
      >
        {ABAS.slice(0, 2).map((item) => (
          <ItemDeAba key={item.id} label={item.label} ativo={ativa === item.id} alerta={item.id === "painel" && sync.unresolved > 0} onPress={() => setTela(item.id)} />
        ))}

        <View style={{ width: 68, alignItems: "center" }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Novo lançamento"
            onPress={() => abrirLancamento(null)}
            style={({ pressed }) => ({
              width: 56,
              height: 56,
              marginTop: -23,
              borderRadius: radius.pill,
              borderWidth: 0,
              backgroundColor: pressed ? palette.accentEdge : palette.accent,
              alignItems: "center",
              justifyContent: "center",
              ...elevation.float,
            })}
          >
            <Plus size={24} color={palette.accentInk} weight="regular" />
          </Pressable>
        </View>

        {ABAS.slice(2).map((item) => (
          <ItemDeAba key={item.id} label={item.label} ativo={ativa === item.id} alerta={false} onPress={() => setTela(item.id)} />
        ))}
      </View> : null}

      <Modal
        visible={folhaAberta}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setFolhaAberta(false);
          setEditando(null);
        }}
      >
        <LancamentoScreen
          existing={emEdicao}
          onClose={() => {
            setFolhaAberta(false);
            setEditando(null);
          }}
        />
      </Modal>
    </View>
  );
}

function Conteudo({ tela, onAbrirLancamento, onIrPara }: { tela: Tela; onAbrirLancamento: (id: string | null) => void; onIrPara: (tela: Tela) => void }) {
  switch (tela) {
    case "painel": return <InicioScreen onOpenTransaction={onAbrirLancamento} onNavigate={onIrPara} />;
    case "avisos": return <AvisosScreen onVoltar={() => onIrPara("painel")} />;
    case "assinaturas": return <AssinaturasScreen onVoltar={() => onIrPara("recorrencias")} />;
    case "assistente": return <AssistenteScreen onVoltar={() => onIrPara("painel")} />;
    case "saude": return <SaudeScreen />;
    case "relatorios": return <RelatoriosScreen />;
    case "lancamentos": return <ExtratoScreen onOpenTransaction={onAbrirLancamento} onAjustes={() => onIrPara("configuracoes")} />;
    case "contas": return <ContasScreen />;
    case "cartoes": return <CarteiraScreen onParcelamentos={() => onIrPara("parcelamentos")} onOpenTransaction={onAbrirLancamento} onAjustes={() => onIrPara("configuracoes")} />;
    case "parcelamentos": return <ParcelamentosScreen onVoltar={() => onIrPara("cartoes")} />;
    case "recorrencias": return <PlanejamentoScreen />;
    case "orcamentos": return <OrcamentosScreen />;
    case "metas": return <MetasScreen />;
    case "patrimonio": return <PatrimonioScreen />;
    case "investimentos": return <InvestimentosScreen />;
    case "recompensas": return <RecompensasScreen />;
    case "viagens": return <ViagensScreen />;
    case "trabalho": return <TrabalhoScreen onAjustes={() => onIrPara("configuracoes")} />;
    case "automacoes": return <AutomacoesScreen />;
    case "capturas": return <CapturasScreen onVoltar={() => onIrPara("painel")} />;
    case "importar": return <ImportarScreen onVoltar={() => onIrPara("painel")} />;
    case "configuracoes": return <AjustesScreen onAbrirCapturas={() => onIrPara("capturas")} onVoltar={() => onIrPara("painel")} onNavigate={onIrPara} />;
  }
}

function ItemDeAba({ label, ativo, alerta, onPress }: { label: string; ativo: boolean; alerta: boolean; onPress: () => void }) {
  const palette = usePalette();
  const cor = ativo ? palette.accent : palette.inkSubtle;
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: ativo }}
      onPress={onPress}
      style={({ pressed }) => ({ flex: 1, minHeight: 66, alignItems: "center", justifyContent: "center", gap: 4, opacity: pressed ? 0.62 : 1 })}
    >
      <View style={{ position: "relative" }}>
        <IconeAba label={label} color={cor} active={ativo} />
        {alerta ? <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: palette.accent }} /> : null}
      </View>
      <Texto style={[type.caption, { color: cor, fontWeight: ativo ? "600" : "400" }]}>{label}</Texto>
    </Pressable>
  );
}

function IconeAba({ label, color, active }: { label: string; color: string; active: boolean }) {
  const props = { size: 20, color, weight: active ? "fill" as const : "regular" as const };
  if (label === "Início") return <House {...props} />;
  if (label === "Extrato") return <Receipt {...props} />;
  if (label === "Cartões") return <CreditCard {...props} />;
  return <Briefcase {...props} />;
}
