import assert from "node:assert/strict";
import test from "node:test";
import { parseMobileAuthCallback } from "../src/mobile-auth.ts";

test("aceita o callback móvel com estado correspondente", () => {
  const state = "state_123456789012345678901234";
  const parsed = parseMobileAuthCallback(`fluxo://auth#token=${"a".repeat(32)}&gateway=gate&state=${state}&expires_at=2027-01-01T00%3A00%3A00.000Z`, state);
  assert.equal(parsed.gatewayToken, "gate");
});

test("rejeita callback de outra tentativa", () => {
  assert.throws(() => parseMobileAuthCallback(`fluxo://auth#token=${"a".repeat(32)}&gateway=gate&state=wrong&expires_at=2027-01-01`, "expected_state_12345678901234567890"));
});
