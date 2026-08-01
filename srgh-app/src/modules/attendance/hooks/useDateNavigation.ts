'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useTransition } from 'react'

function shiftDate(dateISO: string, deltaDays: number) {
  const date = new Date(`${dateISO}T00:00:00`)
  date.setDate(date.getDate() + deltaDays)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function useDateNavigation(dateISO: string) {
  const router = useRouter()
  const pathname = usePathname()
  const [isNavigating, startTransition] = useTransition()

  function goToDate(nextDateISO: string) {
    startTransition(() => {
      router.push(`${pathname}?date=${nextDateISO}`)
    })
  }

  return {
    isNavigating,
    goToPreviousDay: () => goToDate(shiftDate(dateISO, -1)),
    goToNextDay: () => goToDate(shiftDate(dateISO, 1)),
    goToDate,
  }
}
