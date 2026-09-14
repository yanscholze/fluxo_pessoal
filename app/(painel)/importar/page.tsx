import ConsolidatedPage from "../automaticos/page.tsx";

export const dynamic = "force-dynamic";

/** The HTTP redirect lives in proxy.ts; retain a functional fallback for direct rendering. */
export default async function LegacyPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; lote?: string }>;
}) {
  const params = await searchParams;
  return <ConsolidatedPage searchParams={Promise.resolve({ ...params, aba: "importacoes" })} />;
}
