'use client'

import { useFormatHora } from '@/lib/time/FormatoHoraContext'

/**
 * Pinta una hora con el formato de la empresa (12h / 24h).
 *
 * Existe como componente —y no solo como hook— porque varios lugares que
 * muestran horas son componentes de SERVIDOR (MyAttendanceHistory,
 * MyScheduleView, IncidentRow), y ahí un hook no se puede llamar. Un
 * componente de servidor sí puede renderizar esta hoja cliente, y el
 * contexto que monta AppShell le llega igual.
 *
 * Para armar texto (un tooltip, un aria-label) desde un componente cliente,
 * usar `useFormatHora()` directo.
 *
 * `value` es el "HH:MM" crudo de siempre. Nunca pasarle a esto algo que
 * después se vaya a usar para calcular: el resultado es solo para mostrar.
 */
export function Hora({
  value,
  fallback = '—',
}: {
  value: string | null | undefined
  /** Qué mostrar si no hay hora. */
  fallback?: string
}) {
  const { hora } = useFormatHora()
  return <>{hora(value) ?? fallback}</>
}

/** "inicio - fin" con el formato de la empresa. */
export function RangoHora({
  inicio,
  fin,
  fallback = '—',
}: {
  inicio: string | null | undefined
  fin: string | null | undefined
  fallback?: string
}) {
  const { rango } = useFormatHora()
  return <>{rango(inicio, fin) ?? fallback}</>
}
