import { Page } from "../ui/page-frame.tsx";
import { Panel, Skeleton } from "../ui/primitives.tsx";

/**
 * Estado de carregamento das telas do painel.
 *
 * O esqueleto tem a **forma** do conteúdo que vai substituí-lo: cabeçalho,
 * faixa de indicadores e dois blocos. Um spinner centralizado não diz nada e
 * ainda faz a página saltar quando o conteúdo chega; um esqueleto com a
 * silhueta certa mantém o layout parado e já ensina onde olhar.
 *
 * Todas as rotas do grupo herdam este arquivo, então uma tela nova nasce com
 * estado de carga sem ninguém precisar lembrar.
 */
export default function Carregando() {
  return (
    <Page>
      <header className="mb-6">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="mt-2 h-5 w-56" />
      </header>

      <div className="grid gap-px overflow-hidden rounded-panel border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((indice) => (
          <div key={indice} className="bg-surface p-4 sm:p-5">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="mt-3 h-7 w-32" />
            <Skeleton className="mt-2.5 h-2.5 w-full max-w-[13rem]" />
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="mt-5 h-[11.5rem] w-full rounded-md" />
        </Panel>
        <Panel>
          <Skeleton className="h-3.5 w-32" />
          <div className="mt-5 space-y-3">
            {[0, 1, 2, 3, 4].map((indice) => (
              <div key={indice} className="flex items-center justify-between gap-4">
                <Skeleton className="h-3 w-full max-w-[9rem]" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <span className="sr-only" role="status">
        Carregando
      </span>
    </Page>
  );
}
