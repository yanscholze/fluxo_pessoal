/**
 * Notificações de aviso.
 *
 * O aplicativo pergunta ao servidor o que há para dizer e entrega ao sistema.
 * **Nenhuma regra sobre o que é urgente mora aqui** — se morasse, o celular e
 * o site poderiam discordar sobre o mesmo dinheiro, que é exatamente o defeito
 * que o Fluxo já pagou caro para corrigir no livre para gastar.
 *
 * A memória do que já foi notificado é a peça que separa "avisar" de
 * "perseguir": cada alerta tem uma chave, e uma chave já notificada não volta.
 * Quem decide a cadência é o servidor, pelo discriminador que põe na chave —
 * a fatura carrega o vencimento, o comprometimento carrega a competência, a
 * captura carrega o dia. Este módulo não interpreta nenhum deles; só lembra.
 */

import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

import { call } from "../net/client.ts";

export type Aviso = {
  readonly key: string;
  readonly severity: "urgente" | "atencao" | "informativo";
  readonly title: string;
  readonly body: string;
  readonly screen: string;
};

type Resposta = { readonly today: string; readonly alerts: readonly Aviso[] };

const CHAVES_NOTIFICADAS = "fluxo.avisos.notificados";

/** Canal Android dos avisos. Precisa existir antes da primeira notificação. */
const CANAL = "avisos";

/*
 * Sem isto, notificação com o aplicativo aberto não aparece.
 *
 * O comportamento padrão do expo-notifications é **engolir** a notificação
 * quando o app está em primeiro plano — e é justamente aí que este módulo
 * dispara, logo depois de buscar os avisos. Pior: a chave era gravada como
 * notificada mesmo assim, então o aviso ficava silenciado para sempre sem
 * nunca ter chegado.
 *
 * O registro fica no topo do módulo, e não dentro de uma função: precisa valer
 * antes de qualquer agendamento, e importar este módulo é o que o garante.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * Quantas chaves lembrar.
 *
 * O `SecureStore` do Android guarda até cerca de 2 KB por valor, e a chave mais
 * longa em uso — `capturas-pendentes-2026-09-08` — ocupa uns 33 bytes dentro do
 * JSON. Quarenta cabem com folga; sessenta encostariam no teto, e estourar
 * significa perder a memória inteira e reavisar tudo de uma vez.
 *
 * Quarenta cobre mais de um mês de alertas distintos. As mais antigas caem
 * primeiro, e reavisar algo de dois meses atrás é um custo aceitável.
 */
const MEMORIA = 40;

/** O que interrompe. Informativo espera o usuário abrir o aplicativo. */
const INTERROMPE = new Set(["urgente", "atencao"]);

export async function buscarAvisos(credenciais: {
  baseUrl: string;
  token: string;
}): Promise<readonly Aviso[]> {
  const resposta = await call<Resposta>("/api/v1/alerts", credenciais);
  return resposta.alerts;
}

async function lidas(): Promise<string[]> {
  const cru = await SecureStore.getItemAsync(CHAVES_NOTIFICADAS);
  if (!cru) return [];
  try {
    const valor: unknown = JSON.parse(cru);
    return Array.isArray(valor) ? valor.filter((item): item is string => typeof item === "string") : [];
  } catch {
    // Valor corrompido é tratado como memória vazia: reavisar é chato, travar é pior.
    return [];
  }
}

/**
 * Pede a permissão do sistema.
 *
 * Devolve `false` sem insistir quando o usuário recusa. Um aplicativo que pede
 * de novo a cada abertura é desinstalado antes de avisar qualquer coisa.
 */
export async function pedirPermissao(): Promise<boolean> {
  const atual = await Notifications.getPermissionsAsync();
  if (atual.granted) return true;
  if (!atual.canAskAgain) return false;
  const pedido = await Notifications.requestPermissionsAsync();
  return pedido.granted;
}

/**
 * Cria o canal Android dos avisos.
 *
 * A partir do Android 8 toda notificação pertence a um canal, e uma enviada
 * para um canal inexistente não aparece. O `defaultChannel` declarado no
 * plugin só escreve a meta-data que o FCM usa — quem cria o canal de verdade é
 * esta chamada. No iOS ela não faz nada, e é isso mesmo.
 */
async function garantirCanal(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(CANAL, {
    name: "Avisos",
    importance: Notifications.AndroidImportance.DEFAULT,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  });
}

/**
 * Entrega os avisos novos ao sistema e devolve quantos foram.
 *
 * Dispara imediatamente (`trigger: null`): o alerta já é sobre agora, e agendar
 * para depois criaria uma fila que sobrevive ao problema que a originou.
 */
export async function notificarNovos(avisos: readonly Aviso[]): Promise<number> {
  const novos = avisos.filter((aviso) => INTERROMPE.has(aviso.severity));
  if (novos.length === 0) return 0;

  const jaVistos = new Set(await lidas());
  const pendentes = novos.filter((aviso) => !jaVistos.has(aviso.key));
  if (pendentes.length === 0) return 0;

  if (!(await pedirPermissao())) return 0;
  await garantirCanal();

  /*
   * A chave só é lembrada se a notificação de fato saiu.
   *
   * Marcar antes de entregar troca "já avisei" por "já tentei": qualquer falha
   * — permissão revogada no meio, canal ausente, agendamento recusado — deixava
   * o aviso silenciado para sempre sem nunca ter chegado a ninguém.
   */
  const entregues: string[] = [];
  for (const aviso of pendentes) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: aviso.title,
          body: aviso.body,
          data: { screen: aviso.screen },
          ...(Platform.OS === "android" ? { channelId: CANAL } : {}),
        },
        trigger: null,
      });
      entregues.push(aviso.key);
    } catch {
      // Segue para os próximos: um aviso que falhou tenta de novo na próxima
      // abertura, e não leva os outros junto.
    }
  }

  if (entregues.length === 0) return 0;

  const memoria = [...jaVistos, ...entregues].slice(-MEMORIA);
  await SecureStore.setItemAsync(CHAVES_NOTIFICADAS, JSON.stringify(memoria));

  return entregues.length;
}

/** Esquece o que já foi notificado. Usado ao desconectar o aparelho. */
export async function limparMemoria(): Promise<void> {
  await SecureStore.deleteItemAsync(CHAVES_NOTIFICADAS);
}
