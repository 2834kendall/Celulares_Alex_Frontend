'use client'

import { FileX2, Gift } from 'lucide-react'
import { Tabs, type TabDefinition } from '@/components/ui/Tabs'
import type {
  AguinaldoItem,
  ContratoPorLiquidarItem,
  LiquidacionListItem,
} from '@/modules/payroll/types'
import { AguinaldoTab } from './AguinaldoTab'
import { LiquidacionTab } from './LiquidacionTab'
import { LiquidacionesHistorial } from './LiquidacionesHistorial'

interface AguinaldoLiquidacionViewProps {
  anio: number
  anioActual: number
  cicloCerrado: boolean
  puedeLeerAusencias: boolean
  aguinaldos: AguinaldoItem[]
  canWrite: boolean
  contratosPorLiquidar: ContratoPorLiquidarItem[]
  liquidaciones: LiquidacionListItem[]
  /** Aguinaldos del año anterior sin pagar (ver AguinaldoTab). */
  pendientesAnterior?: { anio: number; cantidad: number; monto: number } | null
  /**
   * Si el envío de comprobantes por correo está configurado (SMTP). Solo
   * cambia el texto de la confirmación del pago: el envío lo decide el servidor.
   */
  correoConfigurado?: boolean
}

type TabId = 'aguinaldo' | 'liquidacion'

/**
 * Usa el Tabs compartido (sincronizado con `?tab=`) en vez de un estado
 * local: es lo que permite enlazar directo a `?tab=liquidacion` — lo hace el
 * tab Contrato del perfil del empleado.
 */
export function AguinaldoLiquidacionView({
  anio,
  anioActual,
  cicloCerrado,
  puedeLeerAusencias,
  aguinaldos,
  canWrite,
  contratosPorLiquidar,
  liquidaciones,
  pendientesAnterior = null,
  correoConfigurado = false,
}: AguinaldoLiquidacionViewProps) {
  const tabs: TabDefinition<TabId>[] = [
    {
      id: 'aguinaldo',
      label: 'Aguinaldo',
      icon: Gift,
      content: (
        <AguinaldoTab
          anio={anio}
          anioActual={anioActual}
          items={aguinaldos}
          canWrite={canWrite}
          cicloCerrado={cicloCerrado}
          puedeLeerAusencias={puedeLeerAusencias}
          pendientesAnterior={pendientesAnterior}
          correoConfigurado={correoConfigurado}
        />
      ),
    },
    {
      id: 'liquidacion',
      label: 'Liquidación',
      icon: FileX2,
      content: canWrite ? (
        <LiquidacionTab
          contratos={contratosPorLiquidar}
          historial={liquidaciones}
          correoConfigurado={correoConfigurado}
        />
      ) : (
        <div className="space-y-4">
          <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-xs text-slate-400">
            No tenés permiso para procesar liquidaciones.
          </p>
          <LiquidacionesHistorial items={liquidaciones} canWrite={false} />
        </div>
      ),
    },
  ]

  return <Tabs idPrefix="aguinaldo-liquidacion" ariaLabel="Aguinaldo y liquidación" tabs={tabs} />
}
