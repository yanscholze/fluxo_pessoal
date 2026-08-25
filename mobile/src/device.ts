/**
 * Identidade do aparelho para o servidor.
 *
 * Nome e versão vão junto no pareamento e em cada sincronização, e é isso que
 * a tela "Aparelhos conectados" do site mostra. Sem eles a lista viraria uma
 * fileira de identificadores, e revogar o aparelho certo passaria a ser
 * adivinhação.
 */

import Constants from "expo-constants";
import * as Device from "expo-device";

/** Ex.: "Galaxy S23". Cai para marca e modelo quando o usuário não nomeou. */
export const deviceName: string | null =
  Device.deviceName?.trim() || [Device.brand, Device.modelName].filter(Boolean).join(" ").trim() || null;

/** Versão do aplicativo declarada em `app.json`. */
export const appVersion: string = Constants.expoConfig?.version ?? "0.0.0";
