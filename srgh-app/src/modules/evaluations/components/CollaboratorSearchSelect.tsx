'use client'

import { SearchSelect, type SearchSelectOption } from '@/components/ui/SearchSelect'
import type { CollaboratorRow } from '@/modules/evaluations/types'
import { initialsOf } from '@/modules/evaluations/lib/scoring'

interface CollaboratorSearchSelectProps {
  collaborators: CollaboratorRow[]
  selectedLabId: number
  onSelect: (labId: number) => void
}

/**
 * Combobox con filtro por nombre o cedula para cambiar de colaborador.
 *
 * Solo aporta la forma de los datos del dominio: el combobox en si (teclado,
 * cierre al hacer click fuera, ARIA) vive en `ui/SearchSelect`, donde antes
 * estaba duplicado casi linea por linea.
 */
export function CollaboratorSearchSelect({
  collaborators,
  selectedLabId,
  onSelect,
}: CollaboratorSearchSelectProps) {
  const options: SearchSelectOption[] = collaborators.map((c) => ({
    value: String(c.labId),
    label: c.fullName,
    sublabel: `${c.position ?? 'Sin puesto'} • ${c.branchName}`,
    searchTerms: c.idNumber,
    avatar: (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[10px] font-bold text-blue-700">
        {initialsOf(c.fullName)}
      </span>
    ),
  }))

  return (
    <SearchSelect
      options={options}
      value={String(selectedLabId)}
      onChange={(value) => onSelect(Number(value))}
      ariaLabel="Buscar colaborador"
      className="w-64"
    />
  )
}
