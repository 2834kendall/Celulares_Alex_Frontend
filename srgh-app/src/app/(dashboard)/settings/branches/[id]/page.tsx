import { notFound } from 'next/navigation'
import { Alert } from '@/components/ui/Alert'
import { PageHeader } from '@/components/ui/PageHeader'
import { getBranchSettings } from '@/modules/settings/branches/actions'
import { getTerritorio } from '@/modules/employees/actions/getCatalogs'
import { BranchDetail } from '@/modules/settings/branches/BranchDetail'
export default async function BranchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ marca?: string }>
}) {
  const [{ id }, { marca }] = await Promise.all([params, searchParams])
  if (!/^\d+$/.test(id)) notFound()
  // Filtro del listado del que se vino, para volver a él.
  // `todas` es explícito: sin parámetro, el listado aplicaría la marca de la barra superior.
  const listQuery = marca && /^(\d+|todas)$/.test(marca) ? `?marca=${marca}` : ''
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
  return (
    <BranchDetail
      key={branch.suc_id}
      branch={branch}
      data={r.data}
      territorio={t.data}
      listQuery={listQuery}
    />
  )
}
