/**
 * Compra parcelada no cartão.
 *
 * É o único lançamento do aplicativo que **não** passa pela fila local, e por
 * um motivo de regra, não de conveniência: um parcelamento não é um
 * lançamento, é um **plano** — N lançamentos amarrados por um identificador
 * comum, cada um na sua competência de fatura, com quitação antecipada e
 * relatório próprio. Quem sabe montar isso é o domínio, no servidor, e é a
 * mesma função que o site chama.
 *
 * A alternativa seria o telefone criar as N linhas por conta própria e
 * inventar o identificador do plano. Seria uma segunda implementação da regra
 * de parcelamento, e a primeira a divergir no dia em que o ciclo de fatura
 * mudasse — exatamente o que este projeto evita em todo lugar.
 *
 * O preço é honesto e a tela precisa dizê-lo: parcelar exige rede. Uma compra
 * à vista continua entrando sem conexão, como sempre.
 */

import { call } from "./client.ts";

type Credenciais = { readonly baseUrl: string; readonly token: string };

export type CompraParcelada = {
  readonly description: string;
  /** Valor **total** da compra, em centavos. O servidor divide. */
  readonly amountCents: number;
  readonly occurredOn: string;
  readonly cardId: string;
  readonly categoryId: string | null;
  readonly installmentCount: number;
};

export type PlanoCriado = {
  readonly ids: readonly string[];
  readonly installmentPlanId: string | null;
  readonly competence: string;
};

export async function criarCompraParcelada(
  compra: CompraParcelada,
  credenciais: Credenciais,
): Promise<PlanoCriado> {
  const resposta = await call<{ data: PlanoCriado }>("/api/v1/transactions", {
    baseUrl: credenciais.baseUrl,
    token: credenciais.token,
    method: "POST",
    body: {
      kind: "expense",
      description: compra.description,
      // O servidor lê dinheiro como texto decimal, pelo mesmo `parseMoney` do
      // domínio. Mandar centavos crus aqui viraria um valor cem vezes maior.
      amount: (compra.amountCents / 100).toFixed(2),
      occurredOn: compra.occurredOn,
      state: "confirmed",
      cardId: compra.cardId,
      categoryId: compra.categoryId,
      installmentCount: compra.installmentCount,
    },
  });

  return resposta.data;
}
