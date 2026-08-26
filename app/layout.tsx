import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";

import "./globals.css";

/**
 * Plus Jakarta Sans, variável.
 *
 * Humanista, de contornos abertos e terminais levemente arredondados. A
 * escolha anterior era Inter, geométrica e de formas fechadas: correta para
 * densidade, mas endurecia o conjunto ao lado de superfícies arredondadas — a
 * tipografia dizia "painel de sistema" enquanto o resto dizia "produto".
 *
 * O critério que não podia ser abandonado na troca são os algarismos: uma
 * coluna de valores só fica legível quando todo dígito ocupa a mesma largura.
 * Esta família tem `tnum` de verdade, e a classe `.tabular` o aciona. A pilha
 * do sistema não garante isso — no Windows cai em Segoe UI, no Android em
 * Roboto, e a mesma tabela ganha três larguras diferentes.
 *
 * Entra como variável CSS em vez de classe para que `--font-sans`, definida em
 * `globals.css`, continue sendo o único lugar que decide a família.
 */
const fonte = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans-carregada",
  fallback: ["ui-sans-serif", "system-ui", "Segoe UI", "sans-serif"],
});

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
  } catch (e) {
    document.documentElement.dataset.theme = "dark";
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={fonte.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: TEMA_INICIAL }} />
      </head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
