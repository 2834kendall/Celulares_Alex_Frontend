'use client'

import { SearchSelect, type SearchSelectOption } from '@/components/ui/SearchSelect'
import type { CollaboratorRow } from '@/modules/evaluations/types'
import { Avatar } from '@/components/ui/Avatar'

interface CollaboratorSearchSelectProps {
  collaborators: CollaboratorRow[]
  selectedLabId: number
  onSelect: (labId: number) => void
  className?: string
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
  className = 'w-64',
}: CollaboratorSearchSelectProps) {
  const options: SearchSelectOption[] = collaborators.map((c) => ({
    value: String(c.labId),
    label: c.fullName,
    sublabel: `${c.position ?? 'Sin puesto'} • ${c.branchName}`,
    searchTerms: c.idNumber,
    avatar: <Avatar size="xs" fotoUrl={c.fotoUrl} nombre={c.fullName} />,
  }))

  return (
    <SearchSelect
      options={options}
      value={String(selectedLabId)}
      onChange={(value) => onSelect(Number(value))}
      ariaLabel="Buscar colaborador"
      className={className}
    />
  )
}
