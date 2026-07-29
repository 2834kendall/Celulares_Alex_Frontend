'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

/**
 * Suma/resta meses a un "YYYY-MM-01". Fija el dia en 1 ANTES de sumar el mes:
 * si se partiera de un dia como 31 y el mes destino tuviera menos dias,
 * Date corrige de mas (31 ene + 1 mes = 3 mar, no 28/29 feb) — como este hook
 * solo navega por meses completos, el dia siempre es 1, asi que el problema
 * ni se presenta.
 */
function shiftMonth(monthISO: string, deltaMonths: number): string {
  const date = new Date(`${monthISO}T00:00:00`)
  date.setDate(1)
  date.setMonth(date.getMonth() + deltaMonths)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}-01`
}

/** Navegacion mes anterior/siguiente via "?month=", preservando el resto de la query (mismo patron que useDateNavigation con "?date="). */
export function useMonthNavigation(monthISO: string) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isNavigating, startTransition] = useTransition()

  function goToMonth(nextMonthISO: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('month', nextMonthISO)
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }

  return {
    isNavigating,
    goToPreviousMonth: () => goToMonth(shiftMonth(monthISO, -1)),
    goToNextMonth: () => goToMonth(shiftMonth(monthISO, 1)),
  }
}
