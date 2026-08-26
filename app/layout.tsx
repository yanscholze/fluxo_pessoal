import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fluxo",
  description: "Saiba exatamente quanto você tem, quanto já está comprometido e quanto sobra.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#08090b" },
  ],
};

/**
 * O tema é resolvido antes da primeira pintura.
 *
 * Aplicar o tema só depois da hidratação faz a tela piscar branco antes de
 * ficar escura. Este script roda de forma síncrona no `<head>`, então o
 * atributo já está no `<html>` quando o CSS é avaliado.
 */
const TEMA_INICIAL = `
(function () {
  try {
    var salvo = localStorage.getItem("fluxo:tema");
    var escuro = salvo ? salvo === "escuro" : matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme = escuro ? "dark" : "light";
    var acento = localStorage.getItem("fluxo:acento");
    if (acento) document.documentElement.dataset.accent = acento;
    var fonte = localStorage.getItem("fluxo:fonte");
    if (fonte) document.documentElement.dataset.font = fonte;
  } catch (e) {
    document.documentElement.dataset.theme = "dark";
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: TEMA_INICIAL }} />
      </head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
