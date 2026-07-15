import { describe, expect, it } from 'vitest'
import { formatCRC, formatDate, fullName } from './format'

describe('formatDate', () => {
  it('convierte ISO a dd/mm/yyyy sin corrimiento de zona horaria', () => {
    expect(formatDate('2024-02-01')).toBe('01/02/2024')
  })

  it('devuelve — para null o undefined', () => {
    expect(formatDate(null)).toBe('—')
    expect(formatDate(undefined)).toBe('—')
  })
})

describe('formatCRC', () => {
  it('formatea montos en colones sin decimales', () => {
    const formatted = formatCRC(500000)
    expect(formatted).toContain('500')
    expect(formatted).toContain('₡')
  })

  it('devuelve — para null', () => {
    expect(formatCRC(null)).toBe('—')
  })
})

describe('fullName', () => {
  it('concatena nombre y apellidos', () => {
    expect(fullName({ emp_nombre: 'Ana', emp_apellido_1: 'Mora', emp_apellido_2: 'Solís' })).toBe(
      'Ana Mora Solís'
    )
  })

  it('omite el segundo apellido cuando es null', () => {
    expect(fullName({ emp_nombre: 'Ana', emp_apellido_1: 'Mora', emp_apellido_2: null })).toBe(
      'Ana Mora'
    )
  })
})
