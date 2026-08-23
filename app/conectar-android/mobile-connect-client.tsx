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
};

export function MobileConnectClient(props: Props) {
  const ready = Boolean(props.deviceId && props.deviceName && props.state);
  const [status, setStatus] = useState<"idle" | "authorizing" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [devices, setDevices] = useState<Device[]>([]);
  const [checkingLogin, setCheckingLogin] = useState(ready);
  const [authenticatedName, setAuthenticatedName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (ready) {
      fetch("/api/auth", { cache: "no-store" })
        .then(async (response) => response.ok ? response.json() : { authenticated: false })
        .then((data) => setAuthenticatedName(data.authenticated ? data.user?.displayName ?? "Usuário" : ""))
        .finally(() => setCheckingLogin(false));
    } else {
      fetch("/api/v1/mobile/authorize", { cache: "no-store" })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error("Não foi possível carregar os aparelhos")))
        .then((data) => setDevices(data.devices ?? []))
        .catch(() => setDevices([]));
    }
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

  async function loginAndAuthorize() {
    setStatus("authorizing");
    setError("");
    try {
      if (!email.trim() || password.length < 10) throw new Error("Informe seu e-mail e sua senha do Fluxo.");
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "login", email: email.trim(), password }),
      });
      const data = await response.json();
      if (!response.ok || !data.user) throw new Error(data.error || "Não foi possível entrar");
      setAuthenticatedName(data.user.displayName || "Usuário");
      await authorize();
    } catch (caught) {
      setStatus("error");
      setError(caught instanceof Error ? caught.message : "Não foi possível entrar");
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
            <p className="mobile-connect-copy">{checkingLogin ? "Verificando sua conta…" : authenticatedName ? `Olá, ${authenticatedName}. Confirme para sincronizar seus dados financeiros com segurança neste aparelho.` : "Entre com a mesma conta usada no Fluxo Web para autorizar este aparelho."}</p>
            <div className="mobile-device-preview">
              <Smartphone size={24} />
              <div><strong>{props.deviceName}</strong><span>Android · Fluxo {props.appVersion || "beta"}</span></div>
              <Check size={20} />
            </div>
            {!checkingLogin && !authenticatedName && <div className="mobile-connect-login">
              <label>E-mail<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@email.com" /></label>
              <label>Senha<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Sua senha do Fluxo" /></label>
            </div>}
            <button className="mobile-connect-primary" onClick={authenticatedName ? authorize : loginAndAuthorize} disabled={checkingLogin || status === "authorizing" || status === "done"}>
              {status === "authorizing" ? <LoaderCircle className="mobile-connect-spin" size={20} /> : <LockKeyhole size={20} />}
              {status === "done" ? "Voltando ao aplicativo…" : status === "authorizing" ? "Conectando…" : authenticatedName ? "Autorizar este celular" : "Entrar e autorizar"}
            </button>
            {error && <p className="mobile-connect-error">{error}</p>}
            <p className="mobile-connect-note">O aparelho recebe uma sessão revogável. Sua senha permanece somente no acesso seguro da versão Web e não é armazenada no aplicativo.</p>
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
