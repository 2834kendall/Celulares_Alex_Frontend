'use client'

import { FileX2, Gift } from 'lucide-react'
import { Tabs, type TabDefinition } from '@/components/ui/Tabs'
import type {
  AguinaldoItem,
  EmpleadoActivoItem,
  LiquidacionListItem,
  MotivoSalidaRow,
} from '@/modules/payroll/types'
import { AguinaldoTab } from './AguinaldoTab'
import { LiquidacionTab } from './LiquidacionTab'
import { LiquidacionesHistorial } from './LiquidacionesHistorial'

interface AguinaldoLiquidacionViewProps {
  anio: number
  aguinaldos: AguinaldoItem[]
  canWrite: boolean
  empleadosActivos: EmpleadoActivoItem[]
  motivos: MotivoSalidaRow[]
  liquidaciones: LiquidacionListItem[]
}

type TabId = 'aguinaldo' | 'liquidacion'

/**
 * Usa el Tabs compartido (sincronizado con `?tab=`) en vez de un estado
 * local: es lo que permite enlazar directo a `?tab=liquidacion` — lo hace el
 * tab Contrato del perfil del empleado.
 */
export function AguinaldoLiquidacionView({
  anio,
  aguinaldos,
  canWrite,
  empleadosActivos,
  motivos,
  liquidaciones,
}: AguinaldoLiquidacionViewProps) {
  const tabs: TabDefinition<TabId>[] = [
    {
      id: 'aguinaldo',
      label: 'Aguinaldo',
      icon: Gift,
      content: <AguinaldoTab anio={anio} items={aguinaldos} canWrite={canWrite} />,
    },
    {
      id: 'liquidacion',
      label: 'Liquidación',
      icon: FileX2,
      content: canWrite ? (
        <LiquidacionTab empleados={empleadosActivos} motivos={motivos} historial={liquidaciones} />
      ) : (
        <div className="space-y-4">
          <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-xs text-slate-400">
            No tenés permiso para procesar liquidaciones.
          </p>
          <LiquidacionesHistorial items={liquidaciones} />
        </div>
      ),
    },
  ]

  return <Tabs idPrefix="aguinaldo-liquidacion" ariaLabel="Aguinaldo y liquidación" tabs={tabs} />
}
