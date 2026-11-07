import { Alert } from '@/components/ui/Alert'
import Link from 'next/link'
import { SettingsSection } from '@/modules/settings/components/SettingsSection'
import { requireSettingsSection } from '@/modules/settings/lib/requireSection'
import { getBranchSettings } from '@/modules/settings/branches/actions'
import { BranchesPanel } from '@/modules/settings/branches/BranchesPanel'
export default async function BranchesPage() {
  const { section } = await requireSettingsSection('branches')
  const r = await getBranchSettings()
  return (
    <SettingsSection section={section}>
      {r.ok ? (
        <BranchesPanel data={r.data} />
      ) : (
        <div className="space-y-4">
          <Alert>{r.error}</Alert>
          <Link href="/settings/branches" className="text-brand-700 underline">
            Volver a intentar
          </Link>
        </div>
      )}
    </SettingsSection>
  )
}
