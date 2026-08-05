import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { esFechaVencida, formatCRC, formatDate, fullName, nombreSinExtension } from './format'

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

describe('nombreSinExtension', () => {
  it('quita la extensión del nombre del archivo', () => {
    expect(nombreSinExtension('contrato.pdf')).toBe('contrato')
    expect(nombreSinExtension('cédula frontal.jpg')).toBe('cédula frontal')
  })

  it('solo quita la última extensión', () => {
    expect(nombreSinExtension('backup.tar.gz')).toBe('backup.tar')
  })

  it('deja intacto un nombre sin extensión', () => {
    expect(nombreSinExtension('contrato')).toBe('contrato')
  })

  // '.htaccess' es todo extensión: quitarla dejaría el campo vacío.
  it('devuelve el nombre original si al quitar la extensión queda vacío', () => {
    expect(nombreSinExtension('.htaccess')).toBe('.htaccess')
  })
})

describe('esFechaVencida', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 2))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('es true para una fecha pasada', () => {
    expect(esFechaVencida('2020-01-01')).toBe(true)
  })

  it('es false para una fecha futura', () => {
    expect(esFechaVencida('2030-01-01')).toBe(false)
  })

  it('es false para hoy mismo', () => {
    expect(esFechaVencida('2026-08-02')).toBe(false)
  })

  it('es false para null o undefined', () => {
    expect(esFechaVencida(null)).toBe(false)
    expect(esFechaVencida(undefined)).toBe(false)
  })
})
