import { redirect } from "next/navigation";

import { currentUser } from "../auth-context.ts";
import { AccessForm } from "./access-form.tsx";

export const dynamic = "force-dynamic";

export default async function Entrar() {
  if (await currentUser()) redirect("/");

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <section className="hidden flex-col justify-between bg-surface p-10 lg:flex">
        <p className="text-[1.0625rem] font-semibold tracking-[-0.01em] text-ink">Fluxo</p>

        <div className="max-w-md">
          <h1 className="text-[2rem] font-semibold leading-[1.15] tracking-[-0.025em] text-ink">
            Quanto você realmente pode gastar hoje?
          </h1>
          <p className="mt-4 text-[0.9375rem] leading-relaxed text-ink-muted">
            O Fluxo separa o que você tem do que já está comprometido. Fatura em aberto, parcela a vencer e conta
            fixa saem da conta antes — o que sobra é seu de verdade.
          </p>
        </div>

        <p className="text-[0.75rem] text-ink-subtle">
          Saldo, competência e projeção calculados a partir de um único razão.
        </p>
      </section>

      <section className="flex items-center justify-center px-5 py-12 sm:px-10">
        <AccessForm />
      </section>
    </main>
  );
}
