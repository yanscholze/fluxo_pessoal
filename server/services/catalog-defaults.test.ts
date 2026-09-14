import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { zerar } from "../testing/cenario.ts";

describe("categorias iniciais", () => {
  beforeEach(() => zerar());

  it("cria o empréstimo de cartão e sua entrada espelho fora do livre", async () => {
    const { signUp } = await import("./auth.ts");
    const { listCategories } = await import("../repositories/catalog.ts");
    const { user } = await signUp({
      email: "categorias@fluxo.app",
      password: "senha-de-teste-123",
      displayName: "Categorias",
    });

    const categorias = await listCategories(user.id);
    const emprestimo = categorias.find(
      (item) => item.kind === "expense" && item.name === "Empréstimo de cartão",
    );
    const pagamento = categorias.find(
      (item) => item.kind === "income" && item.name === "Pagamento de empréstimo de cartão",
    );

    assert.equal(categorias.length, 11);
    assert.equal(emprestimo?.excludeFromFreeToSpend, true);
    assert.equal(pagamento?.excludeFromFreeToSpend, true);
  });
});
