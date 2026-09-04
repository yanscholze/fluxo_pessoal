import { buildDetailedReport } from "../../../../server/services/reports.ts";
import { currentUser } from "../../../auth-context.ts";
import { competenceShort } from "../../../ui/format.ts";
import { Page, PageHeader } from "../../../ui/page-frame.tsx";
import { DetailedReportBody } from "../detailed-report.tsx";
import { PeriodFilter, parsePeriodo } from "../period-filter.tsx";
import { ReportNav } from "../report-nav.tsx";

export const dynamic = "force-dynamic";

export default async function Relatorio({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const user = await currentUser();
  if (!user) return null;

  const periodo = parsePeriodo((await searchParams).periodo);
  const report = await buildDetailedReport(user.id, "expense", periodo);

  return (
    <Page>
      <PageHeader
        eyebrow={`${competenceShort(report.from)} a ${competenceShort(report.to)}`}
        title="Despesas"
        description="Para onde o dinheiro foi, em que categoria, e quais foram os maiores gastos."
      >
        <ReportNav />
        <div className="mt-3">
          <PeriodFilter base="/relatorios/despesas" atual={periodo} />
        </div>
      </PageHeader>

      <DetailedReportBody report={report} kind="expense" />
    </Page>
  );
}
