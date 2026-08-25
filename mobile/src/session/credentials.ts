/**
 * Credenciais do aparelho.
 *
 * O que fica aqui: o token de dispositivo emitido no pareamento, o endereço do
 * servidor e a identidade do dono. O que **não** fica em lugar nenhum: a senha
 * — ela nunca passa pelo celular. Quem prova identidade é a sessão web que
 * aprova o pareamento (ver `server/services/pairing.ts`).
 *
 * `expo-secure-store` guarda no Keystore do Android. O banco SQLite não serve:
 * ele vai junto num backup e é legível por quem tiver acesso ao arquivo.
 *
 * O identificador do aparelho é gerado uma vez e vive aqui, e não no banco,
 * porque precisa sobreviver a `wipeUserData()` — o mesmo aparelho reconectando
 * deve continuar sendo o mesmo aparelho.
 */

import * as SecureStore from "expo-secure-store";

const KEY_TOKEN = "fluxo.device.token";
const KEY_BASE_URL = "fluxo.device.baseUrl";
const KEY_USER = "fluxo.device.user";
const KEY_DEVICE_ID = "fluxo.device.id";

export type SessionUser = { readonly id: string; readonly displayName: string; readonly email: string };

export type Credentials = {
  readonly baseUrl: string;
  readonly token: string;
  readonly user: SessionUser;
};

export async function readCredentials(): Promise<Credentials | null> {
  const [token, baseUrl, usuario] = await Promise.all([
    SecureStore.getItemAsync(KEY_TOKEN),
    SecureStore.getItemAsync(KEY_BASE_URL),
    SecureStore.getItemAsync(KEY_USER),
  ]);

  if (!token || !baseUrl || !usuario) return null;

  try {
    return { token, baseUrl, user: JSON.parse(usuario) as SessionUser };
  } catch {
    // Registro corrompido não deve travar a abertura do aplicativo: some, e o
    // usuário reconecta.
    return null;
  }
}

export async function writeCredentials(credentials: Credentials): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(KEY_TOKEN, credentials.token),
    SecureStore.setItemAsync(KEY_BASE_URL, credentials.baseUrl),
    SecureStore.setItemAsync(KEY_USER, JSON.stringify(credentials.user)),
  ]);
}

export async function clearCredentials(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEY_TOKEN),
    SecureStore.deleteItemAsync(KEY_BASE_URL),
    SecureStore.deleteItemAsync(KEY_USER),
  ]);
}

/** Identificador estável deste aparelho. Criado na primeira chamada. */
export async function deviceId(): Promise<string> {
  const existente = await SecureStore.getItemAsync(KEY_DEVICE_ID);
  if (existente) return existente;

  // Importado aqui para que o polyfill de `crypto` já esteja instalado
  // (ver `index.ts`) quando o módulo for avaliado.
  const { newId } = await import("@fluxo/core/kernel/id.ts");
  const novo = newId();
  await SecureStore.setItemAsync(KEY_DEVICE_ID, novo);
  return novo;
}
