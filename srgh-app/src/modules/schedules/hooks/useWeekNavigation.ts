'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toISODate } from '@/modules/schedules/lib/week'

function shiftWeek(weekStartISO: string, deltaWeeks: number) {
  const monday = new Date(`${weekStartISO}T00:00:00`)
  monday.setDate(monday.getDate() + deltaWeeks * 7)
  return toISODate(monday)
}

export function useWeekNavigation(weekStartISO: string) {
  const router = useRouter()
  const pathname = usePathname()
  const [isNavigating, startTransition] = useTransition()

  function goToWeek(deltaWeeks: number) {
    const nextWeek = shiftWeek(weekStartISO, deltaWeeks)

    startTransition(() => {
      router.push(`${pathname}?week=${nextWeek}`)
    })
  }

  return {
    isNavigating,
    goToPreviousWeek: () => goToWeek(-1),
    goToNextWeek: () => goToWeek(1),
  }
}
