import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseOfx } from "./ofx-parser.ts";
import type { ParsedRow } from "./types.ts";

const EXTRATO_CONTA = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE

<OFX>
<SIGNONMSGSRSV1><SONRS><STATUS><CODE>0<SEVERITY>INFO</STATUS><DTSERVER>20260901103000[-3:BRT]<LANGUAGE>POR</SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><TRNUID>1<STATUS><CODE>0<SEVERITY>INFO</STATUS>
<STMTRS><CURDEF>BRL
<BANKACCTFROM><BANKID>001<ACCTID>0001-12345-6<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST><DTSTART>20260801000000[-3:BRT]<DTEND>20260831235959[-3:BRT]
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260813120000[-3:BRT]
<TRNAMT>-89.90
<FITID>2026081300001
<NAME>SUPERMERCADO SAO JOAO
<MEMO>COMPRA CARTAO DEBITO
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260805
<TRNAMT>4250.00
<FITID>2026080500007
<NAME>SALARIO EMPRESA XYZ
</STMTTRN>
<STMTTRN>
<TRNTYPE>FEE
<DTPOSTED>20260810
<TRNAMT>32.00
<FITID>2026081000003
<NAME>TARIFA PACOTE SERVICOS
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>4128.10<DTASOF>20260831</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

const FATURA_CARTAO = `<OFX>
<CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><CURDEF>BRL
<CCACCTFROM><ACCTID>XXXXXXXXXXXX1234</CCACCTFROM>
<BANKTRANLIST>
<CCSTMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260722000000[-3:BRT]
<TRNAMT>-249.90
<FITID>CC-77120
<NAME>MERCADO LIVRE 3/10
</CCSTMTTRN>
<CCSTMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260710000000[-3:BRT]
<TRNAMT>1200.00
<FITID>CC-77000
<NAME>PAGAMENTO DE FATURA
</CCSTMTTRN>
<CCSTMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260715000000[-3:BRT]
<TRNAMT>-59.90
<FITID>CC-77099
<NAME>NETFLIX.COM
<MEMO>NETFLIX.COM SAO PAULO BR
</CCSTMTTRN>
</BANKTRANLIST>
</CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>`;

/** Monta um bloco mínimo com os campos que o teste quer variar. */
function ofx(fields: string, tag: "STMTTRN" | "CCSTMTTRN" = "STMTTRN"): string {
  return `<OFX><BANKTRANLIST><${tag}>${fields}</${tag}></BANKTRANLIST></OFX>`;
}

/** Um bloco completo em que só a descrição varia. */
function rowWithName(name: string): ParsedRow {
  const result = parseOfx(ofx(`<DTPOSTED>20260813<TRNAMT>-10.00<FITID>X1<NAME>${name}`));
  assert.equal(result.rows.length, 1, `esperava uma linha para "${name}"`);
  return result.rows[0];
}

describe("parser de OFX — extrato de conta", () => {
  const result = parseOfx(EXTRATO_CONTA);

  it("extrai todas as transações e não descarta nada", () => {
    assert.equal(result.format, "ofx");
    assert.equal(result.rows.length, 3);
    assert.deepEqual(result.discarded, []);
  });

  it("lê data, valor com sinal e FITID", () => {
    const [compra] = result.rows;
    assert.equal(compra.date, "2026-08-13");
    assert.equal(compra.amount, -8990, "saída mantém o sinal do arquivo");
    assert.equal(compra.externalId, "2026081300001");
    assert.equal(compra.installment, null);
  });

  it("junta NAME e MEMO na descrição", () => {
    assert.equal(result.rows[0].description, "SUPERMERCADO SAO JOAO - COMPRA CARTAO DEBITO");
    assert.equal(result.rows[1].description, "SALARIO EMPRESA XYZ", "sem MEMO, fica só o NAME");
  });

  it("mantém entrada positiva", () => {
    assert.equal(result.rows[1].amount, 425000);
  });

  it("usa TRNTYPE para dar sinal a valor que veio sem ele", () => {
    const tarifa = result.rows[2];
    assert.equal(tarifa.amount, -3200, "tarifa é saída mesmo com TRNAMT sem sinal");
  });

  it("guarda o trecho original de cada linha", () => {
    assert.ok(result.rows[0].rawText.startsWith("<STMTTRN>"));
    assert.ok(result.rows[0].rawText.includes("SUPERMERCADO SAO JOAO"));
    assert.ok(!result.rows[0].rawText.includes("SALARIO"), "um bloco não invade o seguinte");
  });
});

describe("parser de OFX — fatura de cartão", () => {
  const result = parseOfx(FATURA_CARTAO);

  it("lê blocos CCSTMTTRN", () => {
    assert.equal(result.rows.length, 2);
    assert.equal(result.rows[0].externalId, "CC-77120");
    assert.equal(result.rows[0].amount, -24990);
  });

  it("descarta pagamento de fatura", () => {
    assert.deepEqual(
      result.discarded.map((item) => item.reason),
      ["pagamento_de_fatura"],
    );
    assert.ok(result.discarded[0].rawText.includes("CC-77000"));
  });

  it("não repete NAME dentro de MEMO", () => {
    assert.equal(result.rows[1].description, "NETFLIX.COM SAO PAULO BR");
  });
});

describe("parser de OFX — descrição repetida", () => {
  it("prefere o NAME quando os dois campos dizem o mesmo", () => {
    const result = parseOfx(
      ofx("<DTPOSTED>20260813<TRNAMT>-10.00<NAME>Mercado S&#227;o Jo&#227;o<MEMO>MERCADO SAO JOAO"),
    );
    assert.equal(result.rows[0].description, "Mercado São João");
  });

  it("junta com separador quando os campos trazem coisas diferentes", () => {
    const result = parseOfx(ofx("<DTPOSTED>20260813<TRNAMT>-10.00<NAME>UBER<MEMO>VIAGEM 13 AGO"));
    assert.equal(result.rows[0].description, "UBER - VIAGEM 13 AGO");
  });
});

describe("parser de OFX — entidades HTML", () => {
  it("decodifica nomeadas e numéricas", () => {
    const result = parseOfx(
      ofx("<DTPOSTED>20260813<TRNAMT>-12.34<FITID>E1<NAME>POSTO SHELL &amp; CIA<MEMO>Caf&#233; &quot;forte&quot; do Jo&#227;o&#39;s"),
    );
    assert.equal(result.rows[0].description, `POSTO SHELL & CIA - Café "forte" do João's`);
  });

  it("decodifica hexadecimal e trata &lt; &gt;", () => {
    const result = parseOfx(ofx("<DTPOSTED>20260813<TRNAMT>-12.34<NAME>A &lt;B&gt; C &#x00E9;"));
    assert.equal(result.rows[0].description, "A <B> C é");
  });

  it("não decodifica duas vezes", () => {
    const result = parseOfx(ofx("<DTPOSTED>20260813<TRNAMT>-12.34<NAME>LITERAL &amp;lt;tag&amp;gt;"));
    assert.equal(result.rows[0].description, "LITERAL &lt;tag&gt;");
  });

  it("deixa passar entidade desconhecida sem quebrar", () => {
    const result = parseOfx(ofx("<DTPOSTED>20260813<TRNAMT>-12.34<NAME>PRE&xyzzy;POS"));
    assert.equal(result.rows[0].description, "PRE&xyzzy;POS");
  });
});

describe("parser de OFX — datas", () => {
  it("ignora hora e fuso colados", () => {
    for (const raw of ["20260813", "20260813120000", "20260813000000[-3:BRT]", "20260813235959[-03:EST]"]) {
      const result = parseOfx(ofx(`<DTPOSTED>${raw}<TRNAMT>-1.00<NAME>X`));
      assert.equal(result.rows[0]?.date, "2026-08-13", raw);
    }
  });

  it("não deixa a meia-noite escorregar para o dia anterior", () => {
    const result = parseOfx(ofx("<DTPOSTED>20260801000000[-3:BRT]<TRNAMT>-1.00<NAME>X"));
    assert.equal(result.rows[0].date, "2026-08-01");
  });

  it("descarta data impossível", () => {
    const result = parseOfx(ofx("<DTPOSTED>20260230<TRNAMT>-1.00<NAME>X"));
    assert.deepEqual(
      result.discarded.map((item) => item.reason),
      ["sem_data"],
    );
  });
});

describe("parser de OFX — valores", () => {
  it("lê ponto decimal, vírgula e valor inteiro", () => {
    const casos: ReadonlyArray<readonly [string, number]> = [
      ["-89.90", -8990],
      ["-89,90", -8990],
      ["4250.00", 425000],
      ["1500", 150000],
      ["-0.05", -5],
      ["-1.5", -150],
      ["+12.34", 1234],
    ];
    for (const [raw, expected] of casos) {
      const result = parseOfx(ofx(`<DTPOSTED>20260813<TRNAMT>${raw}<NAME>X`));
      assert.equal(result.rows[0]?.amount, expected, raw);
    }
  });

  it("trata o separador como decimal, não como milhar", () => {
    // "1.500" no OFX é um e meio; ler como mil e quinhentos erraria por mil vezes.
    const result = parseOfx(ofx("<DTPOSTED>20260813<TRNAMT>-1.500<NAME>X"));
    assert.equal(result.rows[0].amount, -150);
  });

  it("lê valor agrupado por milhar, que exportador brasileiro emite", () => {
    // Fora do padrão OFX, mas comum. Descartar como "sem valor" faria sumir a
    // maior linha do arquivo justamente porque ela passou de mil reais.
    const casos: ReadonlyArray<readonly [string, number]> = [
      ["-1.234,56", -123456],
      ["1,234.56", 123456],
      ["-1.234.567,89", -123456789],
    ];
    for (const [raw, expected] of casos) {
      const result = parseOfx(ofx(`<DTPOSTED>20260813<TRNAMT>${raw}<NAME>X`));
      assert.equal(result.rows[0]?.amount, expected, raw);
    }
  });

  it("descarta valor ausente, ilegível ou zerado", () => {
    for (const fields of [
      "<DTPOSTED>20260813<NAME>X",
      "<DTPOSTED>20260813<TRNAMT>abc<NAME>X",
      "<DTPOSTED>20260813<TRNAMT>0.00<NAME>X",
    ]) {
      const result = parseOfx(ofx(fields));
      assert.deepEqual(
        result.discarded.map((item) => item.reason),
        ["sem_valor"],
        fields,
      );
    }
  });

  it("não inverte sinal já declarado pelo arquivo", () => {
    const result = parseOfx(ofx("<TRNTYPE>DEBIT<DTPOSTED>20260813<TRNAMT>-10.00<NAME>X"));
    assert.equal(result.rows[0].amount, -1000);
  });

  it("não mexe em tipo ambíguo de contexto", () => {
    const result = parseOfx(ofx("<TRNTYPE>PAYMENT<DTPOSTED>20260813<TRNAMT>1200.00<NAME>ENVIO PIX"));
    assert.equal(result.rows[0].amount, 120000, "PAYMENT é crédito no cartão e débito na conta");
  });
});

describe("parser de OFX — parcelas", () => {
  it("reconhece os formatos usados pelos emissores", () => {
    const casos: ReadonlyArray<readonly [string, number, number, string]> = [
      ["Mercado 3/10", 3, 10, "Mercado"],
      ["Parcela 3 de 10 Mercado", 3, 10, "Mercado"],
      ["MERCADO PARCELA 3 DE 10", 3, 10, "MERCADO"],
      ["PARC 03/10 POSTO IPIRANGA", 3, 10, "POSTO IPIRANGA"],
      ["LOJA RENNER 3 de 10", 3, 10, "LOJA RENNER"],
      ["COMPRA PARCELADA 3/10", 3, 10, "COMPRA PARCELADA"],
      ["MAGAZINE 1/2", 1, 2, "MAGAZINE"],
      ["MOVEIS 12/48", 12, 48, "MOVEIS"],
    ];
    for (const [name, current, total, cleaned] of casos) {
      const row = rowWithName(name);
      assert.deepEqual(row.installment, { current, total }, name);
      assert.equal(row.description, cleaned, name);
    }
  });

  it("limpa o separador que sobra no lugar do marcador", () => {
    const row = rowWithName("DROGARIA SP - 2/6");
    assert.deepEqual(row.installment, { current: 2, total: 6 });
    assert.equal(row.description, "DROGARIA SP");
  });

  it("prefere o marcador explícito à data no meio da descrição", () => {
    const row = rowWithName("COMPRA 13/08 PARC 3/10");
    assert.deepEqual(row.installment, { current: 3, total: 10 });
    assert.equal(row.description, "COMPRA 13/08");
  });

  it("recusa o que não descreve um parcelamento", () => {
    for (const name of ["ASSINATURA 1/1", "COMPRA 50/60", "PEDIDO 3/2", "TAXA 0/10"]) {
      const row = rowWithName(name);
      assert.equal(row.installment, null, name);
      assert.equal(row.description, name, `${name}: descrição intacta`);
    }
  });

  it("mantém a descrição quando o marcador é tudo o que existe", () => {
    const row = rowWithName("3/10");
    assert.deepEqual(row.installment, { current: 3, total: 10 });
    assert.equal(row.description, "3/10", "melhor uma descrição feia que nenhuma");
  });
});

describe("parser de OFX — descartes", () => {
  it("classifica o motivo de cada bloco incompleto", () => {
    const arquivo = `<OFX><BANKTRANLIST>
<STMTTRN><TRNAMT>-10.00<FITID>A<NAME>SEM DATA</STMTTRN>
<STMTTRN><DTPOSTED>20260813<FITID>B<NAME>SEM VALOR</STMTTRN>
<STMTTRN><DTPOSTED>20260813<TRNAMT>-10.00<FITID>C</STMTTRN>
<STMTTRN><DTPOSTED>20260813<TRNAMT>-10.00<FITID>D<NAME>   <MEMO>  </STMTTRN>
</BANKTRANLIST></OFX>`;
    const result = parseOfx(arquivo);
    assert.deepEqual(result.rows, []);
    assert.deepEqual(
      result.discarded.map((item) => item.reason),
      ["sem_data", "sem_valor", "sem_descricao", "sem_descricao"],
    );
  });

  it("reconhece as formas de pagamento de fatura", () => {
    for (const name of [
      "PAGAMENTO DE FATURA",
      "Pagamento recebido",
      "PAGTO. DE FATURA ANTERIOR",
      "PAGAMENTO EFETUADO",
      "Crédito de pagamento",
      "CREDITO DE PAGAMENTO",
    ]) {
      const result = parseOfx(ofx(`<DTPOSTED>20260813<TRNAMT>1200.00<NAME>${name}`, "CCSTMTTRN"));
      assert.deepEqual(
        result.discarded.map((item) => item.reason),
        ["pagamento_de_fatura"],
        name,
      );
      assert.deepEqual(result.rows, [], name);
    }
  });

  it("mantém o pagamento de fatura quando o arquivo é extrato de conta", () => {
    // Do lado da conta o pagamento é a despesa de verdade: descartá-lo deixaria
    // o saldo do mês com dinheiro que já saiu.
    const result = parseOfx(`<OFX><BANKMSGSRSV1><STMTRS>
<BANKACCTFROM><BANKID>001<ACCTID>0001-12345-6</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260810<TRNAMT>-1200.00<FITID>P1<NAME>PAGAMENTO DE FATURA CARTAO VISA</STMTTRN>
</BANKTRANLIST></STMTRS></BANKMSGSRSV1></OFX>`);
    assert.deepEqual(result.discarded, []);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].amount, -120000);
  });

  it("descarta pagamento de fatura em bloco STMTTRN dentro da seção de cartão", () => {
    const result = parseOfx(`<OFX><CREDITCARDMSGSRSV1><CCSTMTRS>
<CCACCTFROM><ACCTID>XXXXXXXXXXXX1234</CCACCTFROM>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260810<TRNAMT>1200.00<FITID>P2<NAME>PAGAMENTO RECEBIDO</STMTTRN>
</BANKTRANLIST></CCSTMTRS></CREDITCARDMSGSRSV1></OFX>`);
    assert.deepEqual(
      result.discarded.map((item) => item.reason),
      ["pagamento_de_fatura"],
    );
    assert.deepEqual(result.rows, []);
  });

  it("descarta estorno de cartão e preserva o mesmo texto na conta", () => {
    const naFatura = parseOfx(ofx("<DTPOSTED>20260813<TRNAMT>149.90<FITID>E9<NAME>ESTORNO COMPRA LOJA X", "CCSTMTTRN"));
    assert.deepEqual(
      naFatura.discarded.map((item) => item.reason),
      ["estorno"],
    );

    const naConta = parseOfx(ofx("<DTPOSTED>20260813<TRNAMT>149.90<FITID>E9<NAME>ESTORNO COMPRA LOJA X"));
    assert.equal(naConta.rows.length, 1, "na conta o estorno é entrada legítima");
  });

  it("não trata débito como estorno só porque o texto cita devolução", () => {
    const result = parseOfx(ofx("<DTPOSTED>20260813<TRNAMT>-80.00<FITID>E8<NAME>TAXA DEVOLUCAO DE ITEM", "CCSTMTTRN"));
    assert.deepEqual(result.discarded, []);
    assert.equal(result.rows[0].amount, -8000);
  });

  it("não confunde compra comum com pagamento de fatura", () => {
    const result = parseOfx(ofx("<DTPOSTED>20260813<TRNAMT>-10.00<FITID>X1<NAME>PAGAMENTO PIX MERCADO", "CCSTMTTRN"));
    assert.deepEqual(result.discarded, []);
    assert.equal(result.rows[0].description, "PAGAMENTO PIX MERCADO");
  });

  it("trunca o trecho original em 500 caracteres", () => {
    const result = parseOfx(ofx(`<DTPOSTED>20260813<TRNAMT>-10.00<NAME>${"L".repeat(600)}`));
    assert.equal(result.rows[0].rawText.length, 500);
  });
});

describe("parser de OFX — arquivos hostis", () => {
  it("aceita arquivo vazio", () => {
    for (const texto of ["", "   \n\n", "isto não é um OFX", "OFXHEADER:100\n<OFX></OFX>"]) {
      const result = parseOfx(texto);
      assert.deepEqual(result.rows, [], texto);
      assert.deepEqual(result.discarded, [], texto);
      assert.equal(result.format, "ofx");
    }
  });

  it("descarta valor absurdo em vez de derrubar o arquivo inteiro", () => {
    const arquivo = `<OFX><BANKTRANLIST>
<STMTTRN><DTPOSTED>20260801<TRNAMT>99999999999999999<FITID>A<NAME>LIXO</STMTTRN>
<STMTTRN><DTPOSTED>20260802<TRNAMT>-20.00<FITID>B<NAME>BOA</STMTTRN>
</BANKTRANLIST></OFX>`;
    const result = parseOfx(arquivo);
    assert.deepEqual(
      result.discarded.map((item) => item.reason),
      ["sem_valor"],
    );
    assert.equal(result.rows.length, 1, "a linha boa sobrevive à vizinha estragada");
    assert.equal(result.rows[0].externalId, "B");
  });

  it("lê bloco sem tag de fechamento sem engolir o próximo", () => {
    const arquivo = `<OFX><BANKTRANLIST>
<STMTTRN><DTPOSTED>20260801<TRNAMT>-10.00<FITID>A<NAME>PRIMEIRA
<STMTTRN><DTPOSTED>20260802<TRNAMT>-20.00<FITID>B<NAME>SEGUNDA</STMTTRN>
</BANKTRANLIST></OFX>`;
    const result = parseOfx(arquivo);
    assert.equal(result.rows.length, 2);
    assert.deepEqual(
      result.rows.map((row) => row.description),
      ["PRIMEIRA", "SEGUNDA"],
    );
    assert.deepEqual(
      result.rows.map((row) => row.amount),
      [-1000, -2000],
    );
  });

  it("aceita tag em minúscula e arquivo numa linha só", () => {
    const arquivo =
      "<ofx><banktranlist><stmttrn><dtposted>20260813<trnamt>-10.00<fitid>A<name>LOJA</stmttrn></banktranlist></ofx>";
    const result = parseOfx(arquivo);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].description, "LOJA");
  });

  it("dá o mesmo resultado com quebra de linha do Windows", () => {
    const unix = parseOfx(EXTRATO_CONTA);
    const windows = parseOfx(EXTRATO_CONTA.replace(/\n/g, "\r\n"));

    assert.deepEqual(
      windows.rows.map((row) => ({ ...row, rawText: "" })),
      unix.rows.map((row) => ({ ...row, rawText: "" })),
    );
    assert.equal(windows.rows[0].amount, -8990, "o \\r não vaza para dentro do valor");
    assert.equal(windows.rows[0].externalId, "2026081300001");
    assert.equal(windows.rows[0].description, "SUPERMERCADO SAO JOAO - COMPRA CARTAO DEBITO");
  });

  it("aceita conta e cartão no mesmo arquivo", () => {
    const result = parseOfx(`${EXTRATO_CONTA}\n${FATURA_CARTAO}`);
    assert.equal(result.rows.length, 5);
    assert.equal(result.discarded.length, 1);
  });
});
