/**
 * Postagem — como um lançamento vira movimentações no razão.
 *
 * Esta é a única tradução de "o usuário registrou X" para "o dinheiro se moveu
 * assim". Se uma tela precisar saber o efeito de um lançamento sobre o saldo,
 * ela pergunta aqui; não reimplementa.
 */

import { conflict, validationError } from "../../kernel/errors.ts";
import { type Cents, isPositive, negate } from "../../kernel/money.ts";
import { competenceOf } from "../../time/competence.ts";
import { type DraftLedgerEntry, type Party, type Transaction, isSameParty } from "./types.ts";

/**
 * Movimentações que um lançamento produz.
 *
 * | Lançamento | Movimentações |
 * | --- | --- |
 * | Despesa em conta | conta −valor |
 * | Despesa no crédito | cartão −valor (dívida sobe), na competência da fatura |
 * | Receita | conta +valor |
 * | Transferência | origem −valor, destino +valor |
 * | Pagamento de fatura | conta −valor, cartão +valor (dívida cai) |
 *
 * Compra no crédito **não toca conta nenhuma**. O dinheiro só sai quando a
 * fatura é paga — é isso que impede o gasto ser contado duas vezes.
 *
 * Lançamento em revisão não produz movimentação: enquanto o usuário não
 * decide, ele não existe para o dinheiro.
 */
export function postTransaction(transaction: Transaction): DraftLedgerEntry[] {
  if (transaction.state === "review") return [];

  assertPostable(transaction);

  const base = {
    userId: transaction.userId,
    transactionId: transaction.id,
    effectiveOn: transaction.occurredOn,
    competence: transaction.competence,
    state: transaction.state,
    kind: transaction.kind,
  } as const;

  switch (transaction.kind) {
    case "expense":
      return [{ ...base, party: transaction.origin, amount: negate(transaction.amount) }];

    case "income":
      return [{ ...base, party: transaction.origin, amount: transaction.amount }];

    case "transfer": {
      // As duas pernas vivem na **mesma** competência, senão a transferência
      // deixa de se anular: apareceria como saída num mês e entrada em outro,
      // inflando despesa de um e receita do outro.
      const destination = transaction.destination as Party;
      return [
        { ...base, party: transaction.origin, amount: negate(transaction.amount) },
        { ...base, party: destination, amount: transaction.amount },
      ];
    }

    case "invoice_payment": {
      const destination = transaction.destination as Party;
      return [
        {
          ...base,
          party: transaction.origin,
          amount: negate(transaction.amount),
          // A saída de caixa pertence ao mês em que o dinheiro saiu da conta.
          // Herdar a competência da fatura tirava o pagamento do mês em que
          // ele realmente aconteceu.
          competence: competenceOf(transaction.occurredOn),
        },
        {
          // Já a perna do cartão pertence à fatura que está sendo quitada, que
          // pode ser de uma competência anterior.
          ...base,
          party: destination,
          amount: transaction.amount,
        },
      ];
    }
  }
}

/** Regras estruturais que todo lançamento postável precisa satisfazer. */
export function assertPostable(transaction: Transaction): void {
  if (!isPositive(transaction.amount)) {
    throw validationError("O valor do lançamento deve ser maior que zero", [
      { path: "amount", message: "Informe um valor maior que zero" },
    ]);
  }

  switch (transaction.kind) {
    case "expense":
      if (transaction.destination) {
        throw conflict("Despesa não tem conta de destino");
      }
      return;

    case "income":
      if (transaction.origin.kind !== "account") {
        throw conflict("Receita precisa entrar numa conta, não num cartão");
      }
      if (transaction.destination) {
        throw conflict("Receita não tem conta de destino");
      }
      return;

    case "transfer": {
      if (!transaction.destination) {
        throw validationError("Transferência exige conta de destino", [
          { path: "destination", message: "Selecione a conta de destino" },
        ]);
      }
      if (transaction.origin.kind !== "account" || transaction.destination.kind !== "account") {
        throw conflict("Transferência acontece entre contas. Para quitar cartão, use pagamento de fatura");
      }
      if (isSameParty(transaction.origin, transaction.destination)) {
        throw conflict("A conta de origem e a de destino precisam ser diferentes");
      }
      return;
    }

    case "invoice_payment": {
      if (!transaction.destination) {
        throw validationError("Pagamento de fatura exige o cartão de destino", [
          { path: "destination", message: "Selecione o cartão" },
        ]);
      }
      if (transaction.origin.kind !== "account") {
        throw conflict("O pagamento de fatura precisa sair de uma conta");
      }
      if (transaction.destination.kind !== "card") {
        throw conflict("O destino do pagamento de fatura precisa ser um cartão");
      }
      return;
    }
  }
}

/**
 * Efeito líquido de um lançamento sobre uma parte, sem materializar o razão.
 *
 * Atalho para pré-visualizar o impacto de uma edição ("quanto o saldo desta
 * conta muda se eu salvar isso?") usando exatamente as mesmas regras.
 */
export function effectOn(transaction: Transaction, party: Party): Cents {
  return postTransaction(transaction)
    .filter((entry) => isSameParty(entry.party, party))
    .reduce<Cents>((total, entry) => (total + entry.amount) as Cents, 0 as Cents);
}

/** Verdadeiro quando o lançamento faz o dinheiro se mover de fato. */
export function movesMoney(transaction: Transaction): boolean {
  return transaction.state === "confirmed";
}
