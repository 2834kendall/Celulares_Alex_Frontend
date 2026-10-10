'use client'

import { CalendarHeart } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn } from '@/lib/utils/cn'
import { CountUp } from '@/modules/dashboard/components/CountUp'
import { WidgetCard } from '@/modules/dashboard/components/WidgetCard'
import {
  startsInLabel,
  type MyAbsenceStatus,
  type MyAbsencesSummary,
} from '@/modules/dashboard/lib/extras'

const SHOWN = 4

const STATUS_LABEL: Record<MyAbsenceStatus, string> = {
  pendiente: 'En revisión',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
}

/* The state is always written out: the color only reinforces it. */
const STATUS_TONE: Record<MyAbsenceStatus, string> = {
  pendiente: 'bg-amber-50 text-amber-700',
  aprobada: 'bg-emerald-50 text-emerald-700',
  rechazada: 'bg-rose-50 text-rose-700',
}

/**
 * The reader's own vacations, leaves and sick days: what is in force, what
 * is coming and how each request is going. Read-only — asking for one is
 * done with whoever manages absences, not from here.
 */
export function MyAbsencesWidget({ summary, step }: { summary: MyAbsencesSummary; step?: number }) {
  const { absences, pending } = summary
  const current = absences.find((absence) => absence.isNow)
  const upcoming = absences.filter((absence) => absence.startsIn > 0).length

  return (
    <WidgetCard icon={CalendarHeart} title="Mis ausencias" href="/my-schedule" step={step}>
      {absences.length === 0 ? (
        <EmptyState
          size="sm"
          className="mt-4"
          icon={CalendarHeart}
          title="No tenés vacaciones, permisos ni incapacidades registradas para estos días."
        />
      ) : (
        <>
          <p className="mt-4 text-base font-extrabold tracking-tight text-slate-900">
            {current ? `Hoy: ${current.tipo}` : 'Hoy trabajás normal'}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {pending === 0 ? (
              upcoming === 0 ? (
                'Nada programado más adelante'
              ) : (
                <>
                  <CountUp value={upcoming} /> por venir
                </>
              )
            ) : (
              <>
                <CountUp value={pending} />{' '}
                {pending === 1 ? 'solicitud en revisión' : 'solicitudes en revisión'}
              </>
            )}
          </p>

          <ul className="mt-3 space-y-0.5 border-t border-slate-100 pt-3">
            {absences.slice(0, SHOWN).map((absence) => (
              <li
                key={absence.id}
                className="dash-line group flex items-center gap-2 rounded-xl px-2 py-1.5 transition duration-200 hover:bg-slate-50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-slate-800">
                    {absence.tipo}
                    {absence.esIntradia ? ' · parte del día' : ''}
                  </span>
                  <span className="block truncate text-[11px] text-slate-500 tabular-nums">
                    {absence.range}
                    {startsInLabel(absence.startsIn) && ` · ${startsInLabel(absence.startsIn)}`}
                  </span>
                </span>
                <span
                  className={cn(
                    'dash-badge shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold',
                    absence.isNow ? 'bg-brand-600 text-white' : STATUS_TONE[absence.estado]
                  )}
                >
                  {absence.isNow ? 'Hoy' : STATUS_LABEL[absence.estado]}
                </span>
              </li>
            ))}
          </ul>

          {absences.length > SHOWN && (
            <p className="mt-2 px-2 text-[11px] text-slate-400">y {absences.length - SHOWN} más</p>
          )}
        </>
      )}
    </WidgetCard>
  )
}
