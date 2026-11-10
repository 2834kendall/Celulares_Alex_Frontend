'use client'
import { Building2, Monitor } from 'lucide-react'
import { Tabs, type TabDefinition } from '@/components/ui/Tabs'
import { PageHeader } from '@/components/ui/PageHeader'
import type { TerritorioCatalogo } from '@/modules/employees/types'
import type { Branch, BranchSettings } from './types'
import { BranchForm } from './BranchForm'
import { KiosksPanel } from './KiosksPanel'

export function BranchDetail({
  branch,
  data,
  territorio,
  listQuery = '',
}: {
  branch: Branch
  data: BranchSettings
  territorio: TerritorioCatalogo
  /** Filtro del listado del que se vino (`?marca=1`), para volver a él. */
  listQuery?: string
}) {
  const marca = data.brands.find((b) => b.id === branch.suc_marca_id)
  const tabs: TabDefinition<'datos' | 'kioscos'>[] = [
    {
      id: 'datos',
      label: 'Datos',
      icon: Building2,
      content: (
        <BranchForm
          branch={branch}
          territorio={territorio}
          brands={data.brands}
          listQuery={listQuery}
        />
      ),
    },
  ]
  if (data.canManageKiosks)
    tabs.push({
      id: 'kioscos',
      label: 'Kioscos',
      icon: Monitor,
      content: <KiosksPanel branch={branch} data={data} />,
    })
  return (
    <div className="space-y-6">
      <PageHeader
        title={branch.suc_nombre}
        description={[
          marca?.nombre,
          branch.suc_activa ? 'Sucursal activa' : 'Sucursal inactiva · historial conservado',
        ]
          .filter(Boolean)
          .join(' · ')}
        backHref={`/settings/branches${listQuery}`}
      />
      <Tabs idPrefix={`branch-${branch.suc_id}`} ariaLabel="Apartados de sucursal" tabs={tabs} />
    </div>
  )
}
