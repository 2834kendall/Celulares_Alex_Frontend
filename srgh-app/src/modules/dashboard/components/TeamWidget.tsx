'use client'

import { useState, type CSSProperties } from 'react'
import { Building2 } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { CountUp } from '@/modules/dashboard/components/CountUp'
import { TeamSpot } from '@/modules/dashboard/components/Spots'
import { WidgetCard } from '@/modules/dashboard/components/WidgetCard'

/* Past this many branches the rest is summed up in one line. */
const SHOWN = 6

export function TeamWidget({
  team,
  step,
}: {
  /** Active headcount per branch, largest first. */
  team: { sucursal: string; count: number }[]
  step?: number
}) {
  const [hovered, setHovered] = useState<string | null>(null)
  const total = team.reduce((sum, branch) => sum + branch.count, 0)
  const max = Math.max(1, ...team.map((branch) => branch.count))
  const shown = team.slice(0, SHOWN)
  const rest = team.slice(SHOWN)

  return (
    <WidgetCard icon={Building2} title="Equipo por sucursal" href="/employees" step={step}>
      {total === 0 ? (
        <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
          No hay colaboradores con contrato vigente.
        </p>
      ) : (
        <>
          <div className="mt-4 flex items-center gap-3">
            <TeamSpot />
            <p className="text-sm text-slate-500">
              <span className="block text-3xl leading-none font-black tracking-tight text-slate-900">
                <CountUp value={total} />
              </span>
              {total === 1 ? 'colaborador activo' : 'colaboradores activos'}
            </p>
          </div>

          {/* Magnitude per branch: one hue, bars from a shared baseline, every
              value labeled next to its bar. */}
          <ul className="mt-3 space-y-0.5" onPointerLeave={() => setHovered(null)}>
            {shown.map((branch, index) => {
              const isHovered = hovered === branch.sucursal
              return (
                <li
                  key={branch.sucursal}
                  onPointerEnter={() => setHovered(branch.sucursal)}
                  className={cn(
                    'grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_3.75rem] items-center gap-2 rounded-xl px-2 py-1.5 text-xs transition duration-200',
                    isHovered && 'bg-slate-50',
                    hovered !== null && !isHovered && 'opacity-50'
                  )}
                >
                  <span
                    className={cn(
                      'truncate transition-colors duration-200',
                      isHovered ? 'font-semibold text-slate-900' : 'text-slate-600'
                    )}
                    title={branch.sucursal}
                  >
                    {branch.sucursal}
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
                          width: `${(branch.count / max) * 100}%`,
                          '--i': index,
                        } as CSSProperties
                      }
                    />
                  </span>
                  <span className="flex items-baseline justify-end gap-1.5">
                    {isHovered && (
                      <span className="dash-pop text-[10px] font-semibold text-slate-500 tabular-nums">
                        {Math.round((branch.count / total) * 100)}%
                      </span>
                    )}
                    <span
                      className={cn(
                        'text-sm font-bold text-slate-900 tabular-nums transition-transform duration-200',
                        isHovered && 'scale-125'
                      )}
                    >
                      {branch.count}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>

          {rest.length > 0 && (
            <p className="mt-2 px-2 text-[11px] text-slate-400">
              y {rest.length} {rest.length === 1 ? 'sucursal' : 'sucursales'} más, con{' '}
              {rest.reduce((sum, branch) => sum + branch.count, 0)} colaboradores
            </p>
          )}
        </>
      )}
    </WidgetCard>
  )
}
