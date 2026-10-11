'use client'

import { useState } from 'react'
import { CalendarCheck } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { RangoHora } from '@/components/ui/Hora'
import { cn } from '@/lib/utils/cn'
import { WidgetCard } from '@/modules/dashboard/components/WidgetCard'
import type { MyDayAssignment } from '@/modules/schedules/actions/getMySchedule'
import { WEEKDAY_NAMES } from '@/modules/schedules/lib/week'

function dayLabel(day: MyDayAssignment) {
  if (day.isHoliday) return 'Feriado'
  if (day.isDayOff) return 'Día libre'
  if (!day.startTime || !day.endTime) return 'Sin turno asignado'
  return null
}

/**
 * The signed-in person's own week, Monday to Sunday. The one panel that is
 * about the reader and not about the company: it is what gives a dashboard
 * to the roles that manage nobody.
 */
export function MyWeekWidget({
  days,
  weeklyTotal,
  todayIso,
  step,
}: {
  /** Seven days, Monday first. */
  days: MyDayAssignment[]
  weeklyTotal: number
  todayIso: string
  step?: number
}) {
  const todayIndex = days.findIndex((day) => day.date === todayIso)
  /* The day whose detail is spelled out below the strip. */
  const [selected, setSelected] = useState(todayIndex >= 0 ? todayIndex : 0)
  const detail = days[selected]
  const detailLabel = detail ? dayLabel(detail) : null

  return (
    <WidgetCard icon={CalendarCheck} title="Mi semana" href="/my-schedule" step={step}>
      {days.length === 0 || !detail ? (
        <EmptyState
          size="sm"
          className="mt-4"
          icon={CalendarCheck}
          title="Todavía no tenés horario cargado para esta semana."
        />
      ) : (
        <>
          <div className="mt-4 grid grid-cols-7 gap-1" role="group" aria-label="Días de la semana">
            {days.map((day, index) => {
              const works = Boolean(day.startTime && day.endTime) && !day.isDayOff && !day.isHoliday
              const isToday = index === todayIndex
              const isSelected = index === selected

              return (
                <button
                  key={day.date}
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={`${WEEKDAY_NAMES[index]} ${Number(day.date.slice(8))}`}
                  onClick={() => setSelected(index)}
                  onPointerEnter={() => setSelected(index)}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-xl border px-0.5 py-2 transition duration-200 active:scale-95',
                    isSelected
                      ? '-translate-y-0.5 border-brand-300 bg-brand-50 shadow-sm'
                      : 'border-transparent hover:bg-slate-50'
                  )}
                >
                  <span className="text-[10px] font-semibold text-slate-500 uppercase">
                    {WEEKDAY_NAMES[index].slice(0, 2)}
                  </span>
                  <span
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold tabular-nums',
                      isToday ? 'bg-brand-600 text-white' : 'text-slate-900'
                    )}
                  >
                    {Number(day.date.slice(8))}
                  </span>
                  {/* Works that day or not: a filled dot or a hollow one, so
                      it does not depend on color alone. */}
                  <span
                    className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      works ? 'bg-brand-600' : 'border border-slate-300'
                    )}
                    aria-hidden="true"
                  />
                </button>
              )
            })}
          </div>

          <div
            key={selected}
            className="dash-swap mt-3 rounded-xl bg-slate-50 px-3 py-2.5"
            aria-live="polite"
          >
            <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
              {selected === todayIndex ? 'Hoy' : WEEKDAY_NAMES[selected]}
            </p>
            <p className="mt-0.5 text-sm font-bold text-slate-900">
              {detailLabel ?? <RangoHora inicio={detail.startTime} fin={detail.endTime} />}
            </p>
            {!detailLabel && (
              <p className="mt-0.5 truncate text-xs text-slate-500">
                {[detail.scheduleName, detail.branchName].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>

          <p className="mt-auto pt-3 text-xs text-slate-500">
            Esta semana:{' '}
            <span className="font-bold text-slate-900 tabular-nums">
              {Number.isInteger(weeklyTotal) ? weeklyTotal : weeklyTotal.toFixed(1)} h
            </span>
          </p>
        </>
      )}
    </WidgetCard>
  )
}
