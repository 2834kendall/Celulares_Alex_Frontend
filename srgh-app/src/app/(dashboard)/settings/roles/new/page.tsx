import { Alert } from '@/components/ui/Alert'
import { PageHeader } from '@/components/ui/PageHeader'
import { requireSettingsSection } from '@/modules/settings/lib/requireSection'
import { getRolesSettings } from '@/modules/settings/roles/actions'
import { RoleEditor } from '@/modules/settings/roles/RoleEditor'
import { withRequirements } from '@/modules/settings/roles/permissions'
import type { RoleInput } from '@/modules/settings/roles/types'

/** Crear un rol desde cero, o duplicar uno (`?desde=<id>`) y ajustar la copia. */
export default async function NewRolePage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string }>
}) {
  await requireSettingsSection('roles')
  const { desde } = await searchParams
  const r = await getRolesSettings()
  if (!r.ok)
    return (
      <div className="space-y-4">
        <PageHeader title="Nuevo rol" backHref="/settings/roles" />
        <Alert>{r.error}</Alert>
      </div>
    )

  const baseId = desde && /^\d+$/.test(desde) ? Number(desde) : null
  const base = baseId
    ? [...r.data.propios, ...r.data.sistema].find((x) => x.id === baseId)
    : undefined

  const initial: RoleInput = base
    ? {
        nombre: `Copia de ${base.nombre}`.slice(0, 60),
        descripcion: base.descripcion ?? '',
        sucursalId: base.sucursalId,
        // Un rol del sistema puede traer combinaciones viejas (o el permiso
        // del kiosco): la copia arranca ya con las dependencias completas y
        // solo con lo asignable.
        permisos: withRequirements(base.permisos),
      }
    : { nombre: '', descripcion: '', sucursalId: null, permisos: [] }

  return <RoleEditor key={baseId ?? 'nuevo'} data={r.data} base={base} initial={initial} />
}
