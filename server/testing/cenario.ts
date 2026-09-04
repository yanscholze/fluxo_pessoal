/**
 * Montagem de cenário para os testes de serviço.
 *
 * Cada teste começa com o schema recém-aplicado e monta o que precisa **pelos
 * próprios serviços**, não por `INSERT` direto. Escrever no banco à mão produz
 * estados que a aplicação nunca alcançaria — um cartão sem conta de pagamento,
 * uma parcela sem plano — e o teste passa a defender um cenário impossível.
 */

import { cents } from "../../core/kernel/money.ts";
import { localDate } from "../../core/time/local-date.ts";
import { bancoDeTeste, type BancoDeTeste } from "./d1-sqlite.ts";
import { instalarBinding } from "./worker-env.ts";

/**
 * O binding é criado uma vez e reaproveitado.
 *
 * `getDatabase()` guarda a instância do Drizzle num módulo e não oferece jeito
 * de esquecê-la; trocar o binding entre testes deixaria o cache apontando para
 * o banco anterior. Quem se renova é o SQLite lá dentro.
 */
const banco: BancoDeTeste = bancoDeTeste();
instalarBinding(banco);

/** Schema limpo. Chame no início de cada teste. */
export function zerar(): void {
  banco.reiniciar();
}

export const CENARIO = {
  email: "teste@fluxo.app",
  senha: "senha-de-teste-123",
  nome: "Pessoa de Teste",
} as const;

export type Ambiente = {
  readonly userId: string;
  readonly contaId: string;
  readonly cartaoId: string;
  readonly categoriaId: string;
};

/**
 * Usuário com uma conta corrente, um cartão de crédito e uma categoria.
 *
 * O cartão fecha dia 13 e vence dia 20 — o mesmo ciclo dos testes de domínio,
 * para que uma divergência entre camadas apareça como número diferente e não
 * como cenário diferente.
 */
export async function ambiente(saldoInicial = 500_000): Promise<Ambiente> {
  const { signUp } = await import("../services/auth.ts");
  const { createAccount, createCard, createCategory } = await import("../services/catalog.ts");

  const { user } = await signUp({
    email: CENARIO.email,
    password: CENARIO.senha,
    displayName: CENARIO.nome,
  });

  const contaId = await createAccount(user.id, {
    name: "Conta corrente",
    kind: "checking",
    institution: "Banco de Teste",
    openingBalance: cents(saldoInicial),
    openedOn: localDate("2026-01-01"),
  });

  const categoriaId = await createCategory(user.id, { name: "Mercado", kind: "expense" });

  const cartaoId = await createCard(user.id, {
    name: "Cartão de Teste",
    kind: "credit",
    paymentAccountId: contaId,
    closingDay: 13,
    dueDay: 20,
    dueAdjustment: "next",
    limit: cents(1_000_000),
    isPrimary: true,
  });

  return { userId: user.id, contaId, cartaoId, categoriaId };
}
