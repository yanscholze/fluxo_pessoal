"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";

import { join } from "./primitives.tsx";

export type SectionTab = { readonly value: string; readonly label: string };

/**
 * Troca entre vistas irmãs, na cápsula do Mesa.
 *
 * Não é aba com sublinhado: o desenho resolve esta escolha com uma pílula
 * dentro de uma caixa, e o item escolhido **acende** em vez de ganhar um
 * traço embaixo. A diferença importa porque o sublinhado divide a tela numa
 * linha horizontal que compete com a borda dos painéis logo abaixo.
 *
 * A escolha vive na URL: recarregar não volta para a primeira vista, e o
 * endereço da vista pode ser guardado.
 */
export function SectionTabs({
  basePath,
  tabs,
  active,
  label,
  query,
}: {
  basePath: string;
  tabs: readonly SectionTab[];
  active: string;
  label: string;
  query?: Readonly<Record<string, string | readonly string[] | undefined>>;
}) {
  const navigation = useRef<HTMLElement>(null);
  useEffect(() => {
    const container = navigation.current;
    const selected = container?.querySelector<HTMLElement>('[aria-current="page"]');
    if (container && selected) {
      const left = selected.offsetLeft - container.offsetLeft;
      if (left < container.scrollLeft || left + selected.offsetWidth > container.scrollLeft + container.clientWidth) {
        container.scrollLeft = Math.max(0, left - (container.clientWidth - selected.offsetWidth) / 2);
      }
    }
  }, [active]);

  return (
    <nav
      ref={navigation}
      aria-label={label}
      /* A cápsula rola por dentro no celular em vez de quebrar em duas linhas:
         partida ao meio, ela deixa de ler como um controle só. */
      className="inline-flex max-w-full gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((tab) => {
        const selected = tab.value === active;
        const nextParams = new URLSearchParams();
        for (const [key, value] of Object.entries(query ?? {})) {
          if (typeof value === "string") nextParams.set(key, value);
          else if (value) value.forEach((item) => nextParams.append(key, item));
        }
        nextParams.set("aba", tab.value);
        return (
          <Link
            key={tab.value}
            href={`${basePath}?${nextParams.toString()}`}
            scroll={false}
            aria-current={selected ? "page" : undefined}
            className={join(
              "inline-flex h-9 shrink-0 items-center justify-center rounded-lg px-4 text-caption font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              selected
                ? "bg-accent text-accent-ink"
                : "text-ink-subtle hover:bg-surface-inset hover:text-ink",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Context and actions for an inner view, without repeating the page title or its margins. */
export function SectionIntro({
  eyebrow,
  description,
  actions,
}: {
  eyebrow?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 flex-1">
        {eyebrow ? <p className="metric-label mb-1.5">{eyebrow}</p> : null}
        {description ? <p className="max-w-measure-lg text-body-sm text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
