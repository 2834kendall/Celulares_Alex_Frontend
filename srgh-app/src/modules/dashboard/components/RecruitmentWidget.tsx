'use client'

import { useState, type CSSProperties } from 'react'
import { ArrowRight, UserSearch } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/utils/cn'
import { CountUp } from '@/modules/dashboard/components/CountUp'
import { SearchSpot } from '@/modules/dashboard/components/Spots'
import { WidgetCard } from '@/modules/dashboard/components/WidgetCard'
import type { RecruitmentSummary } from '@/modules/dashboard/lib/summaries'

export function RecruitmentWidget({
  summary,
  step,
  className,
}: {
  summary: RecruitmentSummary
  step?: number
  className?: string
}) {
  /* Stage under the pointer: its row lights up and the magnifying glass of
     the vignette jumps to it. */
  const [hovered, setHovered] = useState<number | null>(null)
  const max = Math.max(1, ...summary.phases.map((phase) => phase.count))

  return (
    <WidgetCard
      icon={UserSearch}
      title="Reclutamiento"
      href="/recruitment"
      step={step}
      className={className}
    >
      {summary.total === 0 ? (
        <EmptyState
          size="sm"
          className="mt-4"
          icon={UserSearch}
          title="No hay postulaciones en proceso."
        />
      ) : (
        <>
          <div className="mt-4 flex items-center gap-3">
            <SearchSpot focus={hovered} />
            <p className="text-sm text-slate-500">
              <span className="block text-3xl leading-none font-black tracking-tight text-slate-900">
                <CountUp value={summary.total} />
              </span>
              en proceso
            </p>
          </div>

          {/* Magnitude across the three stages of the board: one hue, bars
              from a shared baseline, every value labeled next to its bar. */}
          <ul className="mt-3 space-y-0.5" onPointerLeave={() => setHovered(null)}>
            {summary.phases.map((phase, index) => {
              const isHovered = hovered === index
              const share = Math.round((phase.count / summary.total) * 100)

              return (
                <li
                  key={phase.id}
                  onPointerEnter={() => setHovered(index)}
                  className={cn(
                    'grid grid-cols-[6.5rem_minmax(0,1fr)_3.75rem] items-center gap-2 rounded-xl px-2 py-1.5 text-xs transition duration-200',
                    isHovered && 'bg-slate-50',
                    hovered !== null && !isHovered && 'opacity-50'
                  )}
                >
                  <span
                    className={cn(
                      'truncate transition-colors duration-200',
                      isHovered ? 'font-semibold text-slate-900' : 'text-slate-600'
                    )}
                  >
                    {phase.label}
                  </span>
                  <span
                    className={cn(
                      'rounded-full bg-slate-100 transition-[height] duration-200',
                      isHovered ? 'h-3.5' : 'h-2.5'
                    )}
                  >
                    <span
                      className="dash-bar block h-full rounded-[4px] bg-brand-600"
                      style={
                        {
                          width: `${(phase.count / max) * 100}%`,
                          '--i': index,
                        } as CSSProperties
                      }
                    />
                  </span>
                  <span className="flex items-baseline justify-end gap-1.5">
                    {isHovered && (
                      <span className="dash-pop text-[10px] font-semibold text-slate-500 tabular-nums">
                        {share}%
                      </span>
                    )}
                    <span
                      className={cn(
                        'text-sm font-bold text-slate-900 tabular-nums transition-transform duration-200',
                        isHovered && 'scale-125'
                      )}
                    >
                      {phase.count}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>

          {summary.newest.length > 0 && (
            <ul className="mt-3 space-y-0.5 border-t border-slate-100 pt-3">
              {summary.newest.map((candidate) => (
                <li
                  key={candidate.id}
                  className="dash-line group flex items-center gap-2 rounded-xl px-2 py-1.5 transition duration-200 hover:bg-slate-50"
                >
                  <Avatar
                    nombre={candidate.nombre}
                    size="xs"
                    className="transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6"
                  />
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-800">
                    {candidate.nombre}
                  </span>
                  <span className="shrink-0 truncate text-[11px] text-slate-500 transition-opacity duration-200 group-hover:opacity-0">
                    {candidate.puesto}
                  </span>
                  <ArrowRight
                    className="-ml-5 h-3.5 w-3.5 shrink-0 -translate-x-1 text-brand-600 opacity-0 transition duration-200 group-hover:translate-x-0 group-hover:opacity-100"
                    aria-hidden="true"
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </WidgetCard>
  )
}
