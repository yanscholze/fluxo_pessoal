import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { WEB_SESSION_COOKIE, webIdentityFromToken, type FluxoUser } from "../lib/app-auth";

/**
 * Server Component-friendly replacement for chatgpt-auth.ts.
 *
 * The original template gated /conectar-android behind Sign in with ChatGPT
 * (SIWC), which only works when the app is hosted inside OpenAI's Sites
 * dispatcher. This uses the app's own email/password session (the same
 * `fluxo_session` cookie already used by /api/auth) so the page works on any
 * host: local dev, Cloudflare Workers, wherever.
 */
export async function getSiteUser(): Promise<FluxoUser | null> {
  const store = await cookies();
  const token = store.get(WEB_SESSION_COOKIE)?.value ?? null;
  return webIdentityFromToken(token);
}

export async function requireSiteUser(returnTo: string): Promise<FluxoUser> {
  const user = await getSiteUser();
  if (user) return user;

  redirect(signInPath(returnTo));
}

function signInPath(returnTo: string): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  // The site's login form lives on "/" itself; HomePage reads "return_to"
  // and forwards there once the user authenticates (see app/page.tsx).
  return `/?return_to=${encodeURIComponent(safeReturnTo)}`;
}

function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";

  let url: URL;
  try {
    url = new URL(value, "https://app.local");
  } catch {
    return "/";
  }
  if (url.origin !== "https://app.local") return "/";

  return `${url.pathname}${url.search}${url.hash}`;
}
