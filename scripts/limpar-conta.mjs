/**
 * Esvazia uma conta do Fluxo, pela API.
 *
 * Existe para recomeçar uma importação do zero sem apagar o usuário e sem
 * tocar no banco por fora. A ordem importa: lançamento primeiro, catálogo
 * depois. Conta e cartão que ainda têm lançamento são **arquivados** em vez de
 * apagados — é a proteção que impede o histórico de ficar órfão — então tirar
 * os lançamentos antes é o que permite a limpeza ser de verdade.
 *
 * Uso:
 *   node scripts/limpar-conta.mjs [--url URL] [--aplicar]
 *
 * Simula por padrão. Autentica pelo token guardado do importador ou por
 * pareamento, igual a ele.
 */

import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const aplicar = args.includes("--aplicar");
const base = (args[args.indexOf("--url") + 1] ?? "").startsWith("http")
  ? args[args.indexOf("--url") + 1]
  : "http://localhost:5173";

const ARQUIVO_DO_TOKEN = join(homedir(), ".fluxo-importador-token");
let token = null;

async function api(caminho, { method = "GET", body } = {}) {
  const resposta = await fetch(`${base}${caminho}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const texto = await resposta.text();
  const corpo = texto ? JSON.parse(texto) : null;

  if (!resposta.ok) {
    throw new Error(`${method} ${caminho} → ${resposta.status}: ${JSON.stringify(corpo?.error ?? corpo)}`);
  }
  return corpo?.data;
}

async function autenticar() {
  if (existsSync(ARQUIVO_DO_TOKEN)) {
    token = readFileSync(ARQUIVO_DO_TOKEN, "utf8").trim();
    try {
      const sessao = await api("/api/v1/session");
      if (sessao?.authenticated) {
        console.log(`autenticado como ${sessao.user.email}.`);
        return;
      }
    } catch {
      // Vencido: cai no pareamento.
    }
    token = null;
    unlinkSync(ARQUIVO_DO_TOKEN);
  }

  const pedido = await api("/api/v1/pairing", {
    method: "POST",
    body: { deviceId: `limpeza-${Date.now()}`, deviceName: "Limpeza de conta", platform: "script" },
  });

  console.log(`\n  código de pareamento: ${pedido.code}`);
  console.log(`  aprove em ${base}/conectar\n`);

  const limite = Date.now() + 10 * 60_000;
  while (Date.now() < limite) {
    await new Promise((resolva) => setTimeout(resolva, 2500));
    const resultado = await api("/api/v1/pairing", {
      method: "PUT",
      body: { code: pedido.code, pollToken: pedido.pollToken },
    });

    if (resultado.status === "aprovado" && resultado.token) {
      token = resultado.token;
      writeFileSync(ARQUIVO_DO_TOKEN, token, { mode: 0o600 });
      console.log(`autenticado como ${resultado.user?.email ?? "conta pareada"}.`);
      return;
    }
    if (resultado.status === "expirado") throw new Error("o código expirou");
  }
  throw new Error("ninguém aprovou o código");
}

async function apagarTodos(nome, listar, caminhoDe) {
  const itens = (await listar()) ?? [];
  if (!itens.length) {
    console.log(`  ${nome}: nada a apagar`);
    return 0;
  }

  if (!aplicar) {
    console.log(`  ${nome}: ${itens.length} a apagar`);
    return itens.length;
  }

  let feitos = 0;
  const falhas = [];
  for (const item of itens) {
    try {
      await api(caminhoDe(item), { method: "DELETE" });
      feitos += 1;
    } catch (erro) {
      falhas.push(`${item.name ?? item.description ?? item.id}: ${erro.message.slice(0, 90)}`);
    }
  }

  console.log(`  ${nome}: ${feitos} apagados${falhas.length ? `, ${falhas.length} recusados` : ""}`);
  for (const f of falhas.slice(0, 5)) console.log(`      · ${f}`);
  return feitos;
}

async function main() {
  console.log(aplicar ? "\nMODO: apagando\n" : "\nMODO: simulação (use --aplicar)\n");
  await autenticar();

  /*
   * Lançamento primeiro, catálogo depois.
   *
   * Conta e cartão com lançamento são arquivados em vez de apagados — a
   * proteção que impede histórico órfão. Esvaziar os lançamentos antes é o que
   * faz a limpeza chegar até o fim.
   */
  console.log("\nlançamentos:");
  let total = 0;

  // O extrato pagina; repete até esvaziar.
  for (let volta = 0; volta < 40; volta += 1) {
    const extrato = await api("/api/v1/transactions?limit=200");
    const linhas = extrato?.transactions ?? extrato ?? [];
    if (!linhas.length) break;

    if (!aplicar) {
      console.log(`  ${linhas.length} na primeira página (simulação não percorre o resto)`);
      total += linhas.length;
      break;
    }

    for (const linha of linhas) {
      try {
        await api(`/api/v1/transactions/${linha.id}`, { method: "DELETE" });
        total += 1;
      } catch {
        // Parcela de plano some junto com a compra: a segunda tentativa
        // encontra 404, e isso é sucesso, não erro.
      }
    }
  }
  console.log(`  ${total} lançamentos apagados`);

  console.log("\ncatálogo:");
  await apagarTodos(
    "recorrências",
    () => api("/api/v1/recurrences"),
    (r) => `/api/v1/recurrences/${r.id}`,
  );
  await apagarTodos("cartões", () => api("/api/v1/cards"), (c) => `/api/v1/cards/${c.id}`);
  await apagarTodos("contas", () => api("/api/v1/accounts"), (a) => `/api/v1/accounts/${a.id}`);
  await apagarTodos(
    "categorias",
    () => api("/api/v1/categories"),
    (c) => `/api/v1/categories/${c.id}`,
  );

  console.log("\nrestando:");
  for (const [nome, caminho] of [
    ["lançamentos", "/api/v1/transactions?limit=1"],
    ["contas", "/api/v1/accounts"],
    ["cartões", "/api/v1/cards"],
    ["categorias", "/api/v1/categories"],
    ["recorrências", "/api/v1/recurrences"],
  ]) {
    const dados = await api(caminho);
    const quantos = Array.isArray(dados) ? dados.length : (dados?.transactions?.length ?? 0);
    console.log(`  ${nome}: ${quantos}`);
  }

  if (!aplicar) console.log("\nNada foi apagado. Rode com --aplicar.");
}

main().catch((erro) => {
  console.error(`\nErro: ${erro.message}`);
  process.exit(1);
});
