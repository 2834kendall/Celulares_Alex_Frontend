'use client'

import { useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

/* Separacion del panel respecto del riel y de los bordes de la ventana. */
const GAP = 8

interface RailFlyoutProps {
  /** id del panel: el boton del riel lo referencia con `aria-controls`. */
  id: string
  /** Nombre del grupo, como encabezado del panel. */
  label: string
  /** Boton del riel que lo abrio: lo ubica y recupera el foco al cerrar. */
  anchor: HTMLElement
  /** Abierto con teclado: el foco entra al primer link del panel. */
  focusOnOpen: boolean
  onClose: () => void
  children: React.ReactNode
}

/**
 * Panel que se abre al costado del riel con las subpaginas de un modulo (el
 * riel solo tiene lugar para el icono). Patron "disclosure": el boton lleva
 * `aria-expanded`, y el panel es un grupo de links comun, sin navegacion por
 * flechas, asi que no es un `menu`.
 *
 * Va en un portal a `document.body` con `position: fixed`, por lo mismo que el
 * tooltip del riel (ver RailTooltip): el `<aside>` lo recortaria y su
 * contexto de apilamiento lo dejaria debajo de los encabezados sticky.
 *
 * Al estar al final del body, el orden de Tab no lo pone despues del boton:
 * Tab o Shift+Tab en los bordes del panel lo cierran y devuelven el foco al
 * boton, para seguir recorriendo el riel desde ahi.
 */
export function RailFlyout({ id, label, anchor, focusOnOpen, onClose, children }: RailFlyoutProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  // onClose cambia en cada render del padre: el ref evita volver a suscribir
  // los listeners del documento por eso.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  // Antes de pintar, para que no aparezca un cuadro en otro lado. Junto al
  // borde del riel, a la altura del boton, sin salirse por abajo.
  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const rect = anchor.getBoundingClientRect()
    const edge = anchor.closest('[data-rail-area]')?.getBoundingClientRect().right ?? rect.right
    const maxTop = window.innerHeight - panel.offsetHeight - GAP
    panel.style.top = `${Math.max(GAP, Math.min(rect.top, maxTop))}px`
    panel.style.left = `${edge + GAP}px`
  }, [anchor])

  useEffect(() => {
    if (focusOnOpen) panelRef.current?.querySelector<HTMLElement>('a, button')?.focus()
  }, [focusOnOpen])

  useEffect(() => {
    const dismiss = () => onCloseRef.current()
    // El boton queda afuera: su propio clic ya alterna el panel.
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!panelRef.current?.contains(target) && !anchor.contains(target)) dismiss()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    // Captura: cualquier scroll (el del riel incluido) lo dejaria desubicado.
    window.addEventListener('scroll', dismiss, true)
    window.addEventListener('resize', dismiss)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('scroll', dismiss, true)
      window.removeEventListener('resize', dismiss)
    }
  }, [anchor])

  function closeToAnchor() {
    anchor.focus()
    onClose()
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeToAnchor()
      return
    }
    if (event.key !== 'Tab') return
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('a, button'))
    const edge = event.shiftKey ? items[0] : items[items.length - 1]
    if (document.activeElement === edge) {
      event.preventDefault()
      closeToAnchor()
    }
  }

  // El foco se fue a otro control (no al boton, que alterna solo).
  function handleBlur(event: React.FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget
    if (next && !event.currentTarget.contains(next) && next !== anchor) onClose()
  }

  return createPortal(
    <div
      ref={panelRef}
      id={id}
      role="group"
      aria-label={label}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      className="animate-fade-in fixed z-50 min-w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg"
    >
      <p
        aria-hidden="true"
        className="px-2.5 pt-1 pb-1.5 text-[10px] font-semibold tracking-widest text-slate-400 uppercase"
      >
        {label}
      </p>
      {children}
    </div>,
    document.body
  )
}

/** Clase de un link dentro del panel. */
export function railFlyoutItemClass(active: boolean): string {
  const color = active
    ? 'bg-brand-50 font-semibold text-brand-700'
    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
  return `block whitespace-nowrap rounded-lg px-2.5 py-2 text-sm transition pointer-coarse:py-3 ${color}`
}
