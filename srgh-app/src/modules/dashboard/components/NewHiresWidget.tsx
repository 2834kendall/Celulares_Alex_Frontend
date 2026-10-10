'use client'

import { UserPlus } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { Avatar } from '@/components/ui/Avatar'
import { CountUp } from '@/modules/dashboard/components/CountUp'
import { TeamSpot } from '@/modules/dashboard/components/Spots'
import { WidgetCard } from '@/modules/dashboard/components/WidgetCard'
import { agoLabel, type RecentHire } from '@/modules/dashboard/lib/birthdays'

const SHOWN = 5

export function NewHiresWidget({
  hires,
  step,
}: {
  /** Newest first. */
  hires: RecentHire[]
  step?: number
}) {
  return (
    <WidgetCard icon={UserPlus} title="Nuevos ingresos" href="/employees" step={step}>
      {hires.length === 0 ? (
        <EmptyState
          size="sm"
          className="mt-4"
          icon={UserPlus}
          title="Nadie se unió a la empresa en los últimos 60 días."
        />
      ) : (
        <>
          <div className="mt-4 flex items-center gap-3">
            <TeamSpot />
            <p className="text-sm text-slate-500">
              <span className="block text-3xl leading-none font-black tracking-tight text-slate-900">
                <CountUp value={hires.length} />
              </span>
              en los últimos 60 días
            </p>
          </div>

          <ul className="mt-3 space-y-0.5 border-t border-slate-100 pt-3">
            {hires.slice(0, SHOWN).map((hire) => (
              <li
                key={hire.id}
                className="dash-line group flex items-center gap-2 rounded-xl px-2 py-1.5 transition duration-200 hover:bg-slate-50"
              >
                <Avatar
                  nombre={hire.nombre}
                  fotoUrl={hire.fotoUrl}
                  size="xs"
                  className="transition-transform duration-300 group-hover:scale-110"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-slate-800">
                    {hire.nombre}
                  </span>
                  <span className="block truncate text-[11px] text-slate-500">
                    {[hire.puesto, hire.sucursal].filter(Boolean).join(' · ') ||
                      'Sin puesto asignado'}
                  </span>
                </span>
                <span className="shrink-0 text-right text-[11px] text-slate-500">
                  <span className="block font-semibold text-slate-700">
                    {agoLabel(hire.daysAgo)}
                  </span>
                  {hire.dateLabel}
                </span>
              </li>
            ))}
          </ul>

          {hires.length > SHOWN && (
            <p className="mt-2 px-2 text-[11px] text-slate-400">y {hires.length - SHOWN} más</p>
          )}
        </>
      )}
    </WidgetCard>
  )
}
