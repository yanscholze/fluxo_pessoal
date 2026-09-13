"use client";

/**
 * Diálogo e confirmação.
 *
 * Cada tela que precisava de uma sobreposição vinha montando a sua: uma `div`
 * fixa, um véu, um botão invisível atrás para fechar. Funcionava, e por isso
 * mesmo se espalhou — quatro implementações com quatro comportamentos de
 * teclado diferentes, nenhuma delas devolvendo o foco para onde ele estava.
 *
 * Aqui é uma só. Fecha com `Escape`, fecha no véu, trava o foco dentro
 * enquanto está aberta, devolve o foco ao elemento que a abriu e impede a
 * página de rolar por trás.
 */

import { useCallback, useEffect, useRef, type ReactNode } from "react";

import { Button } from "./controls.tsx";
import { Panel, join } from "./primitives.tsx";
import { CircleAlert, X } from "./icons.tsx";

const FOCALIZAVEIS =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Onde o cursor começa.
 *
 * **Não** é o primeiro elemento focalizável: esse é o "Cancelar" do cabeçalho,
 * que vem antes do formulário no documento. Com o foco nele, digitar não
 * escrevia em lugar nenhum e `Enter` fechava o diálogo — a pendência que a
 * pessoa acabou de escrever simplesmente não existia, sem erro nem aviso.
 *
 * A ordem é: o campo que o React já focou por `autoFocus`, depois o primeiro
 * campo **editável**, e só então o primeiro focalizável — que é o caso dos
 * diálogos sem formulário nenhum, como a confirmação de apagar.
 *
 * `readonly` fica de fora, e não é detalhe. Vários diálogos daqui começam
 * mostrando o número que o Fluxo calculou — o saldo de hoje, os pontos de
 * hoje — num campo travado, e só o segundo campo é o que se digita. Cair no
 * primeiro dava exatamente o mesmo sintoma de cair no botão: a pessoa digitava
 * e nada aparecia.
 */
const CAMPOS =
  'input:not([disabled]):not([readonly]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select:not([disabled]), textarea:not([disabled]):not([readonly])';

/** Campos em que `Enter` significa "confirmar", e não "quebrar linha". */
const CONFIRMA_COM_ENTER = new Set([
  "text",
  "search",
  "url",
  "tel",
  "email",
  "password",
  "number",
  "date",
  "month",
  "week",
  "time",
  "datetime-local",
]);

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: "sm" | "md" | "lg";
}) {
  const painel = useRef<HTMLDivElement>(null);
  const rodape = useRef<HTMLDivElement>(null);
  const anterior = useRef<HTMLElement | null>(null);

  /*
   * O `onClose` fica numa referência, e não na dependência do efeito.
   *
   * Quem abre o diálogo quase sempre passa uma seta escrita ali mesmo
   * (`onClose={() => setAberto(false)}`), que é uma função nova a cada render.
   * Com ela na dependência, o efeito de baixo desmontava e remontava a cada
   * tecla digitada — e como ele dá foco ao primeiro campo ao montar, o cursor
   * pulava para o começo do formulário a cada dígito.
   *
   * A referência mantém o comportamento (sempre chama a versão mais recente) e
   * torna `fechar` estável, que é o que o efeito precisa.
   */
  const aoFechar = useRef(onClose);
  useEffect(() => {
    aoFechar.current = onClose;
  }, [onClose]);
  const fechar = useCallback(() => aoFechar.current(), []);

  useEffect(() => {
    if (!open) return;

    anterior.current = document.activeElement as HTMLElement | null;
    const rolagem = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    /*
     * O primeiro foco vai para dentro do diálogo. Sem isto, quem navega por
     * teclado continua no botão que abriu — atrás do véu, fora do alcance.
     *
     * Quem já está dentro fica onde está. É assim que o `autoFocus` de um campo
     * continua valendo: o React o aplica antes deste efeito, e o React 19 não
     * deixa o atributo no HTML para ser procurado depois. Sem esta guarda, o
     * diálogo desfazia a escolha de quem sabia qual campo importa.
     */
    const jaDentro = painel.current?.contains(document.activeElement);
    if (!jaDentro) {
      const primeiro =
        painel.current?.querySelector<HTMLElement>(CAMPOS) ??
        painel.current?.querySelector<HTMLElement>(FOCALIZAVEIS);
      primeiro?.focus();
    }

    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape") {
        evento.preventDefault();
        fechar();
        return;
      }

      /*
       * `Enter` num campo confirma o diálogo.
       *
       * É o gesto que todo formulário tem e que este não tinha: sem um
       * `<form>` por baixo, o navegador não submete nada, então digitar o
       * título e apertar `Enter` não fazia rigorosamente nada — ou pior,
       * disparava o botão que estivesse com o foco.
       *
       * A ação é o último botão habilitado do rodapé, que é onde a ação
       * principal fica por convenção desta interface (o rodapé alinha à
       * direita). Sem rodapé não há o que confirmar, e a tecla segue o seu
       * caminho normal.
       */
      if (evento.key === "Enter") {
        const alvo = evento.target;
        if (!(alvo instanceof HTMLInputElement)) return;
        if (!CONFIRMA_COM_ENTER.has(alvo.type)) return;

        const acoes = [...(rodape.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? [])];
        const principal = acoes[acoes.length - 1];
        if (!principal) return;

        evento.preventDefault();
        principal.click();
        return;
      }

      if (evento.key !== "Tab") return;

      // Trava do foco: `Tab` no último volta para o primeiro, e `Shift+Tab` no
      // primeiro vai para o último. Sem isso o foco escapa para a página de
      // trás, que está inerte, e some da tela.
      const alvos = [...(painel.current?.querySelectorAll<HTMLElement>(FOCALIZAVEIS) ?? [])];
      if (!alvos.length) return;

      const primeiroAlvo = alvos[0];
      const ultimoAlvo = alvos[alvos.length - 1];

      if (evento.shiftKey && document.activeElement === primeiroAlvo) {
        evento.preventDefault();
        ultimoAlvo.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimoAlvo) {
        evento.preventDefault();
        primeiroAlvo.focus();
      }
    }

    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = rolagem;
      anterior.current?.focus();
    };
  }, [open, fechar]);

  if (!open) return null;

  const largura = width === "sm" ? "max-w-md" : width === "lg" ? "max-w-[56rem]" : "max-w-xl";

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-canvas/80 p-4 backdrop-blur-sm sm:p-8">
      <button
        type="button"
        aria-label="Fechar"
        onClick={fechar}
        className="fixed inset-0 -z-10 cursor-default"
      />

      <Panel
        variant="raised"
        className={join("mx-auto w-full animate-rise", largura)}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div ref={painel}>
          <header className="mb-5 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-heading text-ink">{title}</h2>
              {description ? <p className="mt-0.5 text-caption text-ink-muted">{description}</p> : null}
            </div>
            <Button variant="ghost" icon={X} onClick={fechar}>
              Cancelar
            </Button>
          </header>

          {children}

          {footer ? (
            <div ref={rodape} className="mt-6 flex justify-end gap-2">
              {footer}
            </div>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}

/**
 * Confirmação de ação destrutiva.
 *
 * O texto diz **o que será perdido**, não "tem certeza?". Uma pergunta genérica
 * não informa nada e treina o usuário a confirmar no reflexo; dizer "isto vai
 * apagar o lançamento de R$ 120,50 e devolver o valor ao saldo" é o que permite
 * a pessoa perceber que escolheu a linha errada.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  consequence,
  confirmLabel = "Apagar",
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  consequence: string;
  confirmLabel?: string;
  busy?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      width="sm"
      footer={
        <Button variant="danger" onClick={onConfirm} busy={busy}>
          {confirmLabel}
        </Button>
      }
    >
      <p className="flex items-start gap-2.5 text-body text-ink-muted">
        <CircleAlert size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-negative" aria-hidden />
        <span className="max-w-measure">{consequence}</span>
      </p>
    </Dialog>
  );
}
