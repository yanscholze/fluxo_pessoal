import Link from "next/link";

import { COMMITMENT_AREAS } from "./commitment-areas.ts";
import { join } from "./primitives.tsx";

/** Related screens stay one navigation area, with real, shareable routes. */
export function CommitmentTabs({ active }: { active: (typeof COMMITMENT_AREAS)[number]["value"] }) {
  return (
    <nav aria-label="Áreas de compromissos" className="mb-5 flex max-w-full flex-wrap gap-1 rounded-xl border border-line bg-surface p-1">
      {COMMITMENT_AREAS.map((area) => (
        <Link
          key={area.value}
          href={area.href}
          prefetch={false}
          aria-current={active === area.value ? "page" : undefined}
          className={join(
            "inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-caption font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            active === area.value ? "bg-accent text-accent-ink" : "text-ink-subtle hover:bg-surface-inset hover:text-ink",
          )}
        >
          {area.label}
        </Link>
      ))}
    </nav>
  );
}
