import Link from 'next/link'
import { Briefcase, FileX2 } from 'lucide-react'
import type { ContratoDetalle } from '@/modules/employees/types'
import { formatCRC, formatDate } from '@/modules/employees/lib/format'
import { BUTTON_BASE, BUTTON_SIZES, BUTTON_VARIANTS } from '@/components/ui/Button'
import {
  TABLE_HEAD,
  TABLE_ROW,
  TABLE_TD,
  TABLE_TD_NUM,
  TABLE_TD_STRONG,
  TABLE_TH,
} from '@/components/ui/styles'
import { cn } from '@/lib/utils/cn'
import { InfoItem, SectionCard } from './ProfileSection'

interface EmployeeContractSectionProps {
  /** Todos los contratos del empleado, del más reciente al más antiguo. */
  contratos: ContratoDetalle[]
  /** NOMINA_WRITE: sin él, el enlace a liquidación llevaría a un muro. */
  canLiquidar: boolean
}

/**
 * Enlace a la pantalla de liquidación con el tab y el empleado ya elegidos.
 *
 * Terminar un contrato NO se hace acá: procesarLiquidacion es el único camino
 * que cierra un contrato, y rechaza cualquiera que ya tenga fecha de fin. Un
 * cierre propio desde este módulo dejaría al empleado sin poder liquidarse.
 */
export function liquidacionHref(labId: number) {
  return `/payroll/aguinaldo-liquidacion?tab=liquidacion&empleado=${labId}`
}

/** Tab "Contrato" del perfil: el vigente y el historial de contrataciones. Solo lectura. */
export function EmployeeContractSection({ contratos, canLiquidar }: EmployeeContractSectionProps) {
  const vigente = contratos.find((c) => c.lab_fecha_fin === null) ?? null
  const cerrados = contratos.filter((c) => c.lab_fecha_fin !== null)

  return (
    <div className="space-y-4">
      <SectionCard
        title="Contrato vigente"
        action={
          vigente && canLiquidar ? (
            <Link
              href={liquidacionHref(vigente.lab_id)}
              className={cn(BUTTON_BASE, BUTTON_VARIANTS.secondary, BUTTON_SIZES.sm)}
            >
              <FileX2 className="h-3.5 w-3.5" aria-hidden="true" />
              Terminar contrato
            </Link>
          ) : null
        }
      >
        {vigente ? (
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <InfoItem label="Puesto" value={vigente.puesto_nombre} />
            <InfoItem label="Sucursal" value={vigente.sucursal_nombre} />
            <InfoItem label="Tipo de contrato" value={vigente.tipo_contrato_nombre} />
            <InfoItem label="Jornada" value={vigente.tipo_jornada_nombre} />
            <InfoItem label="Inicio del contrato" value={formatDate(vigente.lab_fecha_inicio)} />
            <InfoItem label="Salario base" value={formatCRC(vigente.lab_salario_base)} />
            <InfoItem label="Salario real" value={formatCRC(vigente.lab_salario_real)} />
          </dl>
        ) : (
          <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <Briefcase className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            <p>Este empleado no tiene un contrato vigente en la empresa.</p>
          </div>
        )}
      </SectionCard>

      {/* Sin contratos anteriores no hay historial que mostrar: la sección no
          aparece, en vez de ocupar espacio con una tabla vacía. */}
      {cerrados.length > 0 && (
        <SectionCard title="Historial de contrataciones">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-xs">
              <thead className={TABLE_HEAD}>
                <tr>
                  <th className={TABLE_TH}>Puesto</th>
                  <th className={TABLE_TH}>Sucursal</th>
                  <th className={TABLE_TH}>Desde</th>
                  <th className={TABLE_TH}>Hasta</th>
                  <th className={TABLE_TH}>Motivo de salida</th>
                </tr>
              </thead>
              <tbody>
                {cerrados.map((c) => (
                  <tr key={c.lab_id} className={TABLE_ROW}>
                    <td className={TABLE_TD_STRONG}>{c.puesto_nombre}</td>
                    <td className={TABLE_TD}>{c.sucursal_nombre}</td>
                    <td className={TABLE_TD_NUM}>{formatDate(c.lab_fecha_inicio)}</td>
                    <td className={TABLE_TD_NUM}>{formatDate(c.lab_fecha_fin)}</td>
                    <td className={TABLE_TD}>{c.motivo_salida_nombre ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </div>
  )
}
