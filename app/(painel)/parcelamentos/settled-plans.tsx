"use client";

/**
 * Os parcelamentos que já terminaram, atrás de uma flag.
 *
 * A tela responde "quanto ainda falta e quando". Uma compra quitada não
 * participa dessa resposta, e ao longo de alguns anos ela se acumula até
 * empurrar o que ainda está sendo pago para fora do primeiro rolar de tela.
 *
 * Some por padrão, mas não desaparece: a contagem continua visível — é ela que
 * diz que existe algo ali — e um clique traz a lista inteira, para quando a
 * pergunta for "quando foi que terminei de pagar aquilo".
 */

import { useState } from "react";

import type { PlanView } from "../../../server/services/installments.ts";
import { Button } from "../../ui/controls.tsx";
import { ChevronDown, ChevronRight } from "../../ui/icons.tsx";
import { SectionTitle } from "../../ui/page-frame.tsx";
import { PlanCard } from "./plan-card.tsx";

export function SettledPlans({ plans }: { plans: readonly PlanView[] }) {
  const [mostrar, setMostrar] = useState(false);

  return (
    <section>
      <SectionTitle
        title="Quitados"
        hint={`${plans.length} compra${plans.length > 1 ? "s" : ""} que já terminaram de ser pagas`}
        action={
          <Button
            variant="ghost"
            size="sm"
            icon={mostrar ? ChevronDown : ChevronRight}
            aria-expanded={mostrar}
            onClick={() => setMostrar((atual) => !atual)}
          >
            {mostrar ? "Ocultar" : "Mostrar concluídos"}
          </Button>
        }
      />

      {mostrar ? (
        <div className="space-y-4">
          {plans.map((plan) => (
            <PlanCard key={plan.planId} plan={plan} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
