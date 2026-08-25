import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cents } from "../../kernel/money.ts";
import {
  type CapturedDraft,
  type NotificationEvent,
  type RecentCapture,
  type SourceRule,
  captureNotification,
  normalize,
} from "./notification.ts";

const AGORA = Date.UTC(2026, 7, 24, 14, 30);

function evento(overrides: Partial<NotificationEvent> = {}): NotificationEvent {
  return {
    sourceApp: "com.nu.production",
    title: "Compra aprovada",
    text: "Compra de R$ 86,50 em MERCADO SAO JOAO no débito",
    postedAt: AGORA,
    ...overrides,
  };
}

function capturar(
  event: NotificationEvent,
  rules: SourceRule[] = [],
  recent: RecentCapture[] = [],
): CapturedDraft {
  const resultado = captureNotification(event, rules, recent);
  assert.equal(resultado.kind, "captured", "esperava captura");
  return (resultado as { kind: "captured"; draft: CapturedDraft }).draft;
}

function motivoDeIgnorar(event: NotificationEvent, rules: SourceRule[] = [], recent: RecentCapture[] = []) {
  const resultado = captureNotification(event, rules, recent);
  return resultado.kind === "ignored" ? resultado.reason : null;
}

describe("captura por notificação", () => {
  describe("cascata de decisão", () => {
    it("ignora app de carteira mesmo com regra do usuário permitindo", () => {
      // A compra já chega pelo app do banco; aceitar as duas duplicaria tudo.
      const carteira = evento({ sourceApp: "com.samsung.android.spay" });
      assert.equal(motivoDeIgnorar(carteira), "carteira");
      assert.equal(
        motivoDeIgnorar(carteira, [{ sourceApp: "com.samsung.android.spay", action: "allow" }]),
        "carteira",
      );
    });

    it("ignora app desconhecido sem regra", () => {
      // Ler notificação de todo app instalado seria invasivo e ruidoso.
      assert.equal(motivoDeIgnorar(evento({ sourceApp: "com.zap.delivery" })), "app_nao_confiavel");
    });

    it("aceita app desconhecido quando o usuário permite", () => {
      const draft = capturar(evento({ sourceApp: "com.banco.novo" }), [
        { sourceApp: "com.banco.novo", action: "allow" },
      ]);
      assert.equal(draft.amount, 8650);
    });

    it("respeita a regra de ignorar um app confiável", () => {
      assert.equal(
        motivoDeIgnorar(evento(), [{ sourceApp: "com.nu.production", action: "ignore" }]),
        "regra_do_usuario",
      );
    });

    it("ignora texto sem valor", () => {
      assert.equal(motivoDeIgnorar(evento({ text: "Sua fatura está disponível" })), "nao_e_transacao");
      assert.equal(motivoDeIgnorar(evento({ text: "Seu pedido foi aprovado" })), "sem_valor");
    });
  });

  describe("aviso que não é transação", () => {
    const avisos = [
      "Seu saldo é de R$ 1.234,56",
      "Seu limite disponível é de R$ 3.500,00",
      "Sua fatura fechou em R$ 892,10",
      "Você tem R$ 45,00 de cashback acumulado",
      "Promoção: até R$ 100,00 de desconto",
    ];

    for (const texto of avisos) {
      it(`ignora "${texto.slice(0, 28)}…"`, () => {
        // "Seu saldo é de R$ 1.234,56" virando despesa é o pior erro possível:
        // o valor é grande e plausível, e o usuário demora a notar.
        assert.equal(motivoDeIgnorar(evento({ text: texto })), "nao_e_transacao");
      });
    }
  });

  describe("extração", () => {
    it("lê o valor em formato brasileiro", () => {
      assert.equal(capturar(evento({ text: "Compra de R$ 1.234,56 em LOJA" })).amount, 123456);
      assert.equal(capturar(evento({ text: "Compra de R$ 9,90 em LOJA" })).amount, 990);
    });

    it("isola o estabelecimento e ganha confiança", () => {
      const draft = capturar(evento({ text: "Compra de R$ 86,50 em MERCADO SAO JOAO" }));
      assert.equal(draft.merchant, "MERCADO SAO JOAO");
      assert.equal(draft.confidence, 0.85);
    });

    it("perde confiança sem estabelecimento", () => {
      const draft = capturar(evento({ title: "Nubank", text: "Compra aprovada de R$ 45,00" }));
      assert.equal(draft.merchant, null);
      assert.equal(draft.confidence, 0.45);
    });

    it("não confunde forma de pagamento com estabelecimento", () => {
      const draft = capturar(evento({ text: "Compra de R$ 45,00 no crédito" }));
      assert.equal(draft.merchant, null);
    });

    it("corta a forma de pagamento do nome do estabelecimento", () => {
      // O nome sujo quebra a comparação de duplicidade: a segunda notificação
      // da mesma compra costuma descrever o pagamento de outro jeito.
      assert.equal(
        capturar(evento({ text: "Compra de R$ 86,50 em MERCADO SAO JOAO no débito" })).merchant,
        "MERCADO SAO JOAO",
      );
      assert.equal(
        capturar(evento({ text: "Compra de R$ 86,50 em Padaria Central no crédito" })).merchant,
        "Padaria Central",
      );
      assert.equal(
        capturar(evento({ text: "Compra de R$ 300,00 em LOJA XYZ em 6x" })).merchant,
        "LOJA XYZ",
      );
    });

    it("preserva nome que contém preposição legítima", () => {
      assert.equal(
        capturar(evento({ text: "Compra de R$ 30,00 em Bar do Zé" })).merchant,
        "Bar do Zé",
      );
    });

    it("identifica quem pagou numa entrada", () => {
      const draft = capturar(evento({ title: "Nubank", text: "Você recebeu R$ 150,00 de Maria Silva" }));
      assert.equal(draft.merchant, "Maria Silva");
      assert.equal(draft.kind, "income");
    });

    it("não confunde o valor com o pagador numa saída", () => {
      // "de" é preposição comum demais: em "Compra de R$ 50,00 em LOJA" ela
      // apontaria para o próprio valor se fosse buscada em qualquer posição.
      const draft = capturar(evento({ text: "Compra de R$ 50,00 em LOJA XYZ" }));
      assert.equal(draft.merchant, "LOJA XYZ");
    });

    it("infere entrada pelo verbo", () => {
      assert.equal(capturar(evento({ text: "Você recebeu R$ 500,00 de João" })).kind, "income");
      assert.equal(capturar(evento({ text: "Pix recebido de R$ 120,00" })).kind, "income");
      assert.equal(capturar(evento({ text: "Compra de R$ 86,50 em LOJA" })).kind, "expense");
    });

    it("infere o método", () => {
      assert.equal(capturar(evento({ text: "Compra de R$ 50,00 no crédito" })).method, "credit");
      assert.equal(capturar(evento({ text: "Pix de R$ 50,00 enviado" })).method, "debit");
      // Boleto sai da conta mesmo quando o texto cita cartão.
      assert.equal(
        capturar(evento({ text: "Boleto de R$ 50,00 pago com cartão" })).method,
        "debit",
      );
      assert.equal(capturar(evento({ text: "Movimentação de R$ 50,00" })).method, "unknown");
    });

    it("reconhece parcelamento em vários formatos", () => {
      assert.deepEqual(capturar(evento({ text: "Compra de R$ 100,00 parcela 3 de 10" })).installment, {
        current: 3,
        total: 10,
      });
      assert.deepEqual(capturar(evento({ text: "Compra de R$ 100,00 em 6x" })).installment, {
        current: 1,
        total: 6,
      });
      assert.equal(capturar(evento({ text: "Compra de R$ 100,00 em LOJA" })).installment, null);
    });

    it("guarda o texto original para o usuário conferir", () => {
      const draft = capturar(evento());
      assert.ok(draft.rawText.includes("Compra aprovada"));
      assert.ok(draft.rawText.includes("MERCADO SAO JOAO"));
    });
  });

  describe("duplicidade", () => {
    const anterior: RecentCapture = {
      amount: cents(8650),
      merchant: "Mercado São João",
      postedAt: AGORA - 60 * 60 * 1000,
    };

    it("ignora a mesma compra chegando de novo na janela", () => {
      // O banco às vezes notifica a autorização e depois a confirmação, com
      // textos diferentes.
      assert.equal(motivoDeIgnorar(evento(), [], [anterior]), "duplicada");
    });

    it("ignora acento e caixa ao comparar o estabelecimento", () => {
      assert.equal(normalize("Mercado São João"), "mercado sao joao");
      assert.equal(motivoDeIgnorar(evento(), [], [anterior]), "duplicada");
    });

    it("aceita a mesma compra fora da janela de três horas", () => {
      const antigo = { ...anterior, postedAt: AGORA - 5 * 60 * 60 * 1000 };
      assert.equal(capturar(evento(), [], [antigo]).amount, 8650);
    });

    it("aceita valores iguais em estabelecimentos diferentes", () => {
      const outro = { ...anterior, merchant: "Padaria Central" };
      assert.equal(capturar(evento(), [], [outro]).amount, 8650);
    });

    it("não descarta dois cafés iguais quando não há estabelecimento", () => {
      // Só o valor não basta: duas compras de R$ 8,50 no mesmo dia são comuns.
      const semEstabelecimento = { amount: cents(850), merchant: null, postedAt: AGORA - 1000 };
      const draft = capturar(
        evento({ title: "Nubank", text: "Compra aprovada de R$ 8,50" }),
        [],
        [semEstabelecimento],
      );
      assert.equal(draft.amount, 850);
    });
  });
});
