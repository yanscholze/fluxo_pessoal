/**
 * Entrar com a conta do Fluxo.
 *
 * Mesmo e-mail e mesma senha do site — o aparelho não tem identidade própria a
 * ser inventada. O servidor devolve um **token de aparelho**, e é só ele que
 * fica guardado, no armazenamento criptografado do Android. A senha existe
 * durante a chamada e some com a tela: nunca é escrita em disco, nem no banco
 * local, nem em log.
 *
 * O pareamento por código — pedir um código aqui e aprová-lo numa sessão web —
 * continua existindo no servidor e é mais forte para conectar um aparelho de
 * terceiro sem digitar senha nele. Para o dono entrando no próprio celular ele
 * cobra abrir o site no computador antes de cada conexão, que é atrito sem
 * ganho: quem tem a senha já pode entrar pelo site de qualquer jeito.
 */

import { call } from "./client.ts";

export type SignInResult = {
  readonly token: string;
  readonly expiresAt: string;
  readonly user: { readonly id: string; readonly displayName: string; readonly email: string };
};

export function signIn(input: {
  baseUrl: string;
  email: string;
  password: string;
  deviceName: string | null;
}): Promise<SignInResult> {
  return call<SignInResult>("/api/v1/session", {
    baseUrl: input.baseUrl,
    method: "POST",
    body: {
      action: "signin",
      email: input.email.trim(),
      password: input.password,
      // `device` é o que faz o token voltar no corpo em vez de num cookie: o
      // aplicativo não tem onde guardar cookie que sobreviva ao fechamento.
      kind: "device",
      deviceName: input.deviceName,
      platform: "android",
    },
  });
}

export function signUp(input: {
  baseUrl: string;
  email: string;
  password: string;
  displayName: string;
}): Promise<SignInResult> {
  return call<SignInResult>("/api/v1/session", {
    baseUrl: input.baseUrl,
    method: "POST",
    body: {
      action: "signup",
      email: input.email.trim(),
      password: input.password,
      displayName: input.displayName.trim(),
      kind: "device",
      platform: "android",
    },
  });
}
