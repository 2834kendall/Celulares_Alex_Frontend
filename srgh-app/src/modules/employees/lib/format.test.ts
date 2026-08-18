import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  esCumpleanosHoy,
  esFechaVencida,
  formatCRC,
  formatCumpleanos,
  formatDate,
  fullName,
  nombreSinExtension,
} from './format'

describe('formatCumpleanos', () => {
  it('muestra dia y mes en palabras, sin el año', () => {
    expect(formatCumpleanos('1990-05-10')).toBe('10 de mayo')
  })

  it('quita el cero a la izquierda del dia', () => {
    expect(formatCumpleanos('1988-01-03')).toBe('3 de enero')
  })

  it('no se corre de dia por zona horaria', () => {
    // Con new Date('1990-01-01') en America/Costa_Rica esto caeria al 31/12.
    expect(formatCumpleanos('1990-01-01')).toBe('1 de enero')
    expect(formatCumpleanos('1990-12-31')).toBe('31 de diciembre')
  })

  it('devuelve — sin fecha', () => {
    expect(formatCumpleanos(null)).toBe('—')
    expect(formatCumpleanos(undefined)).toBe('—')
  })
})

describe('esCumpleanosHoy', () => {
  afterEach(() => vi.useRealTimers())

  function hoyEs(fecha: string) {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(`${fecha}T09:00:00`))
  }

  it('true cuando coinciden dia y mes, aunque el año sea otro', () => {
    hoyEs('2026-05-10')
    expect(esCumpleanosHoy('1990-05-10')).toBe(true)
  })

  it('false cuando es otro dia', () => {
    hoyEs('2026-05-11')
    expect(esCumpleanosHoy('1990-05-10')).toBe(false)
  })

  it('false sin fecha de nacimiento', () => {
    hoyEs('2026-05-10')
    expect(esCumpleanosHoy(null)).toBe(false)
  })
})

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
