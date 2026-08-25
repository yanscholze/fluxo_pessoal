import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeBaseUrl } from "../src/config.ts";

describe("endereço do servidor", () => {
  it("assume https quando o usuário não digita o esquema", () => {
    assert.equal(normalizeBaseUrl("fluxo.exemplo.com.br"), "https://fluxo.exemplo.com.br");
  });

  it("preserva http explícito, que é o caso do servidor local", () => {
    assert.equal(normalizeBaseUrl("http://192.168.0.10:5173"), "http://192.168.0.10:5173");
  });

  it("corta a barra final para o caminho não sair duplicado", () => {
    assert.equal(normalizeBaseUrl("https://fluxo.exemplo.com.br/"), "https://fluxo.exemplo.com.br");
  });

  it("mantém o prefixo de caminho quando o Fluxo não está na raiz", () => {
    assert.equal(normalizeBaseUrl("https://exemplo.com.br/fluxo/"), "https://exemplo.com.br/fluxo");
  });

  it("recusa vazio e lixo", () => {
    assert.equal(normalizeBaseUrl(""), null);
    assert.equal(normalizeBaseUrl("   "), null);
    assert.equal(normalizeBaseUrl("://"), null);
  });

  it("recusa esquema que não fala HTTP", () => {
    // `javascript:` e `file:` viram URL válida e não servem para nada aqui.
    assert.equal(normalizeBaseUrl("javascript:alert(1)"), null);
    assert.equal(normalizeBaseUrl("file:///etc/passwd"), null);
  });
});
