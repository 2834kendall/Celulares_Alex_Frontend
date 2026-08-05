import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useEmployeeFilters } from './useEmployeeFilters'
import type { EmpleadoListItem } from '@/modules/employees/types'

function empleado(overrides: Partial<EmpleadoListItem>): EmpleadoListItem {
  return {
    emp_id: 1,
    emp_nombre: 'Ana',
    emp_apellido_1: 'Mora',
    emp_apellido_2: null,
    emp_numero_identificacion: '1-1111-1111',
    emp_telefono: null,
    emp_email_personal: null,
    emp_fecha_ingreso_original: '2024-01-01',
    emp_genero: null,
    emp_nacionalidad: 'Costarricense',
    puesto_nombre: 'Cajera',
    sucursal_nombre: 'Central',
    tipo_contrato_nombre: 'Indefinido',
    salario_base: 500000,
    fecha_inicio_contrato: '2024-02-01',
    activo: true,
    foto_url: null,
    ...overrides,
  }
}

const ITEMS: EmpleadoListItem[] = [
  empleado({ emp_id: 1, emp_nombre: 'Ana', emp_apellido_1: 'Mora' }),
  empleado({
    emp_id: 2,
    emp_nombre: 'José',
    emp_apellido_1: 'Pérez',
    emp_numero_identificacion: '2-2222-2222',
    tipo_contrato_nombre: 'Plazo fijo',
  }),
  empleado({
    emp_id: 3,
    emp_nombre: 'Luis',
    emp_apellido_1: 'Rojas',
    tipo_contrato_nombre: null,
    activo: false,
  }),
]

describe('useEmployeeFilters', () => {
  it('sin filtros devuelve todos los items', () => {
    const { result } = renderHook(() => useEmployeeFilters(ITEMS))

    expect(result.current.filtered).toHaveLength(3)
  })

  it('deriva los tipos de contrato distintos ordenados', () => {
    const { result } = renderHook(() => useEmployeeFilters(ITEMS))

    expect(result.current.tiposContrato).toEqual(['Indefinido', 'Plazo fijo'])
  })

  it('busca por nombre ignorando tildes y mayúsculas', () => {
    const { result } = renderHook(() => useEmployeeFilters(ITEMS))

    act(() => result.current.setSearch('jose'))

    expect(result.current.filtered).toHaveLength(1)
    expect(result.current.filtered[0].emp_id).toBe(2)
  })

  it('busca por número de identificación', () => {
    const { result } = renderHook(() => useEmployeeFilters(ITEMS))

    act(() => result.current.setSearch('2-2222'))

    expect(result.current.filtered).toHaveLength(1)
    expect(result.current.filtered[0].emp_id).toBe(2)
  })

  it('filtra por estado activo e inactivo', () => {
    const { result } = renderHook(() => useEmployeeFilters(ITEMS))

    act(() => result.current.setEstado('activos'))
    expect(result.current.filtered.map((i) => i.emp_id)).toEqual([1, 2])

    act(() => result.current.setEstado('inactivos'))
    expect(result.current.filtered.map((i) => i.emp_id)).toEqual([3])
  })

  it('filtra por tipo de contrato', () => {
    const { result } = renderHook(() => useEmployeeFilters(ITEMS))

    act(() => result.current.setTipoContrato('Plazo fijo'))

    expect(result.current.filtered.map((i) => i.emp_id)).toEqual([2])
  })

  it('combina búsqueda y filtros', () => {
    const { result } = renderHook(() => useEmployeeFilters(ITEMS))

    act(() => {
      result.current.setEstado('activos')
      result.current.setSearch('perez')
    })

    expect(result.current.filtered.map((i) => i.emp_id)).toEqual([2])
  })
})
