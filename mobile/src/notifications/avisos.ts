/**
 * Notificações de aviso.
 *
 * O aplicativo pergunta ao servidor o que há para dizer e entrega ao sistema.
 * **Nenhuma regra sobre o que é urgente mora aqui** — se morasse, o celular e
 * o site poderiam discordar sobre o mesmo dinheiro, que é exatamente o defeito
 * que o Fluxo já pagou caro para corrigir no livre para gastar.
 *
 * A memória do que já foi notificado é a peça que separa "avisar" de
 * "perseguir": cada alerta tem uma chave estável, e uma chave já notificada não
 * volta. A chave da fatura carrega o vencimento, então a fatura do mês que vem
 * avisa de novo; a das capturas não carrega a contagem, então três compras
 * novas não viram três notificações.
 */

import * as Notifications from "expo-notifications";
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

/**
 * Quantas chaves lembrar.
 *
 * Suficiente para cobrir semanas de alertas distintos, pequeno o bastante para
 * caber num único valor do armazenamento seguro. As mais antigas caem primeiro,
 * e reavisar algo de dois meses atrás é um custo aceitável.
 */
const MEMORIA = 60;

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

  for (const aviso of pendentes) {
    await Notifications.scheduleNotificationAsync({
      content: { title: aviso.title, body: aviso.body, data: { screen: aviso.screen } },
      trigger: null,
    });
  }

  const memoria = [...jaVistos, ...pendentes.map((aviso) => aviso.key)].slice(-MEMORIA);
  await SecureStore.setItemAsync(CHAVES_NOTIFICADAS, JSON.stringify(memoria));

  return pendentes.length;
}

/** Esquece o que já foi notificado. Usado ao desconectar o aparelho. */
export async function limparMemoria(): Promise<void> {
  await SecureStore.deleteItemAsync(CHAVES_NOTIFICADAS);
}
