import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getActiveEmployees } from '@/modules/attendance/actions/getActiveEmployees'
import { getFaceEnrollment } from '@/modules/attendance/actions/getFaceEnrollment'
import { EnrollScreen } from '@/modules/attendance/components/kiosk/face/EnrollScreen'

/**
 * Ruta oculta de enrolamiento facial: no aparece en ninguna navegacion; el
 * gerente la abre a mano en el dispositivo. Gated con EMPLEADOS_WRITE — la
 * cuenta KIOSCO (EMPLEADOS_READ + ASISTENCIA_WRITE) NO puede entrar aca, y
 * el RLS de sgrh_biometria_empleado rechaza sus escrituras aunque lo
 * intentara por fetch directo.
 */
export default async function EnrolarPage() {
  await requirePermission(PERMISOS.EMPLEADOS_WRITE)

  const [employeesResult, enrollmentResult] = await Promise.all([
    getActiveEmployees(),
    getFaceEnrollment(),
  ])

  if (!employeesResult.ok) {
    return (
      <div className="text-center text-slate-300">
        <p>{employeesResult.error}</p>
      </div>
    )
  }

  return (
    <EnrollScreen
      employees={employeesResult.data}
      enrolledIds={enrollmentResult.ok ? enrollmentResult.enrolledIds : []}
    />
  )
}
