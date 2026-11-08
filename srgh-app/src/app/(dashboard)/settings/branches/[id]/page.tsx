import { notFound } from 'next/navigation'
import { Alert } from '@/components/ui/Alert'
import { PageHeader } from '@/components/ui/PageHeader'
import { getBranchSettings } from '@/modules/settings/branches/actions'
import { getTerritorio } from '@/modules/employees/actions/getCatalogs'
import { BranchDetail } from '@/modules/settings/branches/BranchDetail'
export default async function BranchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^\d+$/.test(id)) notFound()
  const [r, t] = await Promise.all([getBranchSettings(), getTerritorio()])
  if (!r.ok || !t.ok)
    return (
      <div className="space-y-4">
        <PageHeader title="Sucursal" backHref="/settings/branches" />
        <Alert>{!r.ok ? r.error : !t.ok ? t.error : ''}</Alert>
      </div>
    )
  const branch = r.data.branches.find((b) => b.suc_id === Number(id))
  if (!branch) notFound()
  return <BranchDetail key={branch.suc_id} branch={branch} data={r.data} territorio={t.data} />
}
