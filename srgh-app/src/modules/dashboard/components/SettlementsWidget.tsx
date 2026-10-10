'use client'

import { useState } from 'react'
import { FileText, TriangleAlert } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { CountUp } from '@/modules/dashboard/components/CountUp'
import { CoinsSpot } from '@/modules/dashboard/components/Spots'
import { WidgetCard } from '@/modules/dashboard/components/WidgetCard'
import { formatDate } from '@/modules/payroll/lib/format'

const SHOWN = 4

export interface PendingSettlement {
  id: number
  nombre: string
  /** Last day worked: "YYYY-MM-DD". */
  fechaSalida: string
  motivo: string | null
}

/**
 * Contracts that ended and have not been settled yet. It opens the same
 * screen where they are processed; the panel only says how many are waiting
 * and who they are.
 */
export function SettlementsWidget({
  settlements,
  step,
}: {
  /** Oldest exit first: the one that has waited the longest. */
  settlements: PendingSettlement[]
  step?: number
}) {
  const [toss, setToss] = useState(0)
  const tossCoin = () => setToss((current) => current + 1)

  return (
    <WidgetCard
      icon={FileText}
      title="Liquidaciones pendientes"
      href="/payroll/aguinaldo-liquidacion"
      step={step}
    >
      {settlements.length === 0 ? (
        <EmptyState
          size="sm"
          className="mt-4"
          icon={FileText}
          title="No hay contratos terminados esperando liquidación."
        />
      ) : (
        <>
          <div className="mt-4 flex items-center gap-3">
            <span
              onPointerEnter={tossCoin}
              onClick={tossCoin}
              className="cursor-pointer transition-transform duration-200 hover:scale-110 active:scale-95"
            >
              <CoinsSpot toss={toss} />
            </span>
            <p className="text-sm text-slate-500">
              <span className="flex items-center gap-1.5 text-3xl leading-none font-black tracking-tight text-slate-900">
                <CountUp value={settlements.length} />
                <TriangleAlert
                  className="dash-nudge h-5 w-5"
                  style={{ color: '#d03b3b' }}
                  aria-hidden="true"
                />
              </span>
              {settlements.length === 1 ? 'contrato por liquidar' : 'contratos por liquidar'}
            </p>
          </div>

          <ul className="mt-3 space-y-0.5 border-t border-slate-100 pt-3">
            {settlements.slice(0, SHOWN).map((settlement) => (
              <li
                key={settlement.id}
                className="dash-line flex items-center gap-2 rounded-xl px-2 py-1.5 transition duration-200 hover:bg-slate-50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-slate-800">
                    {settlement.nombre}
                  </span>
                  <span className="block truncate text-[11px] text-slate-500">
                    {settlement.motivo ?? 'Sin motivo registrado'}
                  </span>
                </span>
                <span className="shrink-0 text-right text-[11px] text-slate-500">
                  Salió el
                  <span className="block font-semibold text-slate-700 tabular-nums">
                    {formatDate(settlement.fechaSalida)}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          {settlements.length > SHOWN && (
            <p className="mt-2 px-2 text-[11px] text-slate-400">
              y {settlements.length - SHOWN} más
            </p>
          )}
        </>
      )}
    </WidgetCard>
  )
}
