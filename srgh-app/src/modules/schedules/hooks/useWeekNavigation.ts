'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useTransition } from 'react'

export function useWeekNavigation(weekStartISO: string) {
  const router = useRouter()
  const pathname = usePathname()
  const [isNavigating, startTransition] = useTransition()

  /** Navega directo a la semana que contiene mondayISO (selector de fecha, "Semana actual"). */
  function goToWeekStart(mondayISO: string) {
    if (mondayISO === weekStartISO) return

    startTransition(() => {
      router.push(`${pathname}?week=${mondayISO}`)
    })
  }

  return {
    isNavigating,
    goToWeekStart,
  }
}
