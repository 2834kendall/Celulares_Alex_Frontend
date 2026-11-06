import { PageHeader } from '@/components/ui/PageHeader'
import { Alert } from '@/components/ui/Alert'
import { BranchForm } from '@/modules/settings/branches/BranchForm'
import { branchAdmin } from '@/modules/settings/branches/access'
import { getTerritorio } from '@/modules/employees/actions/getCatalogs'
export default async function NewBranchPage() {
  await branchAdmin()
  const t = await getTerritorio()
  return (
    <div className="space-y-6">
      <PageHeader title="Nueva sucursal" backHref="/settings/branches" />
      {t.ok ? <BranchForm territorio={t.data} /> : <Alert>{t.error}</Alert>}
    </div>
  )
}
