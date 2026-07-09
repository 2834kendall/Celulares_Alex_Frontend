import { requireAnyPermission } from '@/lib/auth/require-permission'
import { ACCESO_EMPLEADOS } from '@/lib/permissions/zones'
import { ModulePlaceholder } from '@/components/ui/ModulePlaceholder'

export default async function EmployeesPage() {
  await requireAnyPermission(ACCESO_EMPLEADOS)

  return (
    <ModulePlaceholder
      title="Empleados"
      description="Expedientes digitales, datos personales, contratos y puestos de trabajo."
    />
  )
}
