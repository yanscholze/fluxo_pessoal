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
  const report = await buildDetailedReport(user.id, "income", periodo);

  return (
    <Page>
      <PageHeader
        eyebrow={`${competenceShort(report.from)} a ${competenceShort(report.to)}`}
        title="Renda"
        description="De onde o dinheiro veio, com que regularidade, e quais foram as maiores entradas."
      >
        <ReportNav />
        <div className="mt-3">
          <PeriodFilter base="/relatorios/renda" atual={periodo} />
        </div>
      </PageHeader>

      <DetailedReportBody report={report} kind="income" />
    </Page>
  );
}
