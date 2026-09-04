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
  const anterior = useRef<HTMLElement | null>(null);

  const fechar = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    if (!open) return;

    anterior.current = document.activeElement as HTMLElement | null;
    const rolagem = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // O primeiro foco vai para dentro do diálogo. Sem isto, quem navega por
    // teclado continua no botão que abriu — atrás do véu, fora do alcance.
    const primeiro = painel.current?.querySelector<HTMLElement>(FOCALIZAVEIS);
    primeiro?.focus();

    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape") {
        evento.preventDefault();
        fechar();
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

          {footer ? <div className="mt-6 flex justify-end gap-2">{footer}</div> : null}
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
