'use client'

import { useCallback, useSyncExternalStore } from 'react'

/** Una etapa (su id) o el grupo de postulaciones sin columna. */
export type BoardTab = number | 'unplaced'

/*
 * Qué etapa se está mirando en la vista de celular del tablero.
 *
 * Vive fuera del componente a propósito: abrir la ficha de un candidato y
 * volver desmonta el tablero, y sin esto se volvía siempre a la primera
 * etapa. Dura lo que dure la pestaña del navegador — es una posición de
 * lectura, no una preferencia que valga la pena guardar.
 */
let current: BoardTab | null = null
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useBoardTab() {
  const tab = useSyncExternalStore(
    subscribe,
    () => current,
    () => null
  )

  const select = useCallback((next: BoardTab) => {
    current = next
    listeners.forEach((listener) => listener())
  }, [])

  return [tab, select] as const
}

/** Solo para pruebas: cada una arranca sin etapa elegida. */
export function resetBoardTab() {
  current = null
}
