import type { Metadata, Viewport } from "next";

import { ServiceWorker } from "./ui/service-worker.tsx";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fluxo",
  description: "Saiba exatamente quanto você tem, quanto já está comprometido e quanto sobra.",
  /**
   * O manifesto é o que torna o Fluxo instalável — no computador pelo Chrome
   * e pelo Edge, no celular pelo "adicionar à tela inicial". Junto com o
   * service worker, registrado aqui no layout raiz, fecha os requisitos.
   *
   * O registro precisa ser do layout, e não do painel: o Chrome decide se
   * oferece a instalação na **primeira** página que carrega, que é a de login.
   */
  manifest: "/manifest.webmanifest",
  applicationName: "Fluxo",
  appleWebApp: { capable: true, title: "Fluxo", statusBarStyle: "black-translucent" },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icons/icone-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icone-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icone-192.png", sizes: "192x192", type: "image/png" }],
  },
};

/** Um tema só: a barra do navegador acompanha o fundo do Mesa. */
export const viewport: Viewport = { themeColor: "#060209" };

/**
 * A letra escolhida é resolvida antes da primeira pintura.
 *
 * Aplicá-la só depois da hidratação faria a página trocar de fonte na frente
 * de quem está lendo. Este script roda de forma síncrona no `<head>`, então o
 * atributo já está no `<html>` quando o CSS é avaliado.
 *
 * Tema e cor de destaque saíram daqui junto com os controles que os
 * escolhiam: a interface do Mesa tem um tema só e uma cor só. Quem tinha
 * `fluxo:tema` ou `fluxo:acento` guardado simplesmente deixa de ser lido —
 * nenhuma regra de estilo responde mais a esses atributos.
 */
const LETRA_INICIAL = `
(function () {
  try {
    var fonte = localStorage.getItem("fluxo:fonte");
    if (fonte && fonte !== "grotesk") document.documentElement.dataset.font = fonte;
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: LETRA_INICIAL }} />
      </head>
      <body className="min-h-dvh antialiased">
        <ServiceWorker />
        {children}
      </body>
    </html>
  );
}
