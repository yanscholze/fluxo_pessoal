import { Suspense } from "react";
import { requireChatGPTUser } from "../chatgpt-auth";
import { MobileConnectClient } from "./mobile-connect-client";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function single(value: string | string[] | undefined) {
  return typeof value === "string" ? value.slice(0, 160) : "";
}

async function ProtectedConnect({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const params = {
    deviceId: single(raw.device_id),
    deviceName: single(raw.device_name),
    appVersion: single(raw.app_version),
    state: single(raw.state),
  };
  const returnParams = new URLSearchParams();
  if (params.deviceId) returnParams.set("device_id", params.deviceId);
  if (params.deviceName) returnParams.set("device_name", params.deviceName);
  if (params.appVersion) returnParams.set("app_version", params.appVersion);
  if (params.state) returnParams.set("state", params.state);
  const suffix = returnParams.size ? `?${returnParams}` : "";
  await requireChatGPTUser(`/conectar-android${suffix}`);
  return <MobileConnectClient {...params} />;
}

export default function ConnectAndroidPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<main className="mobile-connect-shell"><p>Preparando conexão segura…</p></main>}>
      <ProtectedConnect searchParams={searchParams} />
    </Suspense>
  );
}
