/**
 * Avisos.
 *
 * A mesma lista que vira notificação, aberta por inteiro — inclusive o que é
 * informativo demais para interromper. Existe porque notificação é efêmera:
 * quem deslizou o aviso para o lado no meio do dia precisa de um lugar onde
 * ele ainda esteja.
 *
 * A tela não guarda "lido": um aviso desaparece quando o problema que o gerou
 * deixa de existir, e não quando alguém o encara. Marcar como lido esconderia
 * uma fatura vencida que continua vencida.
 */

import { useEffect } from "react";
import { View } from "react-native";

import { type Aviso, buscarAvisos, notificarNovos } from "../notifications/avisos.ts";
import { useRemoto } from "../state/remote.tsx";
import { Body, Card, Empty, Label, Small } from "../ui/primitives.tsx";
import { TelaRemota } from "../ui/tela-remota.tsx";
import { radius, space, usePalette } from "../ui/theme.ts";

const TOM: Record<Aviso["severity"], "negative" | "caution" | "muted"> = {
  urgente: "negative",
  atencao: "caution",
  informativo: "muted",
};

const ROTULO: Record<Aviso["severity"], string> = {
  urgente: "Urgente",
  atencao: "Atenção",
  informativo: "Informação",
};

export function AvisosScreen({ onVoltar }: { onVoltar?: () => void }) {
  const remoto = useRemoto(buscarAvisos);

  // Abrir a tela é a hora natural de conferir se algo novo merece notificação:
  // os dados acabaram de chegar, e não custa uma segunda ida ao servidor.
  useEffect(() => {
    if (remoto.dados) void notificarNovos(remoto.dados);
  }, [remoto.dados]);

  return (
    <TelaRemota
      titulo="Avisos"
      descricao="O que o Fluxo notou e vale saber."
      remoto={remoto}
      onVoltar={onVoltar}
    >
      {(avisos) =>
        avisos.length === 0 ? (
          <Card>
            <Empty title="Nada a avisar" hint="Sem fatura vencida, sem captura parada, mês fechando." />
          </Card>
        ) : (
          <>
            {avisos.map((aviso) => (
              <CartaoDeAviso key={aviso.key} aviso={aviso} />
            ))}
          </>
        )
      }
    </TelaRemota>
  );
}

function CartaoDeAviso({ aviso }: { aviso: Aviso }) {
  const palette = usePalette();
  const cor = {
    urgente: palette.negative,
    atencao: palette.caution,
    informativo: palette.accent,
  }[aviso.severity];

  return (
    <Card>
      <View style={{ flexDirection: "row", gap: space.sm }}>
        {/*
          A faixa de cor à esquerda, e não um ícone: numa lista de avisos o que
          se lê primeiro é a urgência, e uma barra vertical dá isso de relance
          sem competir com o texto pelo mesmo espaço.
        */}
        <View style={{ width: 3, borderRadius: radius.pill, backgroundColor: cor }} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Label style={{ color: cor }}>{ROTULO[aviso.severity]}</Label>
          <Body strong>{aviso.title}</Body>
          <Small tone={TOM[aviso.severity]}>{aviso.body}</Small>
        </View>
      </View>
    </Card>
  );
}
