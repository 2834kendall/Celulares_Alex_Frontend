'use client'

import Link from 'next/link'
import { ArrowRight, FileClock, TriangleAlert } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn } from '@/lib/utils/cn'
import { CountUp } from '@/modules/dashboard/components/CountUp'
import { WidgetCard } from '@/modules/dashboard/components/WidgetCard'
import { expiryLabel, type ExpiringContract } from '@/modules/dashboard/lib/extras'

const SHOWN = 5

export function ContractsWidget({
  contracts,
  canOpenProfiles = true,
  step,
}: {
  /** Overdue first, then by how soon they end. */
  contracts: ExpiringContract[]
  /** false for sample data: those people have no profile to open. */
  canOpenProfiles?: boolean
  step?: number
}) {
  const overdue = contracts.filter((contract) => contract.daysLeft < 0).length

  return (
    <WidgetCard icon={FileClock} title="Contratos por vencer" href="/employees" step={step}>
      {contracts.length === 0 ? (
        <EmptyState
          size="sm"
          className="mt-4"
          icon={FileClock}
          title="Ningún contrato vence en los próximos 60 días."
        />
      ) : (
        <>
          <p className="mt-4 text-sm text-slate-500">
            <span className="flex items-center gap-1.5 text-3xl leading-none font-black tracking-tight text-slate-900">
              <CountUp value={contracts.length} />
              {overdue > 0 && (
                <TriangleAlert
                  className="dash-nudge h-5 w-5"
                  style={{ color: '#d03b3b' }}
                  aria-hidden="true"
                />
              )}
            </span>
            {overdue === 0
              ? 'en los próximos 60 días'
              : overdue === 1
                ? '1 ya venció y sigue abierto'
                : `${overdue} ya vencieron y siguen abiertos`}
          </p>

          <ul className="mt-3 space-y-0.5 border-t border-slate-100 pt-3">
            {contracts.slice(0, SHOWN).map((contract) => {
              const isOverdue = contract.daysLeft < 0
              const row = (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-slate-800">
                      {contract.nombre}
                    </span>
                    <span className="block truncate text-[11px] text-slate-500">
                      {[contract.puesto, contract.sucursal].filter(Boolean).join(' · ') ||
                        'Sin puesto asignado'}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-[11px] text-slate-500 tabular-nums">
                    {/* State by text and icon; the pill color only reinforces it. */}
                    <span
                      className={cn(
                        'mb-0.5 ml-auto flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap',
                        isOverdue
                          ? 'bg-rose-50 text-rose-700'
                          : contract.daysLeft <= 14
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-slate-100 text-slate-600'
                      )}
                    >
                      {isOverdue && <TriangleAlert className="h-3 w-3" aria-hidden="true" />}
                      {expiryLabel(contract.daysLeft)}
                    </span>
                    {contract.dateLabel}
                  </span>
                </>
              )

              return (
                <li key={contract.labId}>
                  {canOpenProfiles ? (
                    <Link
                      href={`/employees/${contract.employeeId}`}
                      className="dash-line group flex items-center gap-2 rounded-xl px-2 py-1.5 transition duration-200 hover:bg-slate-50"
                    >
                      {row}
                      <ArrowRight
                        className="h-3.5 w-3.5 shrink-0 -translate-x-1 text-brand-600 opacity-0 transition duration-200 group-hover:translate-x-0 group-hover:opacity-100"
                        aria-hidden="true"
                      />
                    </Link>
                  ) : (
                    <div className="dash-line flex items-center gap-2 rounded-xl px-2 py-1.5 transition duration-200 hover:bg-slate-50">
                      {row}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>

          {contracts.length > SHOWN && (
            <p className="mt-2 px-2 text-[11px] text-slate-400">y {contracts.length - SHOWN} más</p>
          )}
        </>
      )}
    </WidgetCard>
  )
}
