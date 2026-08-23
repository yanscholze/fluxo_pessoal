#!/usr/bin/env node
// scripts/import-fluxo-export.mjs
//
// Reimporta um arquivo exportado pelo botão "Exportar JSON" (Configurações)
// para uma instância nova do Fluxo — normalmente uma hospedada por você fora
// do ChatGPT (ex.: Cloudflare Workers).
//
// Ele usa a própria API do app (/api/auth e /api/finance), a mesma que a
// interface web usa, então respeita toda a validação de negócio que já
// existe. Não toca no banco de dados diretamente.
//
// Uso:
//   node scripts/import-fluxo-export.mjs \
//     --export ./fluxo-export-2026-08-09.json \
//     --base-url https://SEU-DEPLOY.workers.dev \
//     --email voce@email.com \
//     --password 'sua-senha-na-conta-nova'
//
// A conta (--email/--password) precisa já existir na instância de destino
// (crie pela tela normal de cadastro antes de rodar o script).
//
// Saldo das contas: o script cria as contas com saldo 0 e reproduz TODAS as
// transações em ordem cronológica, deixando o próprio app recalcular o saldo
// (é assim que ele calcula normalmente). No final, compara o saldo resultante
// com o saldo que estava no export e avisa se algo não bateu — isso só
// aconteceria se o saldo tivesse sido editado manualmente sem passar por uma
// transação na conta original.

import { readFile } from "node:fs/promises";

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const value = argv[index + 1];
    out[key] = value;
    index += 1;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const exportPath = args.export;
const baseUrl = (args["base-url"] || "").replace(/\/$/, "");
const email = args.email;
const password = args.password;

if (!exportPath || !baseUrl || !email || !password) {
  console.error(
    "Uso: node scripts/import-fluxo-export.mjs --export <arquivo.json> --base-url <https://...> --email <email> --password <senha>",
  );
  process.exit(1);
}

let cookie = "";

async function api(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
      ...(options.headers || {}),
    },
  });
  const setCookie =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : response.headers.get("set-cookie")
        ? [response.headers.get("set-cookie")]
        : [];
  const sessionCookie = setCookie.find((value) => value.startsWith("fluxo_session="));
  if (sessionCookie) cookie = sessionCookie.split(";")[0];
  let body = null;
  try {
    body = await response.json();
  } catch {
    // no body
  }
  return { ok: response.ok, status: response.status, body };
}

async function postFinance(payload, label) {
  const result = await api("/api/finance", { method: "POST", body: JSON.stringify(payload) });
  if (!result.ok) {
    console.warn(`  ⚠ ${label}: ${result.body?.error ?? result.status}`);
  }
  return result;
}

async function login() {
  const result = await api("/api/auth", {
    method: "POST",
    body: JSON.stringify({ action: "login", email, password }),
  });
  if (!result.ok) {
    throw new Error(`Não foi possível entrar em ${baseUrl}: ${result.body?.error ?? result.status}`);
  }
  console.log(`✓ Login ok em ${baseUrl} como ${result.body.user.email}`);
}

async function main() {
  const raw = await readFile(exportPath, "utf8");
  const data = JSON.parse(raw);

  await login();

  console.log(`\nContas (${data.accounts?.length ?? 0})`);
  for (const account of data.accounts ?? []) {
    await postFinance({ account: { ...account, id: undefined, balance: 0 } }, `conta "${account.name}"`);
  }

  console.log(`\nCategorias (${data.categories?.length ?? 0})`);
  for (const category of data.categories ?? []) {
    await postFinance({ category: { ...category, id: undefined } }, `categoria "${category.name}"`);
  }

  console.log(`\nCartões (${data.cards?.length ?? 0})`);
  const cardIdMap = new Map();
  for (const card of data.cards ?? []) {
    const result = await postFinance({ card: { ...card, id: undefined } }, `cartão "${card.name}"`);
    if (result.ok && result.body?.card) cardIdMap.set(card.id, result.body.card.id);
  }

  console.log(`\nViagens (${data.trips?.length ?? 0})`);
  const tripIdMap = new Map();
  for (const trip of data.trips ?? []) {
    const result = await postFinance({ trip: { ...trip, id: undefined } }, `viagem "${trip.name}"`);
    if (result.ok && result.body?.trip) tripIdMap.set(trip.id, result.body.trip.id);
  }

  console.log(`\nRegras recorrentes (${data.recurringRules?.length ?? 0})`);
  for (const rule of data.recurringRules ?? []) {
    await postFinance(
      {
        recurringRule: {
          ...rule,
          id: undefined,
          cardId: rule.cardId ? cardIdMap.get(rule.cardId) : undefined,
        },
      },
      `recorrência "${rule.description}"`,
    );
  }

  if (data.salaryRule || data.benefitRule) {
    console.log("\nSalário / benefício");
    await postFinance(
      {
        incomeRules: {
          salary: data.salaryRule ?? undefined,
          benefit: data.benefitRule ?? undefined,
        },
      },
      "salário/benefício",
    );
  }

  const transactionsToImport = (data.transactions ?? [])
    .filter((item) => !(item.source === "recurring" && item.status === "planned"))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));

  console.log(`\nLançamentos (${transactionsToImport.length})`);
  let done = 0;
  for (const transaction of transactionsToImport) {
    await postFinance(
      {
        transaction: {
          ...transaction,
          cardId: transaction.cardId ? cardIdMap.get(transaction.cardId) ?? transaction.cardId : undefined,
          tripId: transaction.tripId ? tripIdMap.get(transaction.tripId) ?? transaction.tripId : undefined,
        },
      },
      `lançamento "${transaction.description}" (${transaction.date})`,
    );
    done += 1;
    if (done % 50 === 0) console.log(`  ...${done}/${transactionsToImport.length}`);
  }

  console.log(`\nResgates de recompensa (${data.rewardRedemptions?.length ?? 0})`);
  for (const redemption of data.rewardRedemptions ?? []) {
    await postFinance(
      {
        rewardRedemption: {
          ...redemption,
          id: undefined,
          cardId: cardIdMap.get(redemption.cardId) ?? redemption.cardId,
        },
      },
      `resgate no cartão "${redemption.cardId}"`,
    );
  }

  console.log("\nConferindo saldos finais...");
  const final = await api("/api/finance", { method: "GET" });
  const mismatches = [];
  for (const original of data.accounts ?? []) {
    const current = final.body?.accounts?.find((item) => item.name === original.name);
    if (!current) {
      mismatches.push(`"${original.name}": conta não encontrada no destino`);
      continue;
    }
    if (Math.abs(current.balance - original.balance) > 0.005) {
      mismatches.push(`"${original.name}": esperado R$ ${original.balance.toFixed(2)}, ficou R$ ${current.balance.toFixed(2)}`);
    }
  }
  if (mismatches.length) {
    console.warn("\n⚠ Saldos que não bateram (confira manualmente):");
    for (const line of mismatches) console.warn(`  - ${line}`);
  } else {
    console.log("✓ Todos os saldos batem com o export original.");
  }

  console.log("\nImportação concluída.");
}

main().catch((error) => {
  console.error(`\nFalha na importação: ${error.message}`);
  process.exit(1);
});
