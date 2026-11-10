import Link from 'next/link'
import { Alert } from '@/components/ui/Alert'
import { SettingsSection } from '@/modules/settings/components/SettingsSection'
import { requireSettingsSection } from '@/modules/settings/lib/requireSection'
import { getRolesSettings } from '@/modules/settings/roles/actions'
import { RolesPanel } from '@/modules/settings/roles/RolesPanel'

export default async function RolesPage() {
  const { section } = await requireSettingsSection('roles')
  const r = await getRolesSettings()
  return (
    <SettingsSection section={section}>
      {r.ok ? (
        <RolesPanel data={r.data} />
      ) : (
        <div className="space-y-4">
          <Alert>{r.error}</Alert>
          <Link href="/settings/roles" className="text-brand-700 underline">
            Volver a intentar
          </Link>
        </div>
      )}
    </SettingsSection>
  )
}
