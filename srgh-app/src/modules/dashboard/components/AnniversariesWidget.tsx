'use client'

import { Award } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/utils/cn'
import { MedalSpot } from '@/modules/dashboard/components/Spots'
import { WidgetCard } from '@/modules/dashboard/components/WidgetCard'
import { countdownLabel, type UpcomingAnniversary } from '@/modules/dashboard/lib/birthdays'

const SHOWN = 4

function yearsLabel(years: number) {
  return years === 1 ? '1 año' : `${years} años`
}

export function AnniversariesWidget({
  anniversaries,
  step,
}: {
  /** Sorted from the closest to the farthest. */
  anniversaries: UpcomingAnniversary[]
  step?: number
}) {
  const [next, ...rest] = anniversaries

  return (
    <WidgetCard icon={Award} title="Aniversarios laborales" href="/employees" step={step}>
      {!next ? (
        <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
          Todavía nadie cumple un año en la empresa.
        </p>
      ) : (
        <>
          <div className="mt-4 flex items-center gap-3">
            <MedalSpot />
            <p className="min-w-0 text-sm text-slate-500">
              <span className="block truncate text-base font-extrabold tracking-tight text-slate-900">
                {next.nombre}
              </span>
              cumple {yearsLabel(next.years)} · {countdownLabel(next.daysUntil).toLowerCase()}
            </p>
          </div>

          {rest.length > 0 && (
            <ul className="mt-3 space-y-0.5 border-t border-slate-100 pt-3">
              {rest.slice(0, SHOWN).map((anniversary) => (
                <li
                  key={anniversary.id}
                  className="dash-line group flex items-center gap-2 rounded-xl px-2 py-1.5 transition duration-200 hover:bg-slate-50"
                >
                  <Avatar
                    nombre={anniversary.nombre}
                    fotoUrl={anniversary.fotoUrl}
                    size="xs"
                    className="transition-transform duration-300 group-hover:scale-110"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-slate-800">
                      {anniversary.nombre}
                    </span>
                    <span className="block truncate text-[11px] text-slate-500">
                      {yearsLabel(anniversary.years)} · {anniversary.dateLabel}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap',
                      anniversary.daysUntil <= 7
                        ? 'bg-brand-50 text-brand-700'
                        : 'bg-slate-100 text-slate-600'
                    )}
                  >
                    {countdownLabel(anniversary.daysUntil)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </WidgetCard>
  )
}
