import Link from 'next/link'
import { Building2, ChevronLeft, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { CARD } from '@/components/ui/styles'
import { RangoHora } from '@/components/ui/Hora'
import { formatHoursValue } from '@/modules/schedules/lib/hours'
import { shiftWeekISO, WEEKDAY_NAMES } from '@/modules/schedules/lib/week'
import { NEUTRAL_STRIPE, hatchStyle, paletteForSchedule } from '@/modules/schedules/lib/cellPalette'
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

function dayNumber(iso: string): number {
  return Number(iso.slice(8, 10))
}

// Misma matriz visual que WeeklyScheduleMatrix, pero de una sola fila y solo lectura.
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

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
        {days.map((day, index) => (
          <MyScheduleDayCard key={day.date} day={day} dayIndex={index} />
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-100/70 px-4 py-2.5">
        <span className="text-xs font-semibold text-slate-500">Total de la semana</span>
        <span className="text-sm font-bold tabular-nums text-slate-900">
          {formatHoursValue(weeklyTotal)} h
        </span>
      </div>
    </div>
  )
}

function MyScheduleDayCard({ day, dayIndex }: { day: MyDayAssignment; dayIndex: number }) {
  const palette = paletteForSchedule({
    scheduleId: day.scheduleId,
    isCustom: day.isCustom,
    manualColor: day.scheduleColor,
  })
  // El texto lo pinta <RangoHora> (formato de la empresa). Acá solo se
  // decide si hay rango que mostrar: este archivo es componente de
  // servidor y no puede llamar al hook.
  const hasRange = Boolean(day.startTime && day.endTime)
  const showBranch = !day.isDayOff && palette != null && day.branchName

  return (
    <div className="flex flex-col">
      <div className="mb-1.5 flex items-baseline justify-between px-0.5">
        <p className="text-[11px] font-bold text-slate-700">
          {WEEKDAY_NAMES[dayIndex].slice(0, 3)} {dayNumber(day.date)}
        </p>
        <p className="text-[10px] font-semibold tabular-nums text-slate-400">
          {day.hours > 0 ? `${formatHoursValue(day.hours)} h` : '—'}
        </p>
      </div>

      <div className="flex min-h-[76px] flex-1 flex-col overflow-hidden rounded-lg border text-center">
        {day.isDayOff ? (
          <div className="flex-1 rounded-lg" style={hatchStyle(NEUTRAL_STRIPE)}>
            <span className="sr-only">Descanso</span>
          </div>
        ) : palette ? (
          <div
            className="flex flex-1 flex-col"
            style={{ backgroundColor: palette.fill, borderColor: palette.border }}
          >
            <div className="flex flex-1 flex-col items-center justify-center gap-px px-1.5 py-1.5">
              {day.isHoliday && (
                <Badge tone="amber" className="mb-0.5">
                  Feriado
                </Badge>
              )}
              <p className="line-clamp-2 text-[11px] font-bold leading-[1.25] text-slate-800">
                {day.isCustom ? 'Personalizado' : (day.scheduleName ?? 'Sin asignar')}
              </p>
              {hasRange && (
                // Sin whitespace-nowrap: en 12h el rango ("8:00 a. m. -
                // 5:00 p. m.") casi duplica el largo de "08:00 - 17:00" y en
                // una tarjeta de día se salía. En 24h sigue entrando en una
                // línea, así que ahí no cambia nada.
                <p className="text-[11px] leading-[1.3] tabular-nums text-slate-600">
                  <RangoHora inicio={day.startTime} fin={day.endTime} />
                </p>
              )}
            </div>
            {showBranch && (
              <div
                className="flex shrink-0 items-center justify-center gap-1 px-1.5 py-1"
                style={{ borderTop: `1px solid ${palette.border}` }}
                title={day.branchName ?? undefined}
              >
                <Building2 className="h-2.5 w-2.5 shrink-0 text-slate-500" />
                <span className="min-w-0 truncate text-[9.5px] font-semibold leading-none text-slate-600">
                  {day.branchName}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-slate-200 px-1.5 py-1.5">
            {day.isHoliday ? (
              <Badge tone="amber">Feriado</Badge>
            ) : (
              <span className="text-[11px] text-slate-400">Sin asignar</span>
            )}
          </div>
        )}
      </div>

      {day.observaciones && (
        <p className="mt-1 line-clamp-2 px-0.5 text-[10px] leading-tight text-slate-400">
          {day.observaciones}
        </p>
      )}
    </div>
  )
}
