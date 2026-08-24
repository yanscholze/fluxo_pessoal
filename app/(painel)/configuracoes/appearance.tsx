"use client";

/**
 * Tema e cor de acento.
 *
 * Guardado no `localStorage` e aplicado no `<html>` antes da primeira pintura
 * (ver o script no layout raiz), para a tela não piscar branco antes de ficar
 * escura.
 */

import { useEffect, useState } from "react";

const ACENTOS = [
  ["roxo", "#7c5cff", "Roxo"],
  ["verde", "#10b981", "Verde"],
  ["azul", "#38bdf8", "Azul"],
  ["ambar", "#fb923c", "Âmbar"],
] as const;

type Tema = "claro" | "escuro";

export function Appearance() {
  const [tema, setTema] = useState<Tema | null>(null);
  const [acento, setAcento] = useState<string>("roxo");

  useEffect(() => {
    setTema(document.documentElement.dataset.theme === "dark" ? "escuro" : "claro");
    setAcento(document.documentElement.dataset.accent ?? "roxo");
  }, []);

  function aplicarTema(valor: Tema) {
    setTema(valor);
    document.documentElement.dataset.theme = valor === "escuro" ? "dark" : "light";
    localStorage.setItem("fluxo:tema", valor);
  }

  function aplicarAcento(valor: string) {
    setAcento(valor);
    // O acento padrão não precisa de atributo: o CSS já o define no `:root`.
    if (valor === "roxo") delete document.documentElement.dataset.accent;
    else document.documentElement.dataset.accent = valor;
    localStorage.setItem("fluxo:acento", valor);
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1.5 text-[0.8125rem] font-medium text-ink">Tema</p>
        <div className="flex gap-1.5">
          {(
            [
              ["claro", "Claro"],
              ["escuro", "Escuro"],
            ] as const
          ).map(([valor, rotulo]) => (
            <button
              key={valor}
              type="button"
              onClick={() => aplicarTema(valor)}
              aria-pressed={tema === valor}
              className={`h-9 rounded-[--radius-control] border px-4 text-[0.8125rem] ${
                tema === valor
                  ? "border-accent bg-accent-wash font-medium text-accent"
                  : "border-line text-ink-muted"
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-[0.8125rem] font-medium text-ink">Cor de destaque</p>
        <div className="flex flex-wrap gap-2">
          {ACENTOS.map(([valor, cor, rotulo]) => (
            <button
              key={valor}
              type="button"
              onClick={() => aplicarAcento(valor)}
              aria-pressed={acento === valor}
              aria-label={rotulo}
              title={rotulo}
              className={`flex h-9 items-center gap-2 rounded-[--radius-control] border px-3 text-[0.8125rem] ${
                acento === valor ? "border-accent text-ink" : "border-line text-ink-muted"
              }`}
            >
              <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: cor }} aria-hidden />
              {rotulo}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
