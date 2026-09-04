"use client";

/**
 * Sessão encerrada.
 *
 * Existe para o layout do painel **não lançar** quando não há sessão.
 *
 * `redirect()` de um Server Component funciona lançando `NEXT_REDIRECT`. O
 * servidor o converte na resposta 307 correta, mas a exceção também sobe pela
 * camada de SSR, que a registra como erro interno — e em desenvolvimento o
 * Vite transmite esse erro para **todas as abas abertas**, pintando a tarja
 * vermelha por cima de um aplicativo que está funcionando. Basta uma
 * requisição sem credencial de qualquer origem — uma aba esquecida, um robô,
 * uma sondagem de ferramenta — para sujar a tela de quem está logado.
 *
 * O desvio de quem chega sem cookie já acontece antes, como resposta HTTP, em
 * `proxy.ts`. Aqui só sobra o caso raro de cookie presente mas inválido —
 * expirado no servidor ou revogado —, e para ele isto é melhor que um desvio
 * mudo: diz o que aconteceu e leva de volta, sem exceção nenhuma.
 */

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { LinkButton } from "../ui/controls.tsx";
import { Page } from "../ui/page-frame.tsx";
import { ErrorState } from "../ui/primitives.tsx";

export function SessionEnded() {
  const router = useRouter();

  // Quem chegou aqui num navegador de verdade vai para o login sozinho. A tela
  // abaixo é o que se vê no intervalo, e o que fica de pé se o JavaScript não
  // rodar.
  useEffect(() => {
    router.replace("/entrar");
  }, [router]);

  return (
    <Page width="narrow">
      <div className="pt-10">
        <ErrorState
          title="Sua sessão terminou"
          hint="Entre de novo para continuar. Seus dados continuam onde estavam."
          action={<LinkButton href="/entrar" variant="primary">Entrar</LinkButton>}
        />
      </div>
    </Page>
  );
}
