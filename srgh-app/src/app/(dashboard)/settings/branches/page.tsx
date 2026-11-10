import { Alert } from '@/components/ui/Alert'
import { ERROR_FILTRO_MARCA, getFiltroMarca } from '@/lib/empresa/contexto-activo'
import Link from 'next/link'
import { SettingsSection } from '@/modules/settings/components/SettingsSection'
import { requireSettingsSection } from '@/modules/settings/lib/requireSection'
import { getBranchSettings } from '@/modules/settings/branches/actions'
import { BranchesPanel } from '@/modules/settings/branches/BranchesPanel'
export default async function BranchesPage() {
  const { section } = await requireSettingsSection('branches')
  const [r, filtro] = await Promise.all([getBranchSettings(), getFiltroMarca()])
  const error = !r.ok ? r.error : filtro.estado === 'error' ? ERROR_FILTRO_MARCA : null
  return (
    <SettingsSection section={section}>
      {r.ok && !error ? (
        <BranchesPanel
          data={r.data}
          marcaContextoId={filtro.estado === 'filtrado' ? filtro.marcaId : null}
        />
      ) : (
        <div className="space-y-4">
          <Alert>{error}</Alert>
          <Link href="/settings/branches" className="text-brand-700 underline">
            Volver a intentar
          </Link>
        </div>
      )}
    </SettingsSection>
  )
}
