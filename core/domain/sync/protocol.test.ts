import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DomainError } from "../../kernel/errors.ts";
import {
  type Mutation,
  type SyncRequest,
  MAX_MUTATIONS,
  SYNC_PROTOCOL_VERSION,
  assertValidRequest,
  decide,
  isAfter,
} from "./protocol.ts";

function mutacao(overrides: Partial<Mutation> = {}): Mutation {
  return {
    mutationId: "01M0V000000000000000000001",
    entity: "transaction",
    entityId: "01M0V000000000000000000002",
    operation: "upsert",
    baseVersion: 0,
    data: { id: "01M0V000000000000000000002", description: "Mercado" },
    ...overrides,
  };
}

function pedido(overrides: Partial<SyncRequest> = {}): SyncRequest {
  return {
    protocolVersion: SYNC_PROTOCOL_VERSION,
    device: { id: "android-01M0V0000000000000000003" },
    mutations: [mutacao()],
    cursor: null,
    ...overrides,
  };
}

describe("protocolo de sincronização", () => {
  describe("validação do lote", () => {
    it("aceita um lote bem formado", () => {
      assert.doesNotThrow(() => assertValidRequest(pedido()));
    });

    it("recusa versão de protocolo diferente", () => {
      assert.throws(() => assertValidRequest(pedido({ protocolVersion: 99 })), DomainError);
    });

    it("recusa aparelho sem identificador válido", () => {
      assert.throws(() => assertValidRequest(pedido({ device: { id: "x" } })), DomainError);
    });

    it("recusa lote acima do teto", () => {
      const muitas = Array.from({ length: MAX_MUTATIONS + 1 }, (_unused, indice) =>
        mutacao({ mutationId: `01M0V00000000000000000${String(indice).padStart(4, "0")}` }),
      );
      assert.throws(() => assertValidRequest(pedido({ mutations: muitas })), DomainError);
    });

    it("recusa mutação repetida no mesmo lote", () => {
      // Fila montada errada no aparelho; aceitar esconderia o defeito.
      assert.throws(
        () => assertValidRequest(pedido({ mutations: [mutacao(), mutacao()] })),
        DomainError,
      );
    });

    it("recusa gravação sem dados", () => {
      assert.throws(
        () => assertValidRequest(pedido({ mutations: [mutacao({ data: undefined })] })),
        DomainError,
      );
    });

    it("recusa payload cujo id não confere com o da mutação", () => {
      // Gravaria no registro errado.
      assert.throws(
        () =>
          assertValidRequest(
            pedido({ mutations: [mutacao({ data: { id: "01M0V000000000000000000099" } })] }),
          ),
        DomainError,
      );
    });

    it("aceita exclusão sem dados", () => {
      assert.doesNotThrow(() =>
        assertValidRequest(pedido({ mutations: [mutacao({ operation: "delete", data: undefined })] })),
      );
    });

    it("recusa versão base negativa", () => {
      assert.throws(
        () => assertValidRequest(pedido({ mutations: [mutacao({ baseVersion: -1 })] })),
        DomainError,
      );
    });

    it("recusa o lote inteiro, não parte dele", () => {
      // Aplicar metade deixaria o aparelho sem saber o que entrou.
      const misto = [mutacao(), mutacao({ mutationId: "curta", entityId: "tb" })];
      assert.throws(() => assertValidRequest(pedido({ mutations: misto })), DomainError);
    });
  });

  describe("decisão", () => {
    it("cria quando o registro não existe", () => {
      assert.deepEqual(decide(mutacao(), null, false), { action: "apply", nextVersion: 1 });
    });

    it("apagar o que nunca existiu não é erro", () => {
      // O aparelho pode ter criado e apagado offline, e só a exclusão chegou.
      assert.deepEqual(decide(mutacao({ operation: "delete" }), null, false), { action: "noop" });
    });

    it("apagar o que já está apagado não faz nada", () => {
      assert.deepEqual(decide(mutacao({ operation: "delete", baseVersion: 3 }), 3, true), {
        action: "noop",
      });
    });

    it("aplica quando a versão base confere", () => {
      assert.deepEqual(decide(mutacao({ baseVersion: 3 }), 3, false), { action: "apply", nextVersion: 4 });
    });

    it("acusa conflito quando o servidor avançou", () => {
      // Sobrescrever apagaria a outra edição em silêncio.
      assert.deepEqual(decide(mutacao({ baseVersion: 2 }), 5, false), { action: "conflict" });
    });

    it("acusa conflito quando o aparelho está à frente", () => {
      assert.deepEqual(decide(mutacao({ baseVersion: 7 }), 5, false), { action: "conflict" });
    });

    it("criação sobre registro existente é conflito, não sobrescrita", () => {
      // `baseVersion: 0` diz "nada existia"; se existe, o aparelho está
      // desatualizado.
      assert.deepEqual(decide(mutacao({ baseVersion: 0 }), 2, false), { action: "conflict" });
    });
  });

  describe("cursor", () => {
    it("ordena por instante", () => {
      assert.ok(isAfter({ updatedAt: "2026-08-25T10:00:01Z", id: "a" }, { updatedAt: "2026-08-25T10:00:00Z", id: "z" }));
    });

    it("desempata pelo identificador quando o instante é igual", () => {
      // Dois registros gravados no mesmo milissegundo empatariam, e um seria
      // pulado na próxima página.
      const instante = "2026-08-25T10:00:00.000Z";
      assert.ok(isAfter({ updatedAt: instante, id: "b" }, { updatedAt: instante, id: "a" }));
      assert.equal(isAfter({ updatedAt: instante, id: "a" }, { updatedAt: instante, id: "b" }), false);
    });

    it("não considera o mesmo ponto como posterior", () => {
      const ponto = { updatedAt: "2026-08-25T10:00:00Z", id: "a" };
      assert.equal(isAfter(ponto, ponto), false);
    });
  });
});
