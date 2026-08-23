import { SYNC_API_VERSION, SYNC_SCHEMA_VERSION, MAX_SYNC_MUTATIONS } from "../../../lib/sync-v1";

export async function GET() {
  return Response.json({
    name: "Fluxo API",
    apiVersion: SYNC_API_VERSION,
    schemaVersion: SYNC_SCHEMA_VERSION,
    status: "ready",
    capabilities: {
      authentication: ["sites", "mobile-device"],
      syncEntities: ["transaction"],
      syncMode: "full-snapshot-with-outbox",
      maxMutationsPerBatch: MAX_SYNC_MUTATIONS,
      mobileAuthentication: "browser-authorization",
    },
  }, { headers: { "cache-control": "no-store", "x-fluxo-api-version": SYNC_API_VERSION } });
}
