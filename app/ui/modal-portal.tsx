"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

/**
 * Mantém a janela fora de cards com backdrop-filter, transform ou overflow.
 * Esses estilos fazem um elemento fixed se posicionar em relação ao card,
 * em vez de ocupar o centro da janela do navegador.
 */
export function ModalPortal({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  const ready = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  const closeRef = useRef(onClose);
  const hasClose = Boolean(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!ready || !closeRef.current) return;
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]');
    const dialog = dialogs[dialogs.length - 1];
    if (dialog && !dialog.contains(document.activeElement)) {
      const field = dialog.querySelector<HTMLElement>('input:not([disabled]):not([readonly]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]):not([readonly])');
      (field ?? dialog.querySelector<HTMLElement>('button:not([disabled])'))?.focus();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current?.();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, [ready, hasClose]);

  return ready ? createPortal(children, document.body) : null;
}
