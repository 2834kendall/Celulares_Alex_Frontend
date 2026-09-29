import { Briefcase, CalendarClock, FileX2 } from 'lucide-react'
import type { ContratoDetalle } from '@/modules/employees/types'
import { summarizeContracts } from '@/modules/employees/lib/contracts'
import { formatCRC, formatDate } from '@/modules/employees/lib/format'
import { Badge } from '@/components/ui/Badge'
import {
  TABLE_HEAD,
  TABLE_ROW,
  TABLE_TD,
  TABLE_TD_NUM,
  TABLE_TD_STRONG,
  TABLE_TH,
} from '@/components/ui/styles'
import { InfoItem, SectionCard } from './ProfileSection'

interface EmployeeContractSectionProps {
  /** Todos los contratos del empleado, del más reciente al más antiguo. */
  contratos: ContratoDetalle[]
  /**
   * Puede ver las liquidaciones (NOMINA_WRITE o HISTORIAL_WRITE). Sin eso la
   * RLS las oculta y todo contrato cerrado parecería "pendiente de liquidar".
   */
  veLiquidaciones: boolean
  /** Los botones (EmployeeContractActions), a la derecha del título de la tarjeta. */
  acciones?: React.ReactNode
}

/**
 * Tab "Contrato" del perfil: el vigente y el historial de contrataciones.
 * Esta vista solo muestra; los botones y sus formularios llegan armados por
 * `acciones` (EmployeeContractActions).
 */
export function EmployeeContractSection({
  contratos,
  veLiquidaciones,
  acciones,
}: EmployeeContractSectionProps) {
  const { vigente, cerrados, ultimo, programada, pendienteDeLiquidar } =
    summarizeContracts(contratos)

  return (
    <div className="space-y-4">
      <SectionCard title="Contrato vigente" action={acciones}>
        {vigente ? (
          <div className="space-y-3">
            {programada && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <p>
                  Último día: {formatDate(programada)}. Se cierra automáticamente al día siguiente
                  {vigente.motivo_salida_nombre ? ` (${vigente.motivo_salida_nombre})` : ''}.
                </p>
              </div>
            )}
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <InfoItem label="Puesto" value={vigente.puesto_nombre} />
              <InfoItem label="Sucursal" value={vigente.sucursal_nombre} />
              <InfoItem label="Tipo de contrato" value={vigente.tipo_contrato_nombre} />
              <InfoItem label="Jornada" value={vigente.tipo_jornada_nombre} />
              <InfoItem label="Inicio del contrato" value={formatDate(vigente.lab_fecha_inicio)} />
              <InfoItem label="Salario base" value={formatCRC(vigente.lab_salario_base)} />
              <InfoItem label="Salario real" value={formatCRC(vigente.lab_salario_real)} />
            </dl>
          </div>
        ) : pendienteDeLiquidar && ultimo && veLiquidaciones ? (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <FileX2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>
              Terminado el {formatDate(ultimo.lab_fecha_fin)}
              {ultimo.motivo_salida_nombre ? ` (${ultimo.motivo_salida_nombre})` : ''} · pendiente
              de liquidar.
            </p>
          </div>
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
            <table className="w-full min-w-[40rem] text-xs">
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
                    <td className={TABLE_TD}>
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        {c.motivo_salida_nombre ?? '—'}
                        {veLiquidaciones && !c.liquidado && (
                          <Badge tone="amber" size="xs">
                            Pendiente de liquidar
                          </Badge>
                        )}
                      </span>
                    </td>
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
