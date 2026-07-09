import { requireAnyPermission } from '@/lib/auth/require-permission'
import { ACCESO_ASISTENCIA } from '@/lib/permissions/zones'
import { ModulePlaceholder } from '@/components/ui/ModulePlaceholder'

export default async function AttendancePage() {
  await requireAnyPermission(ACCESO_ASISTENCIA)

  return (
    <ModulePlaceholder
      title="Asistencia"
      description="Marcas de entrada y salida, horarios, programacion semanal y ausencias."
    />
  )
}
