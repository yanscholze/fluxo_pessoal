/**
 * Recria os cartões que a limpeza da importação arquivou.
 *
 * Arquivar preserva o histórico e tira o cartão de cena — certo no uso normal,
 * mas aqui o histórico arquivado era de uma importação desfeita, e os cartões
 * de verdade sumiram junto. Este script os traz de volta com a configuração
 * que eles tinham: bandeira, final, ciclo e limite.
 *
 * Não reativa os arquivados: cria novos, limpos. O histórico velho continua
 * arquivado, fora dos totais, e o cartão novo começa sem a dívida que a
 * importação errada inventou.
 *
 * Uso:
 *   node scripts/restaurar-cartoes.mjs [--url URL] [--aplicar]
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const aplicar = args.includes("--aplicar");
const iUrl = args.indexOf("--url");
const base = iUrl >= 0 && (args[iUrl + 1] ?? "").startsWith("http") ? args[iUrl + 1] : "http://localhost:5173";

/**
 * Os cartões que o dono usa de fato, com o que eles tinham antes.
 *
 * O Nubank de crédito não está aqui: ele sobreviveu à limpeza e é o único que a
 * conciliação do OFX povoou.
 */
const CARTOES = [
  { name: "Caju", kind: "debit", closingDay: 1, dueDay: 8, brand: "Visa", last4: "2042" },
  { name: "Nubank Global", kind: "debit", closingDay: 1, dueDay: 8, brand: "Mastercard", last4: "6307" },
  { name: "XP Infinite", kind: "debit", closingDay: 1, dueDay: 8, brand: "Visa", last4: "5426" },
  {
    name: "Mercado Pago",
    kind: "credit",
    closingDay: 29,
    dueDay: 4,
    brand: "Visa",
    last4: "7281",
    limit: "13500,00",
  },
];

const ARQUIVO_DO_TOKEN = join(homedir(), ".fluxo-importador-token");
if (!existsSync(ARQUIVO_DO_TOKEN)) {
  console.error("sem token guardado. Rode o importador antes.");
  process.exit(1);
}
const token = readFileSync(ARQUIVO_DO_TOKEN, "utf8").trim();

async function api(caminho, { method = "GET", body } = {}) {
  const resposta = await fetch(`${base}${caminho}`, {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const texto = await resposta.text();
  const corpo = texto ? JSON.parse(texto) : null;
  if (!resposta.ok) throw new Error(`${method} ${caminho} → ${resposta.status}: ${JSON.stringify(corpo?.error ?? corpo)}`);
  return corpo?.data;
}

const contas = await api("/api/v1/accounts");
const conta = contas.find((c) => c.name.startsWith("Nubank Conta")) ?? contas[0];
if (!conta) {
  console.error("nenhuma conta cadastrada para vincular o pagamento.");
  process.exit(1);
}

const existentes = new Set((await api("/api/v1/cards")).map((c) => c.name));

console.log(aplicar ? "MODO: aplicando\n" : "MODO: simulação (use --aplicar)\n");
console.log(`conta de pagamento: ${conta.name}\n`);

let criados = 0;
for (const cartao of CARTOES) {
  if (existentes.has(cartao.name)) {
    console.log(`  ${cartao.name.padEnd(16)} já existe, pulando`);
    continue;
  }

  console.log(
    `  ${cartao.name.padEnd(16)} ${cartao.kind === "credit" ? "crédito" : "débito"} · ${cartao.brand} ····${cartao.last4}` +
      (cartao.limit ? ` · limite R$ ${cartao.limit}` : ""),
  );

  if (aplicar) {
    await api("/api/v1/cards", {
      method: "POST",
      body: {
        name: cartao.name,
        kind: cartao.kind,
        paymentAccountId: conta.id,
        closingDay: cartao.closingDay,
        dueDay: cartao.dueDay,
        brand: cartao.brand,
        last4: cartao.last4,
        ...(cartao.limit ? { limit: cartao.limit } : {}),
        isPrimary: false,
      },
    });
    criados += 1;
  }
}

console.log(aplicar ? `\n✅ ${criados} cartões criados.` : "\nsimulação — nada foi criado.");
