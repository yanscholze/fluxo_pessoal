/**
 * Contas, no desenho do Mesa.
 *
 * Um cartão por conta, em grade de três, e abaixo a evolução do saldo
 * consolidado. A pergunta continua a mesma — **quanto dinheiro existe agora, e
 * onde** —, o que mudou foi a forma de responder: antes eram duas tabelas
 * largas, agora são cartões.
 *
 * A distinção entre **uso corrente** e **reserva** não podia sumir junto com
 * as tabelas: reserva não é dinheiro de gasto do dia a dia, e tratar as duas
 * como a mesma coisa é o erro que faz alguém achar que tem mais do que tem.
 * Ela sobreviveu na linha de apoio de cada cartão e na barra, que mede a fatia
 * da conta dentro do seu próprio grupo.
 *
 * O "⋯" de cada cartão é o que o desenho põe ali: mais ações. No Fluxo elas
 * são duas — editar a conta e acertar o saldo.
 */

import { type AccountView, buildAccountsView } from "../../../server/services/accounts.ts";
import { currentUser } from "../../auth-context.ts";
import { competenceShort, money } from "../../ui/format.ts";
import {
  Banknote,
  Landmark,
  type LucideIcon,
  PiggyBank,
  TrendingUp,
  Wallet,
} from "../../ui/icons.tsx";
import { MetricTile, PanelHeading } from "../../ui/mesa.tsx";
import { Empty } from "../../ui/primitives.tsx";
import { BalanceCheck } from "./balance-check.tsx";
import { EditAccount } from "./edit-account.tsx";
import { NewAccount } from "./new-account.tsx";

export const dynamic = "force-dynamic";

const TIPO: Record<string, { label: string; icon: LucideIcon }> = {
  checking: { label: "Conta corrente", icon: Landmark },
  savings: { label: "Poupança", icon: PiggyBank },
  cash: { label: "Dinheiro", icon: Banknote },
  benefit: { label: "Benefício", icon: Wallet },
  investment: { label: "Investimento", icon: TrendingUp },
};

/** Poupança e investimento são patrimônio, não dinheiro de gasto do dia a dia. */
const RESERVA = new Set(["savings", "investment"]);

export default async function Contas() {
  const user = await currentUser();
  // O desvio de quem não tem sessão acontece em `proxy.ts`, como resposta
  // HTTP, e o layout mostra o aviso. Lançar aqui viraria exceção na
  // renderização — que o Vite transmite como erro para todas as abas.
  if (!user) return null;

  const view = await buildAccountsView(user.id);
  const meses = view.history.slice(-7);
  const teto = Math.max(...meses.map((ponto) => Math.abs(ponto.balanceCents)), 1);

  return (
    <div className="content-area">
      <div className="mb-5 grid gap-5 md:grid-cols-3">
        <MetricTile
          tom="accent"
          icone={<Wallet className="size-4" aria-hidden />}
          rotulo="Disponível para gastar"
          valor={money(view.totals.spendableCents)}
          apoio="Contas de uso corrente, em reais"
        />
        <MetricTile
          tom="positive"
          icone={<PiggyBank className="size-4" aria-hidden />}
          rotulo="Reservado e investido"
          valor={money(view.totals.investedCents)}
          apoio="Patrimônio, fora do livre para gastar"
        />
        <MetricTile
          tom="caution"
          icone={<TrendingUp className="size-4" aria-hidden />}
          rotulo="Total nas contas"
          valor={money(view.totals.totalCents)}
          apoio={`Posição de ${competenceShort(view.competence)}`}
        />
      </div>

      {view.accounts.length ? (
        <div className="grid gap-5 md:grid-cols-3">
          {view.accounts.map((conta) => (
            <CartaoDeConta
              key={conta.id}
              conta={conta}
              total={
                RESERVA.has(conta.kind) ? view.totals.investedCents : view.totals.spendableCents
              }
            />
          ))}
        </div>
      ) : (
        <section className="glass-panel p-6">
          <Empty
            icon={Landmark}
            title="Nenhuma conta cadastrada"
            hint="Cadastre suas contas para o Fluxo saber quanto você tem."
          />
          <div className="mt-4">
            <NewAccount />
          </div>
        </section>
      )}

      <section className="glass-panel mt-5 p-6">
        <PanelHeading
          titulo="Evolução do saldo consolidado"
          apoio={`Últimos ${meses.length} meses`}
          acao={<NewAccount />}
        />
        {meses.length > 1 ? (
          <div className="flex h-48 items-end gap-3 pt-4">
            {meses.map((ponto) => (
              <div key={ponto.competence} className="group flex h-full flex-1 flex-col justify-end gap-3">
                <div
                  className="relative h-full overflow-hidden rounded-xl bg-surface-inset"
                  title={`${competenceShort(ponto.competence)}: ${money(ponto.balanceCents)}`}
                >
                  <div
                    className="absolute inset-x-0 bottom-0 rounded-xl bg-accent/70 transition-all duration-500 group-hover:bg-accent"
                    style={{ height: `${Math.max((Math.abs(ponto.balanceCents) / teto) * 100, 2)}%` }}
                  />
                </div>
                <span className="text-center text-[10px] text-ink-subtle">
                  {competenceShort(ponto.competence).replace(/\s*de\s*\d+$/, "")}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-body-sm text-ink-subtle">
            Ainda não há meses suficientes para desenhar a evolução.
          </p>
        )}
      </section>
    </div>
  );
}

function CartaoDeConta({ conta, total }: { conta: AccountView; total: number }) {
  const tipo = TIPO[conta.kind] ?? { label: conta.kind, icon: Landmark };
  const Icone = tipo.icon;
  const fatia = total > 0 ? Math.min(100, (Math.abs(conta.balanceCents) / Math.abs(total)) * 100) : 0;

  return (
    <section className="glass-panel p-6">
      <div className="mb-8 flex justify-between">
        <div
          className="grid size-11 place-items-center rounded-xl"
          style={{
            background: `color-mix(in oklab, ${conta.color} 12%, transparent)`,
            color: conta.color,
          }}
        >
          <Icone className="size-5" aria-hidden />
        </div>
        <div className="flex items-start gap-1">
          <EditAccount accountId={conta.id} name={conta.name} color={conta.color} />
          <BalanceCheck
            accountId={conta.id}
            accountName={conta.name}
            balanceCents={conta.balanceCents}
          />
        </div>
      </div>

      <p className="truncate text-body-sm font-medium text-ink">{conta.name}</p>
      <p className="truncate text-caption text-ink-subtle">
        {conta.institution} · {tipo.label}
      </p>
      <p className="tabular mt-5 text-2xl font-medium text-ink">{money(conta.balanceCents)}</p>

      <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-surface-inset">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(fatia, 2)}%`, background: conta.color }}
        />
      </div>
    </section>
  );
}
