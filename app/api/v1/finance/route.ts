import { apiIdentityFrom, apiUnauthorized } from "../../../../lib/api-v1-auth";
import { SYNC_API_VERSION } from "../../../../lib/sync-v1";
import { financeDeleteForOwner, financeGetForOwner, financePostForOwner } from "../../finance/route";

function versioned(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("cache-control", "no-store");
  headers.set("x-fluxo-api-version", SYNC_API_VERSION);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export async function GET(request: Request) {
  const identity = await apiIdentityFrom(request);
  if (!identity) return apiUnauthorized();
  return versioned(await financeGetForOwner(request, identity.ownerId));
}

export async function POST(request: Request) {
  const identity = await apiIdentityFrom(request);
  if (!identity) return apiUnauthorized();
  return versioned(await financePostForOwner(request, identity.ownerId));
}

export async function DELETE(request: Request) {
  const identity = await apiIdentityFrom(request);
  if (!identity) return apiUnauthorized();
  return versioned(await financeDeleteForOwner(request, identity.ownerId));
}
