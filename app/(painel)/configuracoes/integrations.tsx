/** Estado das integrações da conta autenticada, sem enviar os segredos ao browser. */
import { integrationStatus } from "../../../server/services/integration-credentials.ts";
import { IntegrationEditor } from "./integration-editor.tsx";

export async function Integrations({ userId }: { userId: string }) {
  return <IntegrationEditor initialStatus={await integrationStatus(userId)} />;
}
