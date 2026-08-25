"use client";

/**
 * Tema e cor de acento.
 *
 * Guardado no `localStorage` e aplicado no `<html>` antes da primeira pintura
 * (ver o script no layout raiz), para a tela não piscar branco antes de ficar
 * escura.
 *
 * O acento veste apenas o cromo interativo — navegação ativa, ação primária,
 * foco. Positivo e negativo continuam verde e vermelho em qualquer paleta,
 * porque eles não são estilo: são o sinal do dinheiro, e trocá-los junto com o
 * tema faria uma receita ficar azul.
 */

import { useEffect, useState } from "react";

import { SegmentedControl } from "../../ui/controls.tsx";
import { Check, Moon, Sun } from "../../ui/icons.tsx";
import { Label } from "../../ui/primitives.tsx";

/** O padrão não tem atributo: o `:root` do CSS já define o verde. */
const PADRAO = "verde";

const ACENTOS = [
  [PADRAO, "var(--color-accent)", "Verde"],
  ["azul", "#2563eb", "Azul"],
  ["violeta", "#6d4aff", "Violeta"],
  ["ambar", "#b45309", "Âmbar"],
] as const;

type Tema = "claro" | "escuro";

export function Appearance() {
  const [tema, setTema] = useState<Tema>("escuro");
  const [acento, setAcento] = useState<string>(PADRAO);

  useEffect(() => {
    setTema(document.documentElement.dataset.theme === "dark" ? "escuro" : "claro");
    setAcento(document.documentElement.dataset.accent ?? PADRAO);
  }, []);

  function aplicarTema(valor: Tema) {
    setTema(valor);
    document.documentElement.dataset.theme = valor === "escuro" ? "dark" : "light";
    localStorage.setItem("fluxo:tema", valor);
  }

  function aplicarAcento(valor: string) {
    setAcento(valor);
    if (valor === PADRAO) delete document.documentElement.dataset.accent;
    else document.documentElement.dataset.accent = valor;
    localStorage.setItem("fluxo:acento", valor);
  }

  return (
    <div className="space-y-5">
      <div>
        <Label>Tema</Label>
        <div className="mt-2">
          <SegmentedControl
            name="Tema"
            value={tema}
            onChange={aplicarTema}
            options={[
              { value: "claro", label: "Claro", icon: Sun },
              { value: "escuro", label: "Escuro", icon: Moon },
            ]}
          />
        </div>
      </div>

      <div>
        <Label>Cor de destaque</Label>
        <p className="mt-1 text-caption text-ink-subtle">
          Muda apenas o cromo da interface. Receita e despesa continuam verde e vermelho.
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {ACENTOS.map(([valor, cor, rotulo]) => {
            const ativo = acento === valor;
            return (
              <button
                key={valor}
                type="button"
                onClick={() => aplicarAcento(valor)}
                aria-pressed={ativo}
                title={rotulo}
                className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-body-sm transition-colors ${
                  ativo
                    ? "border-accent-edge bg-accent-wash font-medium text-ink"
                    : "border-line-strong bg-surface text-ink-muted hover:bg-surface-inset"
                }`}
              >
                <span
                  className="flex size-4 items-center justify-center rounded-full"
                  style={{ backgroundColor: cor }}
                  aria-hidden
                >
                  {ativo ? <Check size={10} strokeWidth={3} className="text-white" /> : null}
                </span>
                {rotulo}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
