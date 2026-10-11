'use client'

import { createContext, useContext, useMemo } from 'react'
import {
  FORMATO_HORA_DEFAULT,
  formatHora,
  formatRangoHora,
  type FormatoHora,
} from '@/lib/time/formatoHora'

/**
 * Formato de hora de la empresa, disponible para cualquier componente
 * cliente del dashboard sin pasarlo prop por prop.
 *
 * El default del contexto es '24h' A PROPÓSITO: un componente que se
 * renderice fuera del proveedor (los tests de componente, por ejemplo) se
 * comporta exactamente como antes de que existiera la preferencia. Así
 * agregar el formato no obliga a tocar ningún test existente.
 */
const FormatoHoraContext = createContext<FormatoHora>(FORMATO_HORA_DEFAULT)

export function FormatoHoraProvider({
  formato,
  children,
}: {
  formato: FormatoHora
  children: React.ReactNode
}) {
  return <FormatoHoraContext.Provider value={formato}>{children}</FormatoHoraContext.Provider>
}

export function useFormatoHora(): FormatoHora {
  return useContext(FormatoHoraContext)
}

/**
 * Formateadores ya atados al formato de la empresa. Es lo que usan los
 * componentes para PINTAR una hora:
 *
 *   const { hora, rango } = useFormatHora()
 *   <span>{hora(mark.time) ?? '—'}</span>
 *
 * Nunca pasar el resultado a lógica (comparaciones, diffMinutes, valores de
 * inputs): eso trabaja con el "HH:MM" crudo. Ver lib/time/formatoHora.ts.
 */
export function useFormatHora() {
  const formato = useFormatoHora()
  return useMemo(
    () => ({
      formato,
      hora: (value: string | null | undefined) => formatHora(value, formato),
      rango: (inicio: string | null | undefined, fin: string | null | undefined) =>
        formatRangoHora(inicio, fin, formato),
    }),
    [formato]
  )
}
