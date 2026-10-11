'use client'

import { useSyncExternalStore } from 'react'

// Debajo de `sm` (640px): el mismo corte que usan las clases de Tailwind.
const PHONE_QUERY = '(max-width: 639.98px)'

function subscribe(listener: () => void) {
  const query = window.matchMedia(PHONE_QUERY)
  query.addEventListener?.('change', listener)
  return () => query.removeEventListener?.('change', listener)
}

/**
 * ¿La pantalla tiene ancho de celular?
 *
 * Para cuando el celular necesita OTRA interfaz y no la misma acomodada (lo
 * que se resuelve con clases `sm:`): montar las dos y esconder una duplica el
 * contenido para lectores de pantalla y para las pruebas.
 *
 * Devuelve `null` mientras no se sabe — en el servidor y durante la
 * hidratación, que no conocen el ancho. Quien lo usa debe pintar ahí algo que
 * sirva para los dos casos (por ejemplo ambas variantes, cada una escondida
 * por CSS en el ancho que no le toca) para que no haya un salto al cargar.
 */
export function useIsPhone(): boolean | null {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => null
  )
}
