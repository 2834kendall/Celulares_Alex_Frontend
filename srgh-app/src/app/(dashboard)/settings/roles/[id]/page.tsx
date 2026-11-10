import { notFound } from 'next/navigation'
import { Alert } from '@/components/ui/Alert'
import { PageHeader } from '@/components/ui/PageHeader'
import { requireSettingsSection } from '@/modules/settings/lib/requireSection'
import { getRolesSettings } from '@/modules/settings/roles/actions'
import { RoleEditor } from '@/modules/settings/roles/RoleEditor'
import { sortPermissions } from '@/modules/settings/roles/permissions'

/** Editar un rol de la empresa, o ver (solo lectura) el del kiosco. */
export default async function RolePage({ params }: { params: Promise<{ id: string }> }) {
  await requireSettingsSection('roles')
  const { id } = await params
  if (!/^\d+$/.test(id)) notFound()
  const r = await getRolesSettings()
  if (!r.ok)
    return (
      <div className="space-y-4">
        <PageHeader title="Rol" backHref="/settings/roles" />
        <Alert>{r.error}</Alert>
      </div>
    )

  const role = [...r.data.propios, ...r.data.sistema].find((x) => x.id === Number(id))
  if (!role) notFound()

  return (
    <RoleEditor
      key={role.id}
      data={r.data}
      role={role}
      initial={{
        nombre: role.nombre,
        descripcion: role.descripcion ?? '',
        permisos: sortPermissions(role.permisos),
      }}
    />
  )
}
