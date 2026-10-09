'use client'

import { useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { ArrowRight, Banknote, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import {
  estadoBadgeTone,
  estadoLabel,
  estadoVisible,
  formatDate,
  periodoLabel,
} from '@/modules/payroll/lib/format'
import { CountUp } from '@/modules/dashboard/components/CountUp'
import { CoinsSpot } from '@/modules/dashboard/components/Spots'
import { WidgetCard } from '@/modules/dashboard/components/WidgetCard'
import type { PayrollSummary } from '@/modules/dashboard/lib/summaries'

export function PayrollWidget({
  summary,
  step,
  className,
}: {
  summary: PayrollSummary
  step?: number
  className?: string
}) {
  /* Each bump flips a coin off the stack (see CoinsSpot). */
  const [toss, setToss] = useState(0)
  const tossCoin = () => setToss((current) => current + 1)

  const { current } = summary
  const estado = current ? estadoVisible(current.estado, current.atrasado) : null
  const progress =
    current?.day && current.totalDays
      ? Math.min(100, Math.round((current.day / current.totalDays) * 100))
      : null

  return (
    <WidgetCard icon={Banknote} title="Nómina" href="/payroll" step={step} className={className}>
      {!current ? (
        <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
          No hay periodos pendientes de pago.
        </p>
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
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-900">
                {periodoLabel(current.mes, current.anio, current.quincena)}
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                {estado && (
                  <Badge tone={estadoBadgeTone(estado)} className="dash-badge">
                    {estadoLabel(estado)}
                  </Badge>
                )}
                <span className="truncate">{current.sucursal}</span>
              </p>
            </div>
          </div>

          {/* Meter: where today falls inside the period. Track and fill come
              from the same ramp. */}
          {progress !== null && (
            <div className="group/meter mt-4">
              <div className="flex items-baseline justify-between text-xs text-slate-500">
                <span>
                  Día <span className="font-bold text-slate-900">{current.day}</span> de{' '}
                  {current.totalDays}
                </span>
                <span className="font-semibold tabular-nums transition-colors duration-200 group-hover/meter:text-brand-700">
                  {progress}%
                </span>
              </div>
              <div
                className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-brand-100 transition-[height] duration-200 group-hover/meter:h-3.5"
                role="meter"
                aria-label="Avance del periodo"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
              >
                <div
                  className="dash-meter dash-meter-shine h-full rounded-full bg-brand-600"
                  style={{ width: `${progress}%` } as CSSProperties}
                />
              </div>
            </div>
          )}

          <dl className="mt-4 grid grid-cols-3 gap-1.5 text-center">
            <div className="dash-figure rounded-xl px-1 py-2">
              <dt className="text-[11px] text-slate-500">Colaboradores</dt>
              <dd className="dash-figure-value text-lg font-bold text-slate-900">
                <CountUp value={current.totalEmpleados} />
              </dd>
            </div>
            <div className="dash-figure rounded-xl px-1 py-2">
              <dt className="text-[11px] text-slate-500">Pendientes</dt>
              <dd className="dash-figure-value text-lg font-bold text-slate-900">
                <CountUp value={summary.pending} />
              </dd>
            </div>
            <div className="dash-figure rounded-xl px-1 py-2">
              <dt className="text-[11px] text-slate-500">Atrasados</dt>
              <dd className="dash-figure-value inline-flex items-center justify-center gap-1 text-lg font-bold text-slate-900">
                {summary.overdue > 0 && (
                  <TriangleAlert
                    className="dash-nudge h-4 w-4"
                    style={{ color: '#d03b3b' }}
                    aria-hidden="true"
                  />
                )}
                <CountUp value={summary.overdue} />
              </dd>
            </div>
          </dl>

          {summary.others.length > 0 && (
            <ul className="mt-3 space-y-0.5 border-t border-slate-100 pt-3">
              {summary.others.map((periodo) => {
                const otherEstado = estadoVisible('borrador', periodo.atrasado)
                return (
                  <li key={periodo.id}>
                    {/* Sample periods have negative ids and no page to open. */}
                    <Link
                      href={periodo.id > 0 ? `/payroll/${periodo.id}` : '/payroll'}
                      className="dash-line group flex items-center gap-2 rounded-xl px-2 py-1.5 text-xs transition duration-200 hover:bg-slate-50"
                    >
                      <span className="min-w-0 flex-1 truncate font-semibold text-slate-700 transition-colors duration-200 group-hover:text-slate-900">
                        {periodoLabel(periodo.mes, periodo.anio, periodo.quincena)}
                      </span>
                      <Badge tone={estadoBadgeTone(otherEstado)} size="xs">
                        {estadoLabel(otherEstado)}
                      </Badge>
                      <ArrowRight
                        className="h-3.5 w-3.5 shrink-0 -translate-x-1 text-brand-600 opacity-0 transition duration-200 group-hover:translate-x-0 group-hover:opacity-100"
                        aria-hidden="true"
                      />
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}

          {current.fechaPago && (
            <p className="mt-auto pt-3 text-xs text-slate-500">
              Pago:{' '}
              <span className="font-semibold text-slate-700">{formatDate(current.fechaPago)}</span>
            </p>
          )}
        </>
      )}
    </WidgetCard>
  )
}
