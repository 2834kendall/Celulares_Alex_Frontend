'use client'
import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import type { TerritorioCatalogo } from '@/modules/employees/types'
import type { Branch, BranchSettings } from './types'
import { BranchForm } from './BranchForm'
import { KiosksPanel } from './KiosksPanel'
import { useConfirmLeave } from '@/hooks/useUnsavedChanges'

export function BranchDetail({
  branch,
  data,
  territorio,
}: {
  branch: Branch
  data: BranchSettings
  territorio: TerritorioCatalogo
}) {
  const [tab, setTab] = useState('datos')
  const confirmLeave = useConfirmLeave()
  return (
    <div className="space-y-6">
      <PageHeader
        title={branch.suc_nombre}
        description={
          branch.suc_activa ? 'Sucursal activa' : 'Sucursal inactiva · historial conservado'
        }
        backHref="/settings/branches"
      />
      <div className="flex flex-wrap gap-2" aria-label="Apartados de sucursal">
        <Button
          variant={tab === 'datos' ? 'primary' : 'secondary'}
          aria-pressed={tab === 'datos'}
          onClick={() => {
            if (tab !== 'datos') confirmLeave(() => setTab('datos'))
          }}
        >
          Datos
        </Button>
        {data.canManageKiosks && (
          <Button
            variant={tab === 'kioscos' ? 'primary' : 'secondary'}
            aria-pressed={tab === 'kioscos'}
            onClick={() => {
              if (tab !== 'kioscos') confirmLeave(() => setTab('kioscos'))
            }}
          >
            Kioscos
          </Button>
        )}
        <Link
          className="px-3 py-2 text-sm font-medium text-brand-700 underline"
          href="/settings/appearance"
        >
          Editar apariencia
        </Link>
      </div>
      {tab === 'datos' ? (
        <BranchForm branch={branch} territorio={territorio} />
      ) : (
        <KiosksPanel branch={branch} data={data} />
      )}
    </div>
  )
}
