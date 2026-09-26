import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getCandidateDetail } from '@/modules/recruitment/actions/getCandidateDetail'
import {
  getBancos,
  getPuestos,
  getRoles,
  getSucursales,
  getTerritorio,
  getTiposContrato,
  getTiposDocumento,
  getTiposIdentificacion,
  getTiposJornada,
} from '@/modules/employees/actions/getCatalogs'
import {
  EmployeeWizard,
  type EmployeeWizardPrefill,
} from '@/modules/employees/components/EmployeeWizard'
import { Alert } from '@/components/ui/Alert'
import { PageHeader } from '@/components/ui/PageHeader'

interface HireCandidatePageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ postulacionId?: string }>
}

/**
 * Entrada del botón "Contratar" (SGRH-61): mismo wizard de
 * /employees/new, con los datos del candidato precargados y el
 * postulacionId que, al terminar el alta, cierra esa postulación como
 * contratada (ver EmployeeWizard → linkPostulacionToEmployee).
 *
 * Exige EMPLEADOS_WRITE y RECLUTAMIENTO_WRITE: el wizard toca ambos
 * dominios.
 */
export default async function HireCandidatePage({ params, searchParams }: HireCandidatePageProps) {
  const { id } = await params
  const { postulacionId: postulacionIdParam } = await searchParams
  const candidatoId = Number(id)
  const postulacionId = Number(postulacionIdParam)

  if (!Number.isInteger(candidatoId) || candidatoId <= 0) {
    notFound()
  }
  if (!Number.isInteger(postulacionId) || postulacionId <= 0) {
    return <Alert size="md">Falta indicar la postulación que se está contratando.</Alert>
  }

  await requirePermission(PERMISOS.EMPLEADOS_WRITE)
  const claims = await requirePermission(PERMISOS.RECLUTAMIENTO_WRITE)
  const permisos = (claims.app_metadata as { permisos?: string[] })?.permisos ?? []
  const canInviteUser = permisos.includes(PERMISOS.USUARIOS_WRITE)
  const canManageDocs = permisos.includes(PERMISOS.DOCUMENTOS_WRITE)

  const [
    detailResult,
    tiposIdentificacionResult,
    puestosResult,
    sucursalesResult,
    tiposContratoResult,
    tiposJornadaResult,
    bancosResult,
    territorioResult,
    rolesResult,
    tiposDocumentoResult,
  ] = await Promise.all([
    getCandidateDetail(candidatoId),
    getTiposIdentificacion(),
    getPuestos(),
    getSucursales(),
    getTiposContrato(),
    getTiposJornada(),
    getBancos(),
    getTerritorio(),
    canInviteUser ? getRoles() : Promise.resolve(null),
    canManageDocs ? getTiposDocumento() : Promise.resolve(null),
  ])

  if (!detailResult.ok) {
    if (detailResult.notFound) notFound()
    return <Alert size="md">{detailResult.error}</Alert>
  }

  const postulacion = detailResult.data.postulaciones.find((p) => p.pos_id === postulacionId)
  if (!postulacion) {
    return <Alert size="md">Esa postulación no pertenece a este candidato.</Alert>
  }
  if (postulacion.pos_estado_final !== 'en_proceso') {
    return <Alert size="md">Esta postulación ya no está en proceso.</Alert>
  }

  const results = [
    tiposIdentificacionResult,
    puestosResult,
    sucursalesResult,
    tiposContratoResult,
    tiposJornadaResult,
    bancosResult,
    territorioResult,
  ]
  const failed = results.find((result) => !result.ok)
  if (failed && !failed.ok) {
    return <Alert size="md">{failed.error}</Alert>
  }
  if (rolesResult && !rolesResult.ok) {
    return <Alert size="md">{rolesResult.error}</Alert>
  }
  if (tiposDocumentoResult && !tiposDocumentoResult.ok) {
    return <Alert size="md">{tiposDocumentoResult.error}</Alert>
  }

  const candidato = detailResult.data
  // La postulación solo guarda el nombre resuelto del puesto/sucursal (ver
  // getCandidateDetail); para precargar el select de nómina hace falta el
  // id, así que se busca por nombre en el mismo catálogo que carga el
  // wizard. Si no aparece (puesto desactivado desde entonces), se avisa y
  // RRHH lo elige a mano.
  const puestoPrefill = puestosResult.ok
    ? (puestosResult.data.find((p) => p.nombre === postulacion.puestoNombre) ?? null)
    : null
  const sucursalPrefill =
    sucursalesResult.ok && postulacion.sucursalNombre
      ? (sucursalesResult.data.find((s) => s.nombre === postulacion.sucursalNombre) ?? null)
      : null

  const prefill: EmployeeWizardPrefill = {
    emp_nombre: candidato.cdt_nombre,
    emp_apellido_1: candidato.cdt_apellido_1,
    emp_apellido_2: candidato.cdt_apellido_2,
    emp_tipo_identificacion_id: candidato.cdt_tipo_identificacion_id,
    emp_numero_identificacion: candidato.cdt_numero_identificacion ?? '',
    emp_telefono: candidato.cdt_telefono,
    emp_email_personal: candidato.cdt_email,
    lab_puesto_id: puestoPrefill?.id ?? null,
    lab_sucursal_id: sucursalPrefill?.id ?? null,
  }

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        backHref={`/recruitment/candidates/${candidatoId}`}
        backLabel="Volver a la ficha del candidato"
        title={`Contratar a ${candidato.cdt_nombre} ${candidato.cdt_apellido_1}`}
        description="Alta de empleado con los datos que ya entregó el candidato. Al guardar, la postulación queda cerrada como contratada."
      />

      {!puestoPrefill && (
        <Alert tone="info" size="md">
          El puesto de la postulación (&ldquo;{postulacion.puestoNombre}&rdquo;) no se pudo
          preseleccionar automáticamente — elígelo en el paso de nómina.
        </Alert>
      )}

      <EmployeeWizard
        tiposIdentificacion={tiposIdentificacionResult.ok ? tiposIdentificacionResult.data : []}
        puestos={puestosResult.ok ? puestosResult.data : []}
        sucursales={sucursalesResult.ok ? sucursalesResult.data : []}
        tiposContrato={tiposContratoResult.ok ? tiposContratoResult.data : []}
        tiposJornada={tiposJornadaResult.ok ? tiposJornadaResult.data : []}
        bancos={bancosResult.ok ? bancosResult.data : []}
        territorio={
          territorioResult.ok
            ? territorioResult.data
            : { provincias: [], cantones: [], distritos: [] }
        }
        tiposDocumento={tiposDocumentoResult?.ok ? tiposDocumentoResult.data : []}
        canManageDocs={canManageDocs}
        roles={rolesResult?.ok ? rolesResult.data : []}
        canInviteUser={canInviteUser}
        prefill={prefill}
        postulacionId={postulacionId}
      />
    </div>
  )
}
