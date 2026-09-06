/**
 * A sessão que o aparelho recebe.
 *
 * O aplicativo entra com o mesmo e-mail e a mesma senha do site, e leva um
 * token no corpo — ele não tem cookie que sobreviva ao fechamento. O que
 * precisa ficar preso aqui é a **validade**: a sessão de aparelho dura seis
 * meses porque o celular não tem como renovar sozinho, e uma sessão de
 * navegador no lugar dela desconectaria o usuário semanas depois, sem
 * explicação e sem nada que ele pudesse ter feito diferente.
 *
 * Era o que acontecia em quem se cadastrava pelo aplicativo: `signUp` emitia
 * sessão `web` fixa, ignorando quem estava pedindo.
 */

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { DEVICE_SESSION_DAYS, WEB_SESSION_DAYS } from "../auth/session.ts";
import { zerar } from "../testing/cenario.ts";

const AGORA = new Date("2026-09-10T12:00:00Z");

/** Dias inteiros entre a emissão e o vencimento. */
function diasAte(iso: string): number {
  return Math.round((new Date(iso).getTime() - AGORA.getTime()) / 86_400_000);
}

describe("sessão de aparelho", () => {
  beforeEach(() => {
    zerar();
  });

  it("quem se cadastra pelo aplicativo recebe sessão de aparelho, não de navegador", async () => {
    const { signUp } = await import("./auth.ts");

    const { session } = await signUp(
      { email: "novo@fluxo.app", password: "senha-de-teste-123", displayName: "Novo" },
      { kind: "device", deviceName: "Celular", platform: "android" },
      AGORA,
    );

    assert.equal(diasAte(session.expiresAt), DEVICE_SESSION_DAYS);
  });

  it("quem se cadastra pelo site continua com a sessão de navegador", async () => {
    const { signUp } = await import("./auth.ts");

    const { session } = await signUp(
      { email: "web@fluxo.app", password: "senha-de-teste-123", displayName: "Web" },
      {},
      AGORA,
    );

    assert.equal(diasAte(session.expiresAt), WEB_SESSION_DAYS);
  });

  it("entrar pelo aplicativo também dura seis meses", async () => {
    const { signUp, signIn } = await import("./auth.ts");

    await signUp({ email: "dono@fluxo.app", password: "senha-de-teste-123", displayName: "Dono" }, {}, AGORA);

    const { session } = await signIn(
      { email: "dono@fluxo.app", password: "senha-de-teste-123" },
      { kind: "device", deviceName: "Celular", platform: "android" },
      AGORA,
    );

    assert.equal(diasAte(session.expiresAt), DEVICE_SESSION_DAYS);
  });

  it("a senha errada não abre sessão nenhuma", async () => {
    const { signUp, signIn } = await import("./auth.ts");

    await signUp({ email: "dono@fluxo.app", password: "senha-de-teste-123", displayName: "Dono" }, {}, AGORA);

    await assert.rejects(
      () =>
        signIn(
          { email: "dono@fluxo.app", password: "senha-errada-123" },
          { kind: "device" },
          AGORA,
        ),
    );
  });

  it("o aparelho fica registrado na sessão, para poder ser revogado depois", async () => {
    const { signUp } = await import("./auth.ts");
    const { getDatabase } = await import("../db/client.ts");
    const { sessions } = await import("../db/schema/index.ts");
    const { eq } = await import("drizzle-orm");

    const { user } = await signUp(
      { email: "dono@fluxo.app", password: "senha-de-teste-123", displayName: "Dono" },
      { kind: "device", deviceName: "Pixel do Yan", platform: "android" },
      AGORA,
    );

    const [linha] = await getDatabase()
      .select({ kind: sessions.kind, deviceName: sessions.deviceName, platform: sessions.platform })
      .from(sessions)
      .where(eq(sessions.userId, user.id));

    assert.equal(linha.kind, "device");
    assert.equal(linha.deviceName, "Pixel do Yan");
    assert.equal(linha.platform, "android");
  });
});
