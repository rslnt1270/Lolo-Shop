"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Comportamiento de diálogo modal: Esc cierra, Tab queda dentro, el scroll del fondo se bloquea
 * y, al cerrar, el foco vuelve al elemento que lo tenía al abrir.
 * Se monta junto con el diálogo (el componente solo existe mientras está abierto).
 */
export function useDialog<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const dialog = ref.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusables = () => (dialog ? Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)) : []);
    (focusables()[0] ?? dialog)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !dialog) return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !dialog.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !dialog.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, []);

  return ref;
}
