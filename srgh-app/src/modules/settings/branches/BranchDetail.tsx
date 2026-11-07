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
}: {
  branch: Branch
  data: BranchSettings
  territorio: TerritorioCatalogo
}) {
  const tabs: TabDefinition<'datos' | 'kioscos'>[] = [
    {
      id: 'datos',
      label: 'Datos',
      icon: Building2,
      content: <BranchForm branch={branch} territorio={territorio} />,
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
        description={
          branch.suc_activa ? 'Sucursal activa' : 'Sucursal inactiva · historial conservado'
        }
        backHref="/settings/branches"
      />
      <Tabs idPrefix={`branch-${branch.suc_id}`} ariaLabel="Apartados de sucursal" tabs={tabs} />
    </div>
  )
}
