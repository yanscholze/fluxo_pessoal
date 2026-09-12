"use client";

/**
 * Acertar o saldo de pontos de um cartão.
 *
 * O Fluxo apura os pontos somando o que cada compra rendeu, e é assim que ele
 * explica de onde veio cada ponto. Mas ninguém abre um app de finanças no mesmo
 * dia em que abre o cartão: há sempre um saldo que veio de antes, e há as
 * pontuações que o emissor credita por fora — bônus, campanha, transferência de
 * parceiro — que compra nenhuma explica.
 *
 * O campo que guarda isso é o saldo anterior, e ele vivia no cadastro do
 * cartão. Estava no lugar errado: a pergunta "isto bate com o meu extrato de
 * pontos?" se faz **olhando o saldo**, não editando o cartão. Aqui o dono
 * informa o que o emissor mostra, e o Fluxo ajusta a abertura pela diferença.
 *
 * Diferente do acerto de conta, este não vira lançamento: ponto não passa pelo
 * razão, porque não é dinheiro.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Field, Input } from "../../ui/controls.tsx";
import { Dialog } from "../../ui/dialog.tsx";
import { decimal } from "../../ui/format.ts";
import { Notice } from "../../ui/primitives.tsx";

/** Pontos são guardados em milésimos para não arredondar a cada compra. */
const MILLI = 1000;

export function PointsCheck({
  cardId,
  cardName,
  balanceMilli,
  openingMilli,
}: {
  cardId: string;
  cardName: string;
  balanceMilli: number;
  openingMilli: number;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [real, setReal] = useState(String(Math.round(balanceMilli / MILLI)));
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const informado = Math.round(Number(real.replace(/\D/g, "")) || 0);
  const diferenca = informado * MILLI - balanceMilli;

  /**
   * A nova abertura.
   *
   * O saldo mostrado é `abertura + ganho − resgatado`. Para que ele passe a ser
   * o número informado, basta mover a abertura pela diferença — o que o app
   * apurou continua intacto, e é isso que mantém o histórico explicável.
   *
   * Não desce abaixo de zero: uma abertura negativa serviria para esconder
   * pontos apurados a mais, e o lugar de corrigir isso é a compra que os gerou.
   */
  const novaAbertura = Math.max(0, openingMilli + diferenca);

  async function acertar() {
    setEnviando(true);
    setErro(null);

    const resposta = await fetch(`/api/v1/cards/${cardId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pointsOpeningMilli: novaAbertura }),
    });

    setEnviando(false);

    if (!resposta.ok) {
      const corpo = (await resposta.json().catch(() => ({}))) as { error?: { message?: string } };
      setErro(corpo.error?.message ?? "Não foi possível acertar o saldo.");
      return;
    }

    setAberto(false);
    router.refresh();
  }

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setAberto(true)}>
        Acertar pontos
      </Button>

      <Dialog
        open={aberto}
        onClose={() => setAberto(false)}
        title={`Acertar os pontos do ${cardName}`}
        description="O Fluxo soma o que cada compra rendeu. Informe o que o emissor mostra e a diferença entra como saldo anterior."
        width="sm"
        footer={
          <Button variant="primary" busy={enviando} onClick={() => void acertar()} disabled={diferenca === 0}>
            {diferenca === 0 ? "Sem diferença" : "Acertar"}
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label="Saldo no Fluxo hoje" htmlFor={`pontos-atual-${cardId}`}>
            <Input
              id={`pontos-atual-${cardId}`}
              value={decimal(balanceMilli / MILLI, 0)}
              readOnly
              className="tabular text-right"
            />
          </Field>

          <Field
            label="Saldo que o emissor mostra"
            htmlFor={`pontos-real-${cardId}`}
            hint="O número do aplicativo do banco, agora."
          >
            <Input
              id={`pontos-real-${cardId}`}
              type="number"
              min={0}
              value={real}
              autoFocus
              onChange={(evento) => setReal(evento.target.value)}
              className="tabular text-right"
            />
          </Field>

          {diferenca !== 0 ? (
            <Notice tone="info">
              O saldo anterior passa de {decimal(openingMilli / MILLI, 0)} para{" "}
              {decimal(novaAbertura / MILLI, 0)} pontos. O que cada compra rendeu não muda — é o
              pedaço que o Fluxo não apurou que se ajusta.
            </Notice>
          ) : null}

          {erro ? <Notice tone="negative">{erro}</Notice> : null}
        </div>
      </Dialog>
    </>
  );
}
