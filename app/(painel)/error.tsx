"use client";

import { useEffect } from "react";

import { Button } from "../ui/controls.tsx";
import { RefreshCw } from "../ui/icons.tsx";
import { Page } from "../ui/page-frame.tsx";
import { ErrorState } from "../ui/primitives.tsx";

/**
 * Fronteira de erro do painel.
 *
 * Uma tela que falha não pode derrubar a navegação: a casca continua de pé e
 * só a região do conteúdo troca por este aviso. E o aviso oferece a única
 * coisa útil no momento — tentar de novo — em vez de despejar a pilha de
 * chamadas, que não ajuda quem está olhando o próprio dinheiro.
 *
 * O detalhe técnico vai para o console, não para a tela.
 */
export default function ErroDoPainel({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Falha ao renderizar a tela do painel", error);
  }, [error]);

  return (
    <Page width="narrow">
      <div className="pt-10">
        <ErrorState
          title="Não foi possível carregar esta tela"
          hint="Seus dados estão a salvo. Isto foi uma falha ao montar a página, não ao gravar."
          action={
            <Button variant="secondary" icon={RefreshCw} onClick={reset}>
              Tentar de novo
            </Button>
          }
        />
        {error.digest ? (
          <p className="mt-3 text-center text-caption text-ink-subtle">
            Código da falha: <span className="tabular">{error.digest}</span>
          </p>
        ) : null}
      </div>
    </Page>
  );
}
