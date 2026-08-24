import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseCsv } from "./csv-parser.ts";
import type { ParseResult } from "./types.ts";

/** Monta o arquivo com CRLF, que é o que Excel e banco brasileiro exportam. */
function file(...lines: string[]): string {
  return lines.join("\r\n");
}

function reasons(result: ParseResult): string[] {
  return result.discarded.map((item) => item.reason);
}

describe("parser de CSV", () => {
  describe("delimitador", () => {
    it("lê arquivo separado por ponto e vírgula com valores em pt-BR", () => {
      const result = parseCsv(
        file("Data;Descrição;Valor", "13/08/2026;MERCADO SÃO JOÃO;-1.234,56", "14/08/2026;SALÁRIO;3.000,00"),
      );

      assert.equal(result.format, "csv");
      assert.equal(result.rows.length, 2);
      assert.equal(result.rows[0].date, "2026-08-13");
      assert.equal(result.rows[0].description, "MERCADO SÃO JOÃO");
      assert.equal(result.rows[0].amount, -123456);
      assert.equal(result.rows[1].amount, 300000);
      // O cabeçalho não é lançamento, mas também não é erro: sai como descarte.
      assert.deepEqual(reasons(result), ["nao_e_lancamento"]);
    });

    it("lê arquivo separado por vírgula com valores em US", () => {
      const result = parseCsv(file("date,description,amount", "2026-08-13,UBER TRIP,-23.45", "2026-08-14,REFUND,10.00"));

      assert.equal(result.rows.length, 2);
      assert.equal(result.rows[0].amount, -2345);
      assert.equal(result.rows[1].amount, 1000);
    });

    it("decide o delimitador pela primeira linha, ignorando vírgulas dentro de aspas", () => {
      // Sete vírgulas nas aspas contra dois ponto e vírgulas: contar dentro das
      // aspas quebraria o arquivo inteiro em colunas erradas.
      const result = parseCsv(
        file("Data;Descrição;Valor", '13/08/2026;"MERCADO, LTDA, ME, EPP, S.A., CIA, & CO";-10,00'),
      );

      assert.equal(result.rows.length, 1);
      assert.equal(result.rows[0].description, "MERCADO, LTDA, ME, EPP, S.A., CIA, & CO");
      assert.equal(result.rows[0].amount, -1000);
    });
  });

  describe("aspas", () => {
    it("preserva o delimitador dentro de aspas", () => {
      const result = parseCsv(file("date,description,amount", '2026-08-13,"PADARIA, PAO E CIA",-15.90'));

      assert.equal(result.rows[0].description, "PADARIA, PAO E CIA");
      assert.equal(result.rows[0].amount, -1590);
    });

    it("desfaz aspas escapadas", () => {
      const result = parseCsv(file("Data;Descrição;Valor", '13/08/2026;"LOJA ""BOM PRECO"" LTDA";-20,00'));

      assert.equal(result.rows[0].description, 'LOJA "BOM PRECO" LTDA');
    });

    it("aceita quebra de linha dentro de aspas", () => {
      const result = parseCsv(file("Data;Descrição;Valor", '13/08/2026;"RUA DAS FLORES', 'SALA 2";-30,00', ""));

      assert.equal(result.rows.length, 1);
      // A quebra vira espaço na descrição normalizada, mas o texto original fica
      // inteiro no rawText para a revisão.
      assert.equal(result.rows[0].description, "RUA DAS FLORES SALA 2");
      assert.ok(result.rows[0].rawText.includes("SALA 2"));
    });
  });

  describe("datas", () => {
    it("aceita as quatro formas", () => {
      const result = parseCsv(
        file(
          "Data;Descrição;Valor",
          "13/08/2026;A;-1,00",
          "13-08-2026;B;-1,00",
          "2026-08-13;C;-1,00",
          "13/08/26;D;-1,00",
        ),
      );

      assert.deepEqual(
        result.rows.map((row) => row.date),
        ["2026-08-13", "2026-08-13", "2026-08-13", "2026-08-13"],
      );
    });

    it("descarta data que não existe no calendário", () => {
      const result = parseCsv(file("Data;Descrição;Valor", "31/02/2026;MERCADO;-10,00"));

      assert.equal(result.rows.length, 0);
      assert.deepEqual(reasons(result), ["nao_e_lancamento", "sem_data"]);
    });

    it("ignora a hora colada na data", () => {
      const result = parseCsv(file("Data;Descrição;Valor", "2026-08-13 10:42:00;MERCADO;-10,00"));

      assert.equal(result.rows[0].date, "2026-08-13");
    });
  });

  describe("valores", () => {
    it("usa colunas separadas de entrada e saída", () => {
      // A saída vem positiva no arquivo: o sinal está na coluna, não no número.
      const result = parseCsv(
        file("Data;Histórico;Entrada;Saída", "13/08/2026;MERCADO;;123,45", "14/08/2026;SALARIO;3.000,00;"),
      );

      assert.equal(result.rows[0].amount, -12345);
      assert.equal(result.rows[1].amount, 300000);
    });

    it("aceita negativo entre parênteses", () => {
      const result = parseCsv(file("Data;Descrição;Valor", "13/08/2026;TARIFA;(12,50)"));

      assert.equal(result.rows[0].amount, -1250);
    });
  });

  describe("parcelas", () => {
    it("reconhece 3/10 e limpa o marcador da descrição", () => {
      const result = parseCsv(file("Data;Descrição;Valor", "13/08/2026;GELADEIRA - 3/10;-250,00"));

      assert.deepEqual(result.rows[0].installment, { current: 3, total: 10 });
      assert.equal(result.rows[0].description, "GELADEIRA");
    });

    it("reconhece 'parcela 3 de 10'", () => {
      const result = parseCsv(file("Data;Descrição;Valor", "13/08/2026;SOFA PARCELA 3 DE 10;-100,00"));

      assert.deepEqual(result.rows[0].installment, { current: 3, total: 10 });
      assert.equal(result.rows[0].description, "SOFA");
    });

    it("lê a parcela de coluna própria", () => {
      const result = parseCsv(file("Data;Descrição;Valor;Parcela", "13/08/2026;NOTEBOOK;-500,00;2/12"));

      assert.deepEqual(result.rows[0].installment, { current: 2, total: 12 });
      assert.equal(result.rows[0].description, "NOTEBOOK");
    });

    it("não confunde data no meio da descrição com parcela", () => {
      // "13/08" tem atual maior que total; "2 DE 3" é a parcela de verdade.
      const result = parseCsv(file("Data;Descrição;Valor", "13/08/2026;COMPRA 13/08 PARCELA 2 DE 3;-90,00"));

      assert.deepEqual(result.rows[0].installment, { current: 2, total: 3 });
      assert.equal(result.rows[0].description, "COMPRA 13/08");
    });

    it("rejeita total acima do teto do produto", () => {
      const result = parseCsv(file("Data;Descrição;Valor", "13/08/2026;ALUGUEL 1/60;-90,00"));

      assert.equal(result.rows[0].installment, null);
      assert.equal(result.rows[0].description, "ALUGUEL 1/60");
    });
  });

  describe("cabeçalho ausente", () => {
    it("infere as colunas pela primeira linha de dados", () => {
      const result = parseCsv(file("13/08/2026;MERCADO SAO JOAO;-1.234,56", "14/08/2026;SALARIO;3.000,00"));

      assert.equal(result.rows.length, 2);
      assert.equal(result.rows[0].date, "2026-08-13");
      assert.equal(result.rows[0].description, "MERCADO SAO JOAO");
      assert.equal(result.rows[0].amount, -123456);
      // Nenhuma linha vira descarte: não há cabeçalho para pular.
      assert.deepEqual(reasons(result), []);
    });

    it("escolhe a maior coluna de texto como descrição", () => {
      const result = parseCsv(file("13/08/2026;X;MERCADO SAO JOAO;-10,00"));

      assert.equal(result.rows[0].description, "MERCADO SAO JOAO");
    });
  });

  describe("linhas que não são lançamento", () => {
    it("descarta linha em branco no meio do arquivo", () => {
      const result = parseCsv(
        file("Data;Descrição;Valor", "13/08/2026;MERCADO;-10,00", "", ";;", "14/08/2026;PADARIA;-5,00"),
      );

      assert.equal(result.rows.length, 2);
      assert.deepEqual(reasons(result), ["nao_e_lancamento", "nao_e_lancamento", "nao_e_lancamento"]);
    });

    it("descarta rodapé sem data", () => {
      const result = parseCsv(file("Data;Descrição;Valor", "13/08/2026;MERCADO;-10,00", "TOTAL;;-10,00"));

      assert.equal(result.rows.length, 1);
      assert.deepEqual(reasons(result), ["nao_e_lancamento", "sem_data"]);
    });

    it("descarta linha sem descrição e linha sem valor", () => {
      const result = parseCsv(
        file("Data;Descrição;Valor", "13/08/2026;;-10,00", "14/08/2026;PADARIA;", "15/08/2026;PADARIA;abc"),
      );

      assert.equal(result.rows.length, 0);
      assert.deepEqual(reasons(result), ["nao_e_lancamento", "sem_descricao", "sem_valor", "sem_valor"]);
    });
  });

  describe("robustez de arquivo", () => {
    it("ignora o BOM de UTF-8 no início", () => {
      const bom = String.fromCharCode(0xfeff);
      const result = parseCsv(`${bom}${file("Data;Descrição;Valor", "13/08/2026;MERCADO;-10,00")}`);

      // Sem tirar o BOM, "Data" não seria reconhecido e o cabeçalho viraria dado.
      assert.equal(result.rows.length, 1);
      assert.equal(result.rows[0].description, "MERCADO");
      assert.deepEqual(reasons(result), ["nao_e_lancamento"]);
    });

    it("aceita arquivo com LF, sem quebra no fim", () => {
      const result = parseCsv("Data;Descrição;Valor\n13/08/2026;MERCADO;-10,00");

      assert.equal(result.rows.length, 1);
    });

    it("não inventa linha extra quando o arquivo termina em quebra de linha", () => {
      const result = parseCsv("Data;Descrição;Valor\r\n13/08/2026;MERCADO;-10,00\r\n");

      assert.equal(result.rows.length, 1);
      assert.deepEqual(reasons(result), ["nao_e_lancamento"]);
    });

    it("devolve resultado vazio para texto vazio", () => {
      const result = parseCsv("");

      assert.deepEqual(result, { format: "csv", rows: [], discarded: [] });
    });

    it("não atribui identidade externa a linha de CSV", () => {
      const result = parseCsv(file("Data;Descrição;Valor", "13/08/2026;MERCADO;-10,00"));

      assert.equal(result.rows[0].externalId, null);
      assert.equal(result.rows[0].rawText, "13/08/2026;MERCADO;-10,00");
    });

    it("uma célula estragada descarta só a própria linha", () => {
      // `parseMoney` lança quando o número não cabe na faixa representável.
      // Sem tratamento, uma linha corrompida derrubava o arquivo inteiro e o
      // usuário perdia o extrato todo por causa de um registro.
      const result = parseCsv(
        file("Data;Descrição;Valor", "13/08/2026;NORMAL;-100,00", "14/08/2026;ABSURDO;999999999999999999,00"),
      );

      assert.equal(result.rows.length, 1);
      assert.equal(result.rows[0].description, "NORMAL");
      assert.ok(reasons(result).includes("sem_valor"));
    });

    it("não trata 1/1 como parcelamento", () => {
      // À vista. Aceitar criaria um plano de uma parcela só na tela de
      // acompanhamento — e o parser de OFX já recusava, então os dois estágios
      // estavam divergindo.
      const result = parseCsv(file("Data;Descrição;Valor", "13/08/2026;MERCADO 1/1;-10,00"));

      assert.equal(result.rows[0].installment, null);
      assert.equal(result.rows[0].description, "MERCADO 1/1");
    });
  });
});
