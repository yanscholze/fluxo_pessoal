/**
 * Moldura de página.
 *
 * Toda tela do Fluxo começa igual: largura máxima, respiro, um cabeçalho com
 * título à esquerda e ação primária à direita, e — quando houver — uma barra
 * de filtros logo abaixo. Não é economia de código: é o que faz dezoito telas
 * parecerem a mesma aplicação em vez de dezoito páginas.
 */

import type { ReactNode } from "react";

import { join } from "./primitives.tsx";

/**
 * Largura da coluna de conteúdo.
 *
 * `wide` para telas de tabela, que ganham com o espaço; o padrão para telas
 * de leitura, onde linha longa demais cansa. `narrow` para formulário, que
 * não deve esticar.
 */
export function Page({
  children,
  width = "default",
  className,
}: {
  children: ReactNode;
  width?: "narrow" | "default" | "wide";
  className?: string;
}) {
  const limite = { narrow: "max-w-[48rem]", default: "max-w-[78rem]", wide: "max-w-[92rem]" }[width];
  return (
    <main className={join("mx-auto w-full px-4 pb-16 pt-5 sm:px-6 sm:pb-20 lg:px-8", limite, className)}>
      {children}
    </main>
  );
}

/**
 * Cabeçalho de página.
 *
 * `eyebrow` carrega o contexto temporal — competência, ciclo, período — porque
 * num sistema financeiro "quanto" sem "quando" não quer dizer nada.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow?: ReactNode;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** Barra de filtros ou abas. Aparece abaixo do título, separada. */
  children?: ReactNode;
}) {
  return (
    <header className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          {eyebrow ? <p className="mb-1 text-label uppercase text-ink-subtle">{eyebrow}</p> : null}
          <h1 className="text-title text-ink">{title}</h1>
          {description ? (
            <p className="mt-1 max-w-[62ch] text-body-sm text-ink-muted">{description}</p>
          ) : null}
        </div>
        {/* Sem `shrink-0`: num celular de 375 px, um cabeçalho com navegação de
            competência mais botão de ação não cabe ao lado do título, e impedir
            que o bloco ceda empurra a página inteira para fora da tela. Ele
            quebra para a linha de baixo, que é o comportamento certo. */}
        {actions ? <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children ? <div className="mt-5">{children}</div> : null}
    </header>
  );
}

/**
 * Barra de filtros.
 *
 * Rola horizontalmente no celular em vez de quebrar em três linhas: filtro
 * que empurra o conteúdo para fora da tela deixa de ser atalho.
 */
export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={join(
        "-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 sm:pb-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Título de seção dentro da página.
 *
 * Para agrupar sem emoldurar. É a peça que permite uma tela ter estrutura sem
 * virar uma pilha de caixas — o defeito mais visível da versão anterior.
 */
export function SectionTitle({
  title,
  hint,
  action,
  className,
}: {
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={join("mb-3 flex items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        <h2 className="text-heading text-ink">{title}</h2>
        {hint ? <p className="mt-0.5 text-caption text-ink-muted">{hint}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/**
 * Espaço vertical entre blocos de uma página.
 *
 * Existe para que "quanto respiro entre duas seções" seja uma decisão do
 * sistema, tomada uma vez, e não de cada tela.
 */
export function Stack({
  children,
  gap = "md",
  className,
}: {
  children: ReactNode;
  gap?: "sm" | "md" | "lg";
  className?: string;
}) {
  const espaco = { sm: "space-y-3", md: "space-y-5", lg: "space-y-8" }[gap];
  return <div className={join(espaco, className)}>{children}</div>;
}
