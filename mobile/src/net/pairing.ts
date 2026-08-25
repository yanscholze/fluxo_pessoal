/**
 * Pareamento do aparelho.
 *
 * O aplicativo pede um código, o usuário digita esse código no site já
 * autenticado, e o aplicativo troca o código por um token próprio. A senha
 * nunca chega aqui — ver `server/services/pairing.ts`.
 */

import { call } from "./client.ts";
import type { PairingClaim, PairingStart } from "./types.ts";

export function startPairing(input: {
  baseUrl: string;
  deviceId: string;
  deviceName: string | null;
  appVersion: string;
}): Promise<PairingStart> {
  return call<PairingStart>("/api/v1/pairing", {
    baseUrl: input.baseUrl,
    method: "POST",
    body: {
      deviceId: input.deviceId,
      deviceName: input.deviceName,
      platform: "android",
      appVersion: input.appVersion,
    },
  });
}

/**
 * Pergunta se o usuário já aprovou.
 *
 * O `pollToken` é o segredo que prova que quem pergunta é o aparelho que
 * pediu: o código na tela é curto e público por natureza.
 */
export function claimPairing(input: {
  baseUrl: string;
  code: string;
  pollToken: string;
}): Promise<PairingClaim> {
  return call<PairingClaim>("/api/v1/pairing", {
    baseUrl: input.baseUrl,
    method: "PUT",
    body: { code: input.code, pollToken: input.pollToken },
  });
}
