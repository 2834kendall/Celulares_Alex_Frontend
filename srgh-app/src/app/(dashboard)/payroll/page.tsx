import { requireAnyPermission } from '@/lib/auth/require-permission'
import { ACCESO_NOMINA } from '@/lib/permissions/zones'
import { ModulePlaceholder } from '@/components/ui/ModulePlaceholder'

export default async function PayrollPage() {
  await requireAnyPermission(ACCESO_NOMINA)

  return (
    <ModulePlaceholder
      title="Nomina"
      description="Periodos de planilla, ingresos, deducciones y comprobantes de pago."
    />
  )
}
