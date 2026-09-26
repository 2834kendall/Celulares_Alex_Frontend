'use client'

import { useEffect, useRef } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Pila de diálogos abiertos. Solo el de arriba responde al teclado: si un
 * ConfirmDialog se abre con un Modal detrás, Escape cierra la confirmación
 * y no las dos ventanas de un golpe.
 */
const stack: symbol[] = []

/**
 * Teclado y foco de un diálogo (Modal, ConfirmDialog):
 *
 * - Escape llama a `onEscape`, salvo que haya un desplegable abierto adentro
 *   (SelectMenu, DatePickerButton, SearchSelect exponen `aria-expanded`):
 *   ahí Escape es de ese control y solo cierra la lista.
 * - Tab no se escapa del panel: sin esto el foco seguía por la página que
 *   quedó detrás del fondo oscuro, donde no se ve.
 * - Al abrir, el foco entra al panel (al panel mismo, no al primer campo:
 *   en el celular enfocar un input abre el teclado sin que nadie lo pidiera).
 *   Si un hijo ya tiene `autoFocus`, se respeta.
 * - Al cerrar, el foco vuelve al botón que abrió el diálogo.
 */
export function useDialog(panelRef: React.RefObject<HTMLElement | null>, onEscape: () => void) {
  const onEscapeRef = useRef(onEscape)
  useEffect(() => {
    onEscapeRef.current = onEscape
  }, [onEscape])

  // Se lee en el primer render, ANTES de que un `autoFocus` del contenido
  // mueva el foco: después ya no se sabría qué botón abrió el diálogo.
  const openerRef = useRef<HTMLElement | null>(
    typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null)
  )

  useEffect(() => {
    const id = Symbol('dialog')
    stack.push(id)
    const panel = panelRef.current
    const opener = openerRef.current

    if (panel && !panel.contains(document.activeElement)) {
      panel.focus({ preventScroll: true })
    }

    function onKeyDown(event: KeyboardEvent) {
      if (stack[stack.length - 1] !== id || !panel) return

      if (event.key === 'Escape') {
        // Un desplegable adentro ya usó este Escape para cerrarse. Hace falta
        // además del chequeo de aria-expanded: React cierra la lista (y
        // repinta) ANTES de que el evento llegue a `document`, así que para
        // cuando se mira el DOM ya no hay nada expandido.
        if (event.defaultPrevented) return
        // DatePickerButton escucha en `document` y todavía no se cerró.
        if (panel.querySelector('[aria-expanded="true"]')) return
        event.preventDefault()
        onEscapeRef.current()
        return
      }

      if (event.key !== 'Tab') return
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (focusables.length === 0) {
        event.preventDefault()
        panel.focus()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement
      const outside = !panel.contains(active) || active === panel

      if (event.shiftKey && (active === first || outside)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || outside)) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      const index = stack.indexOf(id)
      if (index >= 0) stack.splice(index, 1)
      if (opener && opener.isConnected) opener.focus({ preventScroll: true })
    }
  }, [panelRef])
}
