"use client";

/**
 * Aparência: a família de letra, e só.
 *
 * Aqui havia também um seletor de tema e um de cor de destaque. Os dois saíram
 * quando a interface passou a ser a do Mesa, e por motivos diferentes.
 *
 * **O tema** porque o desenho tem um só — escuro. O botão "Claro" continuava
 * na tela trocando um atributo que nenhuma regra de estilo lia mais: clicava,
 * marcava, e a tela ficava idêntica. Um controle que não muda nada é pior do
 * que a ausência dele, porque ensina que os controles do produto mentem.
 *
 * **A cor de destaque** porque o roxo do Mesa não é mais uma preferência: ele
 * está no gradiente do cartão de crédito, no brilho do orbe do TARS, no halo
 * do fundo. As outras três opções eram valores do tema claro, e escolher
 * "Verde" pintava um verde escuro de tema claro sobre um fundo quase preto.
 *
 * A letra fica, e continua valendo só neste navegador: é escolha de conforto
 * de leitura, não identidade do produto. A preferência é aplicada no `<html>`
 * antes da primeira pintura (ver o script no layout raiz), para a página não
 * trocar de fonte na frente de quem está lendo.
 */

import { gravarPreferencia, usePreferencia } from "../../ui/browser-preference.ts";
import { Check } from "../../ui/icons.tsx";
import { Label } from "../../ui/primitives.tsx";

/**
 * Famílias oferecidas.
 *
 * `tabular` registra se a fonte tem algarismo de largura fixa. Comfortaa e
 * Poppins não têm — os dígitos delas variam quase 11 px —, e por isso o CSS
 * troca só os algarismos por uma face de apoio dentro das tabelas. O texto
 * continua na fonte escolhida; a coluna de valores continua alinhada.
 */
const FONTES = [
  { valor: "grotesk", nome: "Space Grotesk", nota: "Padrão · a do desenho", tabular: true },
  { valor: "figtree", nome: "Figtree", nota: "Humanista · mais neutra", tabular: true },
  { valor: "montserrat", nome: "Montserrat", nota: "Geométrica · sóbria", tabular: true },
  { valor: "poppins", nome: "Poppins", nota: "Geométrica · arredondada", tabular: false },
  { valor: "comfortaa", nome: "Comfortaa", nota: "Muito arredondada", tabular: false },
] as const;

/** A do desenho. É a que vale quando não há atributo nenhum no `<html>`. */
const FONTE_PADRAO = "grotesk";

export function Appearance() {
  // O `<html>` já carrega a escolha aplicada antes da primeira pintura; este é
  // um leitor dela, não uma segunda cópia do estado.
  const fonte = usePreferencia((raiz) => raiz.dataset.font ?? FONTE_PADRAO, FONTE_PADRAO);

  function aplicarFonte(valor: string) {
    gravarPreferencia(
      (raiz) => {
        if (valor === FONTE_PADRAO) raiz.removeAttribute("data-font");
        else raiz.dataset.font = valor;
      },
      "fluxo:fonte",
      valor,
    );
  }

  return (
    <div>
      <Label>Tipografia</Label>
      <p className="mt-1 text-caption text-ink-subtle">
        A amostra usa a própria fonte, com um valor para você conferir os algarismos.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {FONTES.map((opcao) => {
          const ativa = fonte === opcao.valor;
          return (
            <button
              key={opcao.valor}
              type="button"
              onClick={() => aplicarFonte(opcao.valor)}
              aria-pressed={ativa}
              data-font={opcao.valor === FONTE_PADRAO ? undefined : opcao.valor}
              className={`rounded-nested border p-3 text-left transition-colors ${
                ativa
                  ? "border-accent-edge bg-accent-wash"
                  : "border-line-strong bg-surface-sunken hover:bg-surface-inset"
              }`}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-body font-medium text-ink">{opcao.nome}</span>
                {ativa ? <Check size={14} strokeWidth={1.5} className="text-accent" aria-hidden /> : null}
              </span>
              <span className="tabular mt-1 block text-figure-sm text-ink">R$ 1.234,56</span>
              <span className="mt-0.5 block text-caption text-ink-subtle">{opcao.nota}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
