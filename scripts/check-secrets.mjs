/** Scan source without emitting matched credentials, including synthetic fixtures. */
import { execFileSync } from "node:child_process";
import { readFileSync, lstatSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const patterns = [
  ["Google API key", /\bAIza[A-Za-z0-9_-]{35}\b/g],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/g],
  ["GitHub fine-grained token", /\bgithub_pat_[A-Za-z0-9_]{60,255}\b/g],
  ["OpenAI key", /\bsk-(?:(?:proj|svcacct)-)?[A-Za-z0-9_-]{32,}\b/g],
  ["AWS access key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ["Private key", /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/g],
  ["JWT", /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g],
];

export function scanText(text, path) {
  const findings = [];
  for (const [type, regex] of patterns) {
    for (const match of text.matchAll(new RegExp(regex))) findings.push({ path, line: text.slice(0, match.index).split("\n").length, type });
  }
  return findings;
}
export function formatFinding(finding) { return `${JSON.stringify(finding.path)}:${finding.line}: ${finding.type} (valor omitido)`; }

export function scanRepository(root, { staged = false } = {}) {
  const args = staged ? ["ls-files", "-z"] : ["ls-files", "--cached", "--others", "--exclude-standard", "-z"];
  const files = [...new Set(execFileSync("git", args, { cwd: root, maxBuffer: 32 * 1024 * 1024 }).toString().split("\0").filter(Boolean))];
  const findings = [];
  let scanned = 0;
  for (const path of files) {
    let bytes;
    if (staged) bytes = execFileSync("git", ["show", `:${path}`], { cwd: root, maxBuffer: 64 * 1024 * 1024 });
    else {
      let stat;
      try { stat = lstatSync(resolve(root, path)); } catch (error) { if (error.code === "ENOENT") continue; throw error; }
      if (!stat.isFile()) continue;
      bytes = readFileSync(resolve(root, path));
    }
    if (bytes.includes(0)) continue;
    scanned++;
    findings.push(...scanText(bytes.toString("utf8"), path));
  }
  return { scanned, findings };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  const result = scanRepository(root, { staged: process.argv.includes("--staged") });
  if (result.findings.length) {
    console.error(`Bloqueado: ${result.findings.length} possível(is) segredo(s). Nenhum valor será exibido.`);
    for (const finding of result.findings) console.error(formatFinding(finding));
    console.error("Remova credenciais do código; fixtures devem ser construídas em execução. Não desative o scanner para testes.");
    process.exitCode = 1;
  } else console.log(`Segredos: ${result.scanned} arquivos de texto verificados, nenhuma ocorrência dos formatos conhecidos.`);
}
