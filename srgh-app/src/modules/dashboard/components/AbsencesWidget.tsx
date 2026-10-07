'use client'

import { CalendarOff } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { CountUp } from '@/modules/dashboard/components/CountUp'
import { WidgetCard } from '@/modules/dashboard/components/WidgetCard'
import type { AbsencesSummary } from '@/modules/dashboard/lib/extras'

const SHOWN = 5

export function AbsencesWidget({ summary, step }: { summary: AbsencesSummary; step?: number }) {
  const { absences } = summary

  return (
    <WidgetCard icon={CalendarOff} title="Ausencias de la semana" href="/schedule" step={step}>
      {absences.length === 0 ? (
        <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
          No hay ausencias aprobadas para esta semana.
        </p>
      ) : (
        <>
          <p className="mt-4 text-sm text-slate-500">
            <span className="block text-3xl leading-none font-black tracking-tight text-slate-900">
              <CountUp value={summary.outToday} />
            </span>
            {summary.outToday === 1 ? 'persona fuera hoy' : 'personas fuera hoy'}
          </p>

          <ul className="mt-3 space-y-0.5 border-t border-slate-100 pt-3">
            {absences.slice(0, SHOWN).map((absence) => (
              <li
                key={absence.id}
                className="dash-line group flex items-center gap-2 rounded-xl px-2 py-1.5 transition duration-200 hover:bg-slate-50"
              >
                <Avatar
                  nombre={absence.nombre}
                  size="xs"
                  className="transition-transform duration-300 group-hover:scale-110"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-slate-800">
                    {absence.nombre}
                  </span>
                  <span className="block truncate text-[11px] text-slate-500">
                    {absence.tipo}
                    {absence.esIntradia ? ' · parte del día' : ''}
                  </span>
                </span>
                <span className="shrink-0 text-right text-[11px] text-slate-500 tabular-nums">
                  {absence.coversToday && (
                    <span className="mb-0.5 ml-auto block w-fit rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold text-white">
                      Hoy
                    </span>
                  )}
                  {absence.range}
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
