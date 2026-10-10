'use client'

import { useState, type CSSProperties } from 'react'
import { CalendarRange, CircleCheck, TriangleAlert } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn } from '@/lib/utils/cn'
import { CountUp } from '@/modules/dashboard/components/CountUp'
import { CalendarSpot } from '@/modules/dashboard/components/Spots'
import { WidgetCard } from '@/modules/dashboard/components/WidgetCard'
import type { WeekScheduleSummary } from '@/modules/dashboard/lib/extras'

function namesLabel(names: string[], total: number) {
  const rest = total - names.length
  return rest > 0 ? `${names.join(', ')} y ${rest} más` : names.join(', ')
}

/**
 * The week of whoever plans the schedules: how many people work each day,
 * and who was left without a schedule. Pointing at a day reads it out; with
 * nothing pointed at, the panel talks about today.
 */
export function TeamScheduleWidget({
  summary,
  step,
}: {
  summary: WeekScheduleSummary
  step?: number
}) {
  const [hovered, setHovered] = useState<string | null>(null)
  const today = summary.days.find((day) => day.isToday) ?? summary.days[0]
  const shown = summary.days.find((day) => day.date === hovered) ?? today
  const max = Math.max(1, ...summary.days.map((day) => day.working))

  return (
    <WidgetCard icon={CalendarRange} title="Horarios de la semana" href="/schedule" step={step}>
      {summary.rosterSize === 0 ? (
        <EmptyState
          size="sm"
          className="mt-4"
          icon={CalendarRange}
          title="No hay colaboradores con contrato vigente para programar."
        />
      ) : (
        <>
          <div className="mt-4 flex items-center gap-3">
            <CalendarSpot />
            <p className="text-sm text-slate-500">
              <span className="block text-3xl leading-none font-black tracking-tight text-slate-900">
                {/* Remounted per day: the count runs again for the new figure. */}
                <CountUp key={shown.date} value={shown.working} />
                <span className="text-lg font-bold text-slate-400"> / {summary.rosterSize}</span>
              </span>
              {shown.isToday ? 'trabajan hoy' : `trabajan el ${shown.name}`}
              {shown.off > 0 && ` · ${shown.off} ${shown.off === 1 ? 'libra' : 'libran'}`}
            </p>
          </div>

          {/* People at work per day: one hue, columns from a shared baseline,
              the value written on top of each. Today is the darker one. */}
          <ol
            className="mt-4 grid h-28 grid-cols-7 items-end gap-1.5"
            onPointerLeave={() => setHovered(null)}
          >
            {summary.days.map((day, index) => {
              const isShown = day.date === shown.date
              return (
                <li
                  key={day.date}
                  onPointerEnter={() => setHovered(day.date)}
                  className={cn(
                    'flex h-full flex-col items-center justify-end gap-1 rounded-xl px-0.5 pt-1 pb-1.5 transition duration-200',
                    isShown && 'bg-slate-50',
                    hovered !== null && !isShown && 'opacity-50'
                  )}
                >
                  <span
                    className={cn(
                      'text-[11px] font-bold tabular-nums transition-transform duration-200',
                      isShown ? 'scale-125 text-slate-900' : 'text-slate-500'
                    )}
                  >
                    {day.working}
                  </span>
                  <span className="flex min-h-0 w-full flex-1 items-end justify-center">
                    <span
                      className={cn(
                        'dash-column block w-full max-w-7 rounded-md transition-colors duration-200',
                        day.isToday ? 'bg-brand-600' : isShown ? 'bg-brand-400' : 'bg-brand-200'
                      )}
                      style={
                        {
                          height: `${Math.max(6, (day.working / max) * 100)}%`,
                          '--i': index,
                        } as CSSProperties
                      }
                    />
                  </span>
                  <span
                    className={cn(
                      'text-[10px] font-semibold tracking-wide uppercase',
                      day.isToday ? 'text-brand-700' : 'text-slate-400'
                    )}
                  >
                    {day.label}
                  </span>
                </li>
              )
            })}
          </ol>

          <p
            className={cn(
              'mt-3 flex items-start gap-2 rounded-xl px-3 py-2 text-xs',
              summary.unassigned > 0 ? 'bg-amber-50 text-amber-800' : 'bg-slate-50 text-slate-600'
            )}
          >
            {summary.unassigned > 0 ? (
              <>
                <TriangleAlert
                  className="dash-nudge mt-0.5 h-3.5 w-3.5 shrink-0"
                  aria-hidden="true"
                />
                <span>
                  <span className="font-bold">{summary.unassigned} sin horario esta semana:</span>{' '}
                  {namesLabel(summary.unassignedNames, summary.unassigned)}
                </span>
              </>
            ) : (
              <>
                <CircleCheck
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600"
                  aria-hidden="true"
                />
                Todo el equipo tiene horario esta semana.
              </>
            )}
          </p>
        </>
      )}
    </WidgetCard>
  )
}
