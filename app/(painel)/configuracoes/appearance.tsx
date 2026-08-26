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

/**
 * Famílias oferecidas.
 *
 * `tabular` registra se a fonte tem algarismo de largura fixa. Comfortaa e
 * Poppins não têm — os dígitos delas variam quase 11 px —, e por isso o CSS
 * troca só os algarismos por uma face de apoio dentro das tabelas. O texto
 * continua na fonte escolhida; a coluna de valores continua alinhada.
 */
const FONTES = [
  { valor: "figtree", nome: "Figtree", nota: "Padrão · humanista", tabular: true },
  { valor: "montserrat", nome: "Montserrat", nota: "Geométrica · sóbria", tabular: true },
  { valor: "poppins", nome: "Poppins", nota: "Geométrica · arredondada", tabular: false },
  { valor: "comfortaa", nome: "Comfortaa", nota: "Muito arredondada", tabular: false },
] as const;

const FONTE_PADRAO = "figtree";

type Tema = "claro" | "escuro";

export function Appearance() {
  const [tema, setTema] = useState<Tema>("escuro");
  const [acento, setAcento] = useState<string>(PADRAO);
  const [fonte, setFonte] = useState<string>(FONTE_PADRAO);

  useEffect(() => {
    setTema(document.documentElement.dataset.theme === "dark" ? "escuro" : "claro");
    setAcento(document.documentElement.dataset.accent ?? PADRAO);
    setFonte(document.documentElement.dataset.font ?? FONTE_PADRAO);
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

  function aplicarFonte(valor: string) {
    setFonte(valor);
    if (valor === FONTE_PADRAO) delete document.documentElement.dataset.font;
    else document.documentElement.dataset.font = valor;
    localStorage.setItem("fluxo:fonte", valor);
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
        <Label>Tipografia</Label>
        <p className="mt-1 text-caption text-ink-subtle">
          A amostra usa a própria fonte, com um valor para você conferir os algarismos.
        </p>
        <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
          {FONTES.map((opcao) => {
            const ativa = fonte === opcao.valor;
            return (
              <button
                key={opcao.valor}
                type="button"
                onClick={() => aplicarFonte(opcao.valor)}
                aria-pressed={ativa}
                data-font={opcao.valor === FONTE_PADRAO ? undefined : opcao.valor}
                className={`rounded-md border p-3 text-left transition-colors ${
                  ativa
                    ? "border-accent-edge bg-accent-wash"
                    : "border-line-strong bg-surface hover:bg-surface-inset"
                }`}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-body font-medium text-ink">{opcao.nome}</span>
                  {ativa ? <Check size={14} strokeWidth={2.4} className="text-accent" aria-hidden /> : null}
                </span>
                <span className="tabular mt-1 block text-figure-sm text-ink">R$ 1.234,56</span>
                <span className="mt-0.5 block text-caption text-ink-subtle">{opcao.nota}</span>
              </button>
            );
          })}
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
