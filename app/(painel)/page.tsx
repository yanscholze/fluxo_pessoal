import { isConfigured } from "../../server/services/ai/client.ts";
import { quotaStatus } from "../../server/services/ai/quota.ts";
import { buildDashboard } from "../../server/services/dashboard.ts";
import { buildGoalsView } from "../../server/services/goals.ts";
import { readTarsPendingCounts } from "../../server/services/tars.ts";
import { currentUser } from "../auth-context.ts";
import { Page } from "../ui/page-frame.tsx";
import { AssistantTools } from "../ui/tars/assistant-tools.tsx";
import { TarsOverview } from "../ui/tars/tars-overview.tsx";
import styles from "../ui/tars/tars.module.css";

/** A home sempre pertence à identidade da requisição. */
export const dynamic = "force-dynamic";

export default async function Tars() {
  const user = await currentUser();
  if (!user) return null;

  const now = new Date();
  const assistantReady = isConfigured();
  const [dashboard, goals, pending, advice, receipt] = await Promise.all([
    buildDashboard(user.id, now),
    buildGoalsView(user.id, now),
    readTarsPendingCounts(user.id),
    assistantReady ? quotaStatus(user.id, "advice") : null,
    assistantReady ? quotaStatus(user.id, "receipt") : null,
  ]);

  return (
    <Page width="wide" className={styles.page}>
      <TarsOverview
        firstName={user.displayName.trim().split(/\s+/)[0]}
        dashboard={dashboard}
        goals={goals}
        pending={pending}
        assistantReady={assistantReady}
      />
      <AssistantTools advice={advice} receipt={receipt} />
    </Page>
  );
}
