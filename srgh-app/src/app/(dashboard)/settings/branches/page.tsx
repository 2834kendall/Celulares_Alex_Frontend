import { Alert } from '@/components/ui/Alert'
import Link from 'next/link'
import { PageHeader } from '@/components/ui/PageHeader'
import { getBranchSettings } from '@/modules/settings/branches/actions'
import { BranchesPanel } from '@/modules/settings/branches/BranchesPanel'
export default async function BranchesPage() {
  const r = await getBranchSettings()
  return r.ok ? (
    <BranchesPanel data={r.data} />
  ) : (
    <div className="space-y-4">
      <PageHeader title="Sucursales y kioscos" />
      <Alert>{r.error}</Alert>
      <Link href="/settings/branches" className="text-brand-700 underline">
        Volver a intentar
      </Link>
    </div>
  )
}
