import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { scanText, scanRepository, formatFinding } from "./check-secrets.mjs";

const example = (parts) => parts.join("");
const google = () => example(["AI", "za", "x".repeat(35)]);
test("detecta formato Google em qualquer arquivo e não retorna o valor", () => {
  const secret = google(); const findings = scanText(`primeira\n${secret}\n`, "fixture.test.ts");
  assert.deepEqual(findings, [{ path: "fixture.test.ts", line: 2, type: "Google API key" }]);
  assert.ok(!JSON.stringify(findings).includes(secret)); assert.ok(!formatFinding(findings[0]).includes(secret));
});
test("detecta tokens dos demais provedores e chave privada", () => {
  const examples = [example(["gh", "p_", "x".repeat(36)]), example(["github", "_pat_", "x".repeat(70)]), example(["sk", "-proj-", "x".repeat(40)]), example(["AK", "IA", "X".repeat(16)]), example(["-----BEGIN ", "PRIVATE KEY-----"]), example(["eyJ", "x".repeat(12), ".", "x".repeat(12), ".", "x".repeat(12)])];
  for (const value of examples) assert.equal(scanText(value, "fonte.ts").length, 1);
});
test("exemplos construídos e variáveis vazias não são credenciais no fonte", () => {
  assert.deepEqual(scanText('const value = ["AI", "za", "x".repeat(35)].join("");\nGEMINI_API_KEY=\n', "example.ts"), []);
});
test("a checagem do índice encontra um segredo mesmo se removido do working tree", () => {
  const directory = mkdtempSync(join(tmpdir(), "fluxo-secret-guard-"));
  const git = (...args) => execFileSync("git", args, { cwd: directory, stdio: "pipe" });
  try {
    git("init", "--quiet"); writeFileSync(join(directory, "fixture.ts"), google()); git("add", "fixture.ts");
    writeFileSync(join(directory, "fixture.ts"), "sem segredo");
    assert.equal(scanRepository(directory).findings.length, 0);
    assert.equal(scanRepository(directory, { staged: true }).findings.length, 1);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test("arquivos ignorados não entram e arquivos novos ainda sem git add são verificados", () => {
  const directory = mkdtempSync(join(tmpdir(), "fluxo-secret-guard-"));
  try {
    execFileSync("git", ["init", "--quiet"], { cwd: directory });
    writeFileSync(join(directory, ".gitignore"), ".dev.vars\n");
    writeFileSync(join(directory, ".dev.vars"), google()); writeFileSync(join(directory, "novo.ts"), google());
    assert.deepEqual(scanRepository(directory).findings.map((f) => f.path), ["novo.ts"]);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
