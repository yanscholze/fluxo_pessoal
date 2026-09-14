"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Field, Input, Select } from "../../ui/controls.tsx";
import { Dialog } from "../../ui/dialog.tsx";
import { decimal, money } from "../../ui/format.ts";

type Tipo = "points" | "cashback";

/** Cashback entra na conta escolhida; pontos afetam só o saldo do cartão. */
export function RedeemForm({
  cardId,
  cardName,
  pointsMilli,
  cashbackCents,
  accounts,
  hasPoints,
  hasCashback,
}: {
  cardId: string;
  cardName: string;
  pointsMilli: number;
  cashbackCents: number;
  accounts: readonly { id: string; name: string }[];
  hasPoints: boolean;
  hasCashback: boolean;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [tipo, setTipo] = useState<Tipo>(hasPoints && pointsMilli >= 1000 ? "points" : hasCashback ? "cashback" : "points");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const disponivel = tipo === "points" ? pointsMilli : cashbackCents;
  const pontosResgataveis = hasPoints && pointsMilli >= 1000;
  const cashbackResgatavel = hasCashback && cashbackCents > 0;
  const semSaldo = !pontosResgataveis && !cashbackResgatavel;
  const semConta = tipo === "cashback" && accounts.length === 0;
  const saldoInsuficiente = tipo === "points" ? pointsMilli < 1000 : cashbackCents < 1;

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (enviando) return;
    setEnviando(true);
    setErro(null);
    const dados = new FormData(evento.currentTarget);

    try {
      const resposta = await fetch("/api/v1/rewards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cardId,
          kind: tipo,
          amount: dados.get("amount"),
          accountId: tipo === "cashback" ? dados.get("accountId") : null,
          note: dados.get("note") || null,
        }),
      });
      if (!resposta.ok) {
        const corpo = (await resposta.json().catch(() => ({}))) as { error?: { message?: string } };
        setErro(corpo.error?.message ?? "Não foi possível registrar o resgate.");
        return;
      }
      setAberto(false);
      router.refresh();
    } catch {
      setErro("Não foi possível confirmar o resgate. Confira a conexão e o histórico antes de tentar novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <Button
        variant="primary"
        onClick={() => { setErro(null); setAberto(true); }}
        disabled={semSaldo}
        title={semSaldo ? "Nenhum saldo resgatável ainda" : undefined}
      >
        Resgatar
      </Button>
      <Dialog
        open={aberto}
        onClose={() => { if (!enviando) setAberto(false); }}
        title={`Resgatar · ${cardName}`}
        description="Registre a recompensa resgatada para manter o saldo atualizado."
        width="sm"
      >
        <form onSubmit={enviar} className="space-y-4">
          {hasPoints && hasCashback ? (
            <Field label="O que resgatar" htmlFor="resgate-tipo">
              <Select id="resgate-tipo" value={tipo} disabled={enviando} onChange={(event) => { setTipo(event.target.value as Tipo); setErro(null); }}>
                <option value="points">Pontos</option>
                <option value="cashback">Cashback</option>
              </Select>
            </Field>
          ) : null}

          <Field
            label={tipo === "points" ? "Quantos pontos" : "Valor do cashback"}
            htmlFor="resgate-valor"
            hint={`Disponível: ${tipo === "points" ? `${decimal(disponivel / 1000, 0)} pontos` : money(disponivel)}`}
          >
            <Input
              key={tipo}
              id="resgate-valor"
              name="amount"
              required
              disabled={enviando}
              inputMode={tipo === "points" ? "numeric" : "decimal"}
              pattern={tipo === "points" ? "[0-9]+" : undefined}
              placeholder={tipo === "points" ? "0" : "0,00"}
              className="tabular"
            />
          </Field>

          {tipo === "cashback" ? (
            <Field label="Conta que recebe" htmlFor="resgate-conta" hint="O cashback entra como receita nesta conta.">
              <Select id="resgate-conta" name="accountId" required disabled={enviando || semConta}>
                {semConta ? <option value="">Cadastre uma conta primeiro</option> : null}
                {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </Select>
            </Field>
          ) : null}

          <Field label="Observação" htmlFor="resgate-nota">
            <Input id="resgate-nota" name="note" maxLength={180} disabled={enviando} placeholder="Passagem, milhas transferidas…" />
          </Field>

          {erro ? <p role="alert" className="rounded-md bg-negative-wash px-3 py-2 text-body-sm text-negative">{erro}</p> : null}
          {saldoInsuficiente ? <p className="text-body-sm text-ink-muted">Ainda não há saldo suficiente para este tipo de resgate.</p> : null}
          <Button type="submit" variant="primary" busy={enviando} disabled={semConta || saldoInsuficiente} className="w-full">
            {enviando ? "Registrando…" : "Registrar resgate"}
          </Button>
        </form>
      </Dialog>
    </>
  );
}
