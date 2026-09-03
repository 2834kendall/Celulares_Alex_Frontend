import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getPeriodoDetail } from '@/modules/payroll/actions/getPeriodoDetail'
import { getConceptos } from '@/modules/payroll/actions/getConceptos'
import { PeriodoDetail } from '@/modules/payroll/components/PeriodoDetail'
import { PlanillaImport } from '@/modules/payroll/components/PlanillaImport'
import { Alert } from '@/components/ui/Alert'
import { PageHeader } from '@/components/ui/PageHeader'

interface PeriodoDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function PeriodoDetailPage({ params }: PeriodoDetailPageProps) {
  const { id } = await params
  const periodoId = Number(id)

  if (!Number.isInteger(periodoId) || periodoId <= 0) {
    notFound()
  }

  const claims = await requirePermission(PERMISOS.NOMINA_READ)
  const permisos = (claims.app_metadata as { permisos?: string[] })?.permisos ?? []
  const canWrite = permisos.includes(PERMISOS.NOMINA_WRITE)

  const [detailResult, conceptosResult] = await Promise.all([
    getPeriodoDetail(periodoId),
    getConceptos(),
  ])

  if (!detailResult.ok) {
    if (detailResult.notFound) {
      notFound()
    }
    return <Alert size="md">{detailResult.error}</Alert>
  }

  const conceptosManuales = (conceptosResult.ok ? conceptosResult.data : []).filter(
    (c) =>
      c.con_activo &&
      // Mismo criterio que el motor de calculo (esConceptoDelTrabajador): una
      // carga patronal no se edita en la planilla del trabajador.
      c.con_tipo !== 'patronal' &&
      (c.con_tipo_calculo === 'monto_manual_ingreso' ||
        c.con_tipo_calculo === 'monto_manual_deduccion')
  )

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        backHref="/payroll"
        backLabel="Volver al listado"
        title="Detalle del periodo"
        description="Planilla del periodo y estado de pago."
      />

      {canWrite && (
        <PlanillaImport periodoId={detailResult.data.id} estado={detailResult.data.estado} />
      )}

      <PeriodoDetail
        periodo={detailResult.data}
        canWrite={canWrite}
        conceptosManuales={conceptosManuales}
      />
    </div>
  )
}
