import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import {
  CARD,
  TABLE_HEAD,
  TABLE_ROW,
  TABLE_TH,
  TABLE_TH_RIGHT,
  TABLE_TD_NUM,
} from '@/components/ui/styles'
import { stripSeconds } from '@/modules/schedules/lib/time'
import { formatHoursValue } from '@/modules/schedules/lib/hours'
import { shiftWeekISO, WEEKDAY_NAMES } from '@/modules/schedules/lib/week'
import type { MyDayAssignment } from '@/modules/schedules/actions/getMySchedule'

interface MyScheduleViewProps {
  weekStartISO: string
  weekDates: string[]
  days: MyDayAssignment[]
  weeklyTotal: number
}

function formatDateLabel(iso: string): string {
  const [, month, day] = iso.split('-')
  return `${day}/${month}`
}

/** Vista de solo lectura: el propio horario semanal, sin edicion ni datos de otros. */
export function MyScheduleView({
  weekStartISO,
  weekDates,
  days,
  weeklyTotal,
}: MyScheduleViewProps) {
  const prevWeek = shiftWeekISO(weekStartISO, -1)
  const nextWeek = shiftWeekISO(weekStartISO, 1)

  return (
    <div className={`${CARD} p-5`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Mi Horario</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {formatDateLabel(weekDates[0])} — {formatDateLabel(weekDates[6])}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Link
            href={`?week=${prevWeek}`}
            aria-label="Semana anterior"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 outline-none transition hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-brand-500/60"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <Link
            href={`?week=${nextWeek}`}
            aria-label="Semana siguiente"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 outline-none transition hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-brand-500/60"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100">
        <table className="w-full text-sm">
          <thead className={TABLE_HEAD}>
            <tr>
              <th className={TABLE_TH}>Día</th>
              <th className={TABLE_TH}>Turno</th>
              <th className={TABLE_TH}>Horario</th>
              <th className={TABLE_TH_RIGHT}>Horas</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day, i) => (
              <tr key={day.date} className={TABLE_ROW}>
                <td className="px-3 py-2">
                  <span className="font-medium text-slate-800">{WEEKDAY_NAMES[i]}</span>{' '}
                  <span className="text-slate-400">{formatDateLabel(day.date)}</span>
                </td>
                <td className="px-3 py-2 text-slate-600">
                  {day.isDayOff ? (
                    <Badge tone="slate">Día libre</Badge>
                  ) : day.isHoliday ? (
                    <Badge tone="amber">Feriado</Badge>
                  ) : day.scheduleName ? (
                    day.scheduleName
                  ) : (
                    <span className="text-slate-400">Sin asignar</span>
                  )}
                  {day.observaciones && (
                    <p className="mt-0.5 text-[11px] text-slate-400">{day.observaciones}</p>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-600">
                  {day.startTime && day.endTime
                    ? `${stripSeconds(day.startTime)} - ${stripSeconds(day.endTime)}`
                    : '—'}
                </td>
                <td className={TABLE_TD_NUM + ' text-right'}>{formatHoursValue(day.hours)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 bg-slate-50/60">
              <td colSpan={3} className="px-3 py-2 text-right text-xs font-semibold text-slate-500">
                Total de la semana
              </td>
              <td className="px-3 py-2 text-right text-sm font-bold text-slate-900">
                {formatHoursValue(weeklyTotal)} h
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
