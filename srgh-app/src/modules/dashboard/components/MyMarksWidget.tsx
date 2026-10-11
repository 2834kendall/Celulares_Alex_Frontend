'use client'

import { Fingerprint } from 'lucide-react'
import { Hora } from '@/components/ui/Hora'
import { cn } from '@/lib/utils/cn'
import { WidgetCard } from '@/modules/dashboard/components/WidgetCard'
import type { MyDayStatus, MyDaySummary } from '@/modules/dashboard/lib/extras'

const STATUS_LABEL: Record<MyDayStatus, string> = {
  none: 'Todavía no marcaste hoy',
  working: 'En jornada',
  break: 'En receso',
  lunch: 'En almuerzo',
  done: 'Jornada terminada',
}

/**
 * The reader's own marks of today, as the six steps of a shift. Read-only:
 * marking is done at the kiosk, never from here.
 */
export function MyMarksWidget({ summary, step }: { summary: MyDaySummary; step?: number }) {
  const made = summary.steps.filter((mark) => mark.time).length
  const isActive = summary.status !== 'none' && summary.status !== 'done'

  return (
    <WidgetCard icon={Fingerprint} title="Mis marcas de hoy" href="/profile" step={step}>
      <p className="mt-4 flex items-center gap-2 text-base font-extrabold tracking-tight text-slate-900">
        {isActive && (
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-60 motion-reduce:hidden" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand-600" />
          </span>
        )}
        {STATUS_LABEL[summary.status]}
      </p>
      <p className="mt-0.5 text-xs text-slate-500">
        {made} de {summary.steps.length} marcas
      </p>

      {/* Steps in shift order. Made or not is a filled or hollow node, plus
          the time under it: never the color alone. */}
      <ol className="mt-4 grid grid-cols-3 gap-x-1 gap-y-3 @md:grid-cols-6">
        {summary.steps.map((mark, index) => {
          const isMade = Boolean(mark.time)
          return (
            <li
              key={mark.key}
              className="dash-figure group flex flex-col items-center rounded-xl px-0.5 py-1.5 text-center"
            >
              <span
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold transition-transform duration-200 group-hover:scale-110',
                  isMade
                    ? 'bg-brand-600 text-white'
                    : 'border-2 border-dashed border-slate-300 text-slate-400'
                )}
              >
                {index + 1}
              </span>
              <span className="mt-1.5 text-[11px] leading-tight font-semibold text-slate-700">
                {mark.label}
              </span>
              <span className="text-[11px] text-slate-500 tabular-nums">
                <Hora value={mark.time} fallback="—" />
              </span>
            </li>
          )
        })}
      </ol>
    </WidgetCard>
  )
}
