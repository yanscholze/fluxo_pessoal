"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";

import { join } from "./primitives.tsx";

export type SectionTab = { readonly value: string; readonly label: string };

/** Navigation between related views: the selected view remains shareable and survives refresh. */
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
    <nav ref={navigation} aria-label={label} className="flex gap-1 overflow-x-auto border-b border-line">
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
              "relative inline-flex min-h-11 shrink-0 items-center justify-center border-b-2 px-4 py-2.5 text-body-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
              selected
                ? "border-accent text-accent"
                : "border-transparent text-ink-muted hover:border-line-strong hover:text-ink",
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
        {eyebrow ? <p className="mb-1 text-caption font-medium text-ink-subtle">{eyebrow}</p> : null}
        {description ? <p className="max-w-measure-lg text-body-sm text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
