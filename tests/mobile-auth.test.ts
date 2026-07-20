import assert from "node:assert/strict";
import test from "node:test";
import { hashMobileToken, mobileCallbackUrl, mobileSessionExpiry, parseBearerToken, parseMobileAuthorizationInput } from "../lib/mobile-auth.ts";

const validInput = { deviceId: "device-android-001", deviceName: "Galaxy S25", appVersion: "0.1.0", state: "state_android_12345678901234567890" };

test("valida os dados enviados pela tela de autorização", () => {
  const parsed = parseMobileAuthorizationInput(validInput);
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.value.deviceName, "Galaxy S25");
});

test("rejeita estado curto e identificador de aparelho inválido", () => {
  assert.equal(parseMobileAuthorizationInput({ ...validInput, state: "curto" }).ok, false);
  assert.equal(parseMobileAuthorizationInput({ ...validInput, deviceId: "!" }).ok, false);
});

test("extrai somente tokens bearer com formato seguro", () => {
  const token = "a".repeat(40);
  assert.equal(parseBearerToken(new Request("https://fluxo.test", { headers: { authorization: `Bearer ${token}` } })), token);
  assert.equal(parseBearerToken(new Request("https://fluxo.test", { headers: { authorization: "Basic abc" } })), null);
});

test("hash do token é determinístico sem armazenar o segredo original", async () => {
  const token = "token-seguro-android-1234567890123456";
  const first = await hashMobileToken(token);
  assert.equal(first, await hashMobileToken(token));
  assert.notEqual(first, token);
});

test("callback preserva estado e credenciais no fragmento do app", () => {
  const url = mobileCallbackUrl({ token: "device_token", gatewayToken: "gateway_token", state: validInput.state, expiresAt: "2027-01-01T00:00:00.000Z" });
  assert.ok(url.startsWith("fluxo://auth#"));
  const values = new URLSearchParams(url.split("#")[1]);
  assert.equal(values.get("state"), validInput.state);
  assert.equal(values.get("token"), "device_token");
});

test("sessão móvel dura 180 dias", () => {
  assert.equal(mobileSessionExpiry(new Date("2026-07-18T00:00:00.000Z")), "2027-01-14T00:00:00.000Z");
});
