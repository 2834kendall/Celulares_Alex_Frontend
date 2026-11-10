import { PageHeader } from '@/components/ui/PageHeader'
import { Alert } from '@/components/ui/Alert'
import { BranchForm } from '@/modules/settings/branches/BranchForm'
import { getBranchBrands } from '@/modules/settings/branches/actions'
import { getTerritorio } from '@/modules/employees/actions/getCatalogs'

export default async function NewBranchPage({
  searchParams,
}: {
  searchParams: Promise<{ marca?: string }>
}) {
  const { marca } = await searchParams
  // getBranchBrands exige el mismo acceso que el resto de la pantalla.
  const [brands, t] = await Promise.all([getBranchBrands(), getTerritorio()])
  // "Agregar sucursal" desde una marca la trae preseleccionada. Es solo una
  // sugerencia de UI: el formulario la ignora si no es una marca activa de la
  // lista, y la RPC revalida la empresa igual.
  const defaultBrandId = marca && /^\d+$/.test(marca) ? Number(marca) : undefined
  const listQuery = defaultBrandId ? `?marca=${defaultBrandId}` : ''
  const error = !brands.ok ? brands.error : !t.ok ? t.error : null
  return (
    <div className="space-y-6">
      <PageHeader title="Nueva sucursal" backHref={`/settings/branches${listQuery}`} />
      {brands.ok && t.ok ? (
        <BranchForm
          territorio={t.data}
          brands={brands.data}
          defaultBrandId={defaultBrandId}
          listQuery={listQuery}
        />
      ) : (
        <Alert>{error}</Alert>
      )}
    </div>
  )
}
