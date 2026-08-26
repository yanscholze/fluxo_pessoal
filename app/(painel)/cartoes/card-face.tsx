/**
 * A face do cartão.
 *
 * Existe por um motivo prático, não decorativo: numa carteira com quatro
 * cartões, ler "Nubank Roxinho" numa lista de texto é mais lento do que
 * reconhecer a cor. O cérebro identifica o objeto físico antes de ler o nome —
 * e é assim que a pessoa procura o cartão no bolso.
 *
 * A proporção é a do cartão real (85,6 × 53,98 mm). Fugir dela produz um
 * retângulo que *lembra* um cartão sem ser um, que é pior do que não ter.
 */

import { competenceShort, dateShort, money } from "../../ui/format.ts";
import { CircleAlert } from "../../ui/icons.tsx";
import { join } from "../../ui/primitives.tsx";

export type FaceData = {
  readonly name: string;
  readonly brand: string | null;
  readonly last4: string | null;
  readonly color: string;
  readonly kind: string;
  readonly isPrimary: boolean;
  /** Datas da fatura ativa, já resolvidas para dia útil. */
  readonly closingOn: string | null;
  readonly dueOn: string | null;
  /** Fatura aberta. Nula num cartão de débito. */
  readonly invoice: { competence: string; outstandingCents: number } | null;
  readonly overdueCount: number;
};

export function CardFace({
  data,
  selected,
  onSelect,
  id,
}: {
  data: FaceData;
  selected?: boolean;
  onSelect?: () => void;
  id?: string;
}) {
  const conteudo = (
    <>
      {/* Brilho diagonal: dá volume ao plástico sem virar gradiente chapado. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-linear-to-br from-white/22 via-transparent to-black/25"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-16 size-40 rounded-full bg-white/10 blur-2xl"
      />

      <div className="relative flex h-full flex-col justify-between p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-body font-semibold text-white drop-shadow-sm">{data.name}</p>
            <p className="mt-0.5 text-caption text-white/70">
              {data.kind === "credit" ? "Crédito" : "Débito"}
              {data.isPrimary ? " · principal" : ""}
            </p>
          </div>

          {data.overdueCount > 0 ? (
            <span className="flex shrink-0 items-center gap-1 rounded-sm bg-black/35 px-1.5 py-0.5 text-label uppercase text-white">
              <CircleAlert size={11} strokeWidth={2.2} aria-hidden />
              {data.overdueCount}
            </span>
          ) : (
            <svg viewBox="0 0 20 20" className="size-5 shrink-0 text-white/55" fill="none" aria-hidden>
              <path d="M7 4a9 9 0 0 1 0 12M11 6a5.5 5.5 0 0 1 0 8M14.6 7.6a2.5 2.5 0 0 1 0 4.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          )}
        </div>

        {/* O chip. Pequeno detalhe, mas é o que faz o retângulo virar cartão. */}
        <span
          aria-hidden
          className="h-6 w-8 rounded-xs ring-1 ring-inset ring-black/15"
          style={{ backgroundImage: "linear-gradient(135deg, #e8d5a3, #c9a961)" }}
        />

        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="tabular text-body font-medium tracking-[0.18em] text-white/90">
              {data.last4 ? `•••• ${data.last4}` : "••••"}
            </p>
            <p className="mt-1 text-caption text-white/65">
              {data.kind !== "credit"
                ? "sai direto do saldo"
                : data.closingOn && data.dueOn
                  ? `fecha ${dateShort(data.closingOn as never)} · vence ${dateShort(data.dueOn as never)}`
                  : "sem fatura aberta"}
            </p>
          </div>

          <div className="shrink-0 text-right">
            {data.invoice ? (
              <>
                <p className="text-label uppercase text-white/60">
                  {competenceShort(data.invoice.competence as never)}
                </p>
                <p className="tabular text-body font-semibold text-white">
                  {money(data.invoice.outstandingCents)}
                </p>
              </>
            ) : (
              <p className="text-caption text-white/70">{data.brand ?? ""}</p>
            )}
          </div>
        </div>
      </div>
    </>
  );

  const forma = join(
    "relative aspect-[1.586/1] w-[19rem] shrink-0 overflow-hidden rounded-xl text-left",
    "shadow-float ring-1 ring-inset ring-white/12 transition-[transform,opacity] duration-300 ease-out-soft",
    selected === false ? "scale-[0.94] opacity-55" : "scale-100 opacity-100",
  );

  if (!onSelect) {
    return (
      <div id={id} className={forma} style={{ backgroundColor: data.color }}>
        {conteudo}
      </div>
    );
  }

  return (
    <button
      id={id}
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`Ver ${data.name}`}
      className={join(forma, "cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4")}
      style={{ backgroundColor: data.color }}
    >
      {conteudo}
    </button>
  );
}
