import { redirect } from "next/navigation";

import { InstallApp } from "../ui/install-app.tsx";
import { currentUser } from "../auth-context.ts";
import { ArrowUpRight, CreditCard, Wallet } from "../ui/icons.tsx";
import { join } from "../ui/primitives.tsx";
import { AccessForm } from "./access-form.tsx";

export const dynamic = "force-dynamic";

/**
 * Entrada.
 *
 * É a primeira tela que alguém vê e a única que precisa vender a ideia, então
 * ela não usa a moldura do painel: metade explica o produto, metade recebe o
 * usuário. No celular a coluna de argumento some — quem já tem conta veio
 * entrar, não ler.
 *
 * Os três números do painel de argumento são ilustrativos e a tela diz isso.
 * Um exemplo apresentado como saldo real seria, ironicamente, o defeito que
 * este produto existe para corrigir.
 */
export default async function Entrar() {
  if (await currentUser()) redirect("/");

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/* Fundo de tela, e não de painel: os três cartões de exemplo são
          `surface`, e sobre uma coluna também `surface` eles sumiam. É a mesma
          relação da casca do aplicativo — o halo roxo no alto à esquerda é o
          do `.app-shell`. */}
      <section className="relative hidden flex-col justify-between overflow-hidden border-r border-line bg-canvas p-10 lg:flex xl:p-14">
        <span
          aria-hidden
          className="pointer-events-none absolute -left-40 -top-40 size-[36rem] rounded-full bg-accent/10 blur-3xl"
        />

        <p className="relative flex items-center gap-2.5 text-title text-ink">
          <span className="flex size-8 items-center justify-center rounded-md bg-accent text-accent-ink">
            <svg viewBox="0 0 16 16" className="size-4.5" aria-hidden fill="none">
              <path
                d="M3 11.5c2.2 0 2.6-7 5-7s2.8 7 5 7"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </span>
          Fluxo
        </p>

        <div className="relative max-w-lg">
          <h1 className="text-display text-ink">Quanto você realmente pode gastar hoje?</h1>
          <p className="mt-5 max-w-measure text-body leading-relaxed text-ink-muted">
            O Fluxo separa o que você tem do que já está comprometido. Fatura em aberto, parcela a vencer e
            conta fixa saem da conta antes — o que sobra é seu de verdade.
          </p>

          {/* Cartões soltos, como os indicadores do resto do produto. A conta
              "tenho − comprometido = livre" continua legível pela ordem e pelo
              destaque no terceiro, sem precisar dos três estarem colados. */}
          <ol className="mt-9 grid gap-3 sm:grid-cols-3">
            <Exemplo icone={Wallet} rotulo="Saldo hoje" valor="R$ 8.420" nota="o que existe" />
            <Exemplo icone={CreditCard} rotulo="Comprometido" valor="R$ 3.180" nota="já tem dono" />
            <Exemplo
              icone={ArrowUpRight}
              rotulo="Livre para gastar"
              valor="R$ 5.240"
              nota="a resposta"
              destaque
            />
          </ol>
          <p className="mt-2.5 text-caption text-ink-subtle">Valores ilustrativos.</p>
        </div>

        <p className="relative text-caption text-ink-subtle">
          Saldo, competência e projeção calculados a partir de um único razão.
        </p>
      </section>

      <section className="flex flex-col items-center justify-center gap-6 px-5 py-12 sm:px-10">
        <AccessForm />

        {/*
          O convite de instalação vive aqui, e não só no painel.
          É nesta página que alguém abre o Fluxo pela primeira vez no
          computador, e é aqui que o Chrome decide se oferece a instalação. O
          botão só aparece quando o navegador de fato oferece — instalado ou
          sem suporte, ele some sozinho.
        */}
        <InstallApp />
      </section>
    </main>
  );
}

function Exemplo({
  icone: Icone,
  rotulo,
  valor,
  nota,
  destaque,
}: {
  icone: typeof Wallet;
  rotulo: string;
  valor: string;
  nota: string;
  destaque?: boolean;
}) {
  return (
    <li
      className={join(
        "rounded-nested border p-4",
        destaque ? "border-accent-edge bg-accent-wash" : "border-line bg-surface",
      )}
    >
      <p className="flex items-center gap-1.5 text-label uppercase text-ink-subtle">
        <Icone size={12} strokeWidth={2} aria-hidden />
        {rotulo}
      </p>
      <p className={`tabular mt-1.5 text-figure-sm ${destaque ? "text-accent" : "text-ink"}`}>{valor}</p>
      <p className="mt-0.5 text-caption text-ink-subtle">{nota}</p>
    </li>
  );
}
