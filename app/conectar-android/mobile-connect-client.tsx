"use client";

import { useEffect, useState } from "react";
import { Check, LoaderCircle, LockKeyhole, Smartphone } from "lucide-react";

type Device = {
  id: string;
  name: string;
  appVersion?: string;
  lastSeenAt: string;
  revokedAt?: string;
};

type Props = {
  deviceId: string;
  deviceName: string;
  appVersion: string;
  state: string;
  ownerName: string;
};

export function MobileConnectClient(props: Props) {
  const ready = Boolean(props.deviceId && props.deviceName && props.state);
  const [status, setStatus] = useState<"idle" | "authorizing" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [devices, setDevices] = useState<Device[]>([]);

  useEffect(() => {
    if (ready) return;
    fetch("/api/v1/mobile/authorize", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Não foi possível carregar os aparelhos")))
      .then((data) => setDevices(data.devices ?? []))
      .catch(() => setDevices([]));
  }, [ready]);

  async function authorize() {
    setStatus("authorizing");
    setError("");
    try {
      const response = await fetch("/api/v1/mobile/authorize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          deviceId: props.deviceId,
          deviceName: props.deviceName,
          appVersion: props.appVersion,
          state: props.state,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.callbackUrl) throw new Error(data.error || "Não foi possível conectar o celular");
      setStatus("done");
      window.location.href = data.callbackUrl;
    } catch (caught) {
      setStatus("error");
      setError(caught instanceof Error ? caught.message : "Não foi possível conectar o celular");
    }
  }

  return (
    <main className="mobile-connect-shell">
      <section className="mobile-connect-card">
        <div className="mobile-connect-brand"><span>↗</span> Fluxo</div>
        <div className="mobile-connect-icon"><Smartphone size={34} /></div>
        <p className="mobile-connect-eyebrow">APLICATIVO ANDROID</p>
        <h1>{ready ? "Conectar este celular" : "Seus aparelhos"}</h1>
        {ready ? (
          <>
            <p className="mobile-connect-copy">Olá, {props.ownerName}. Confirme para sincronizar seus dados financeiros com segurança neste aparelho.</p>
            <div className="mobile-device-preview">
              <Smartphone size={24} />
              <div><strong>{props.deviceName}</strong><span>Android · Fluxo {props.appVersion || "beta"}</span></div>
              <Check size={20} />
            </div>
            <button className="mobile-connect-primary" onClick={authorize} disabled={status === "authorizing" || status === "done"}>
              {status === "authorizing" ? <LoaderCircle className="mobile-connect-spin" size={20} /> : <LockKeyhole size={20} />}
              {status === "done" ? "Voltando ao aplicativo…" : status === "authorizing" ? "Conectando…" : "Autorizar este celular"}
            </button>
            {error && <p className="mobile-connect-error">{error}</p>}
            <p className="mobile-connect-note">O aparelho recebe uma sessão revogável. Sua senha não é enviada nem armazenada pelo Fluxo.</p>
          </>
        ) : (
          <>
            <p className="mobile-connect-copy">Abra esta página pelo botão “Conectar” dentro do aplicativo Fluxo no Android.</p>
            <div className="mobile-device-list">
              {devices.filter((device) => !device.revokedAt).map((device) => (
                <div className="mobile-device-preview" key={device.id}>
                  <Smartphone size={24} />
                  <div><strong>{device.name}</strong><span>Visto em {new Date(device.lastSeenAt).toLocaleDateString("pt-BR")}</span></div>
                  <Check size={20} />
                </div>
              ))}
              {!devices.some((device) => !device.revokedAt) && <p className="mobile-connect-empty">Nenhum Android conectado ainda.</p>}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
