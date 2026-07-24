'use client'

import { useState } from 'react'
import type { AguinaldoItem, EmpleadoActivoItem, MotivoSalidaRow } from '@/modules/payroll/types'
import { AguinaldoTab } from './AguinaldoTab'
import { LiquidacionTab } from './LiquidacionTab'

interface AguinaldoLiquidacionViewProps {
  anio: number
  aguinaldos: AguinaldoItem[]
  canWrite: boolean
  empleadosActivos: EmpleadoActivoItem[]
  motivos: MotivoSalidaRow[]
}

const TABS = [
  { id: 'aguinaldo', label: 'Aguinaldo' },
  { id: 'liquidacion', label: 'Liquidación' },
] as const

type TabId = (typeof TABS)[number]['id']

export function AguinaldoLiquidacionView({
  anio,
  aguinaldos,
  canWrite,
  empleadosActivos,
  motivos,
}: AguinaldoLiquidacionViewProps) {
  const [tab, setTab] = useState<TabId>('aguinaldo')

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs font-semibold">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 transition ${
              tab === t.id
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'aguinaldo' && <AguinaldoTab anio={anio} items={aguinaldos} canWrite={canWrite} />}
      {tab === 'liquidacion' &&
        (canWrite ? (
          <LiquidacionTab empleados={empleadosActivos} motivos={motivos} />
        ) : (
          <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-xs text-slate-400">
            No tenés permiso para procesar liquidaciones.
          </p>
        ))}
    </div>
  )
}
