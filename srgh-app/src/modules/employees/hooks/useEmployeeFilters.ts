'use client'

import { useMemo, useState } from 'react'
import type { EmpleadoListItem } from '@/modules/employees/types'

export type EstadoFiltro = 'todos' | 'activos' | 'inactivos'

/** Comparación insensible a mayúsculas y tildes (búsqueda en español). */
function normalize(text: string) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/**
 * Filtros client-side del listado de empleados: búsqueda por texto
 * (nombre/apellidos/identificación), estado por contrato vigente y tipo de
 * contrato. Las opciones de tipo de contrato se derivan de la propia data.
 */
export function useEmployeeFilters(items: EmpleadoListItem[]) {
  const [search, setSearch] = useState('')
  const [estado, setEstado] = useState<EstadoFiltro>('todos')
  const [tipoContrato, setTipoContrato] = useState('todos')

  const tiposContrato = useMemo(() => {
    const nombres = new Set<string>()
    for (const item of items) {
      if (item.tipo_contrato_nombre) {
        nombres.add(item.tipo_contrato_nombre)
      }
    }
    return [...nombres].sort((a, b) => a.localeCompare(b, 'es'))
  }, [items])

  const filtered = useMemo(() => {
    const term = normalize(search.trim())

    return items.filter((item) => {
      if (estado === 'activos' && !item.activo) return false
      if (estado === 'inactivos' && item.activo) return false

      if (tipoContrato !== 'todos' && item.tipo_contrato_nombre !== tipoContrato) {
        return false
      }

      if (term) {
        const haystack = normalize(
          `${item.emp_nombre} ${item.emp_apellido_1} ${item.emp_apellido_2 ?? ''} ${item.emp_numero_identificacion}`
        )
        if (!haystack.includes(term)) return false
      }

      return true
    })
  }, [items, search, estado, tipoContrato])

  return {
    search,
    setSearch,
    estado,
    setEstado,
    tipoContrato,
    setTipoContrato,
    tiposContrato,
    filtered,
  }
}
