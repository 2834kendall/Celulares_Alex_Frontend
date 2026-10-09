'use client'

import { useState, type CSSProperties } from 'react'
import { AlarmClock } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/utils/cn'
import { CountUp } from '@/modules/dashboard/components/CountUp'
import { ClockSpot } from '@/modules/dashboard/components/Spots'
import { WidgetCard } from '@/modules/dashboard/components/WidgetCard'
import type { MonthSummary } from '@/modules/dashboard/lib/summaries'

export function MonthTardinessWidget({
  summary,
  monthLabel,
  step,
}: {
  summary: MonthSummary
  /** "octubre" */
  monthLabel: string
  step?: number
}) {
  const [hovered, setHovered] = useState<number | null>(null)
  const max = Math.max(1, ...summary.people.map((person) => person.tardias + person.ausencias))

  return (
    <WidgetCard icon={AlarmClock} title="Tardías del mes" href="/attendance" step={step}>
      <div className="mt-4 flex items-center gap-3">
        <ClockSpot />
        <dl className="flex gap-5">
          <div className="dash-figure rounded-xl px-1">
            <dd className="dash-figure-value text-3xl leading-none font-black tracking-tight text-slate-900">
              <CountUp value={summary.tardias} />
            </dd>
            <dt className="mt-1 text-xs text-slate-500">tardías</dt>
          </div>
          <div className="dash-figure rounded-xl px-1">
            <dd className="dash-figure-value text-3xl leading-none font-black tracking-tight text-slate-900">
              <CountUp value={summary.ausencias} />
            </dd>
            <dt className="mt-1 text-xs text-slate-500">ausencias sin justificar</dt>
          </div>
        </dl>
      </div>

      {summary.people.length === 0 ? (
        <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
          Nadie acumula tardías ni ausencias en {monthLabel}.
        </p>
      ) : (
        /* Who accumulates the most: one bar per person, tardiness plus
           absences, from a shared baseline. One hue; the split is in the text. */
        <ul
          className="mt-3 space-y-0.5 border-t border-slate-100 pt-3"
          onPointerLeave={() => setHovered(null)}
        >
          {summary.people.map((person, index) => {
            const isHovered = hovered === person.id
            const total = person.tardias + person.ausencias

            return (
              <li
                key={person.id}
                onPointerEnter={() => setHovered(person.id)}
                className={cn(
                  'rounded-xl px-2 py-1.5 transition duration-200',
                  isHovered && 'bg-slate-50',
                  hovered !== null && !isHovered && 'opacity-50'
                )}
              >
                <div className="flex items-center gap-2">
                  <Avatar nombre={person.nombre} size="xs" />
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-800">
                    {person.nombre}
                  </span>
                  <span className="shrink-0 text-[11px] text-slate-500 tabular-nums">
                    {[
                      person.tardias > 0 &&
                        `${person.tardias} ${person.tardias === 1 ? 'tardía' : 'tardías'}`,
                      person.ausencias > 0 &&
                        `${person.ausencias} ${person.ausencias === 1 ? 'ausencia' : 'ausencias'}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
                <div
                  className={cn(
                    'mt-1.5 ml-9 rounded-full bg-slate-100 transition-[height] duration-200',
                    isHovered ? 'h-2.5' : 'h-1.5'
                  )}
                >
                  <span
                    className="dash-bar block h-full rounded-[4px] bg-brand-600"
                    style={{ width: `${(total / max) * 100}%`, '--i': index } as CSSProperties}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </WidgetCard>
  )
}
