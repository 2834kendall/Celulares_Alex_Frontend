import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  esCumpleanosHoy,
  esFechaVencida,
  formatCRC,
  formatCumpleanos,
  formatCurrencyInput,
  formatDate,
  fullName,
  nombreSinExtension,
  parseCurrencyInput,
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

const normalizeSpaces = (text: string) => text.replace(/\u00a0/g, ' ')

describe('formatCRC', () => {
  it('formatea montos enteros en colones sin decimales', () => {
    expect(normalizeSpaces(formatCRC(500000))).toBe('₡500 000')
  })

  it('formatea montos con céntimos usando siempre 2 decimales', () => {
    expect(normalizeSpaces(formatCRC(1234.5))).toBe('₡1 234,50')
    expect(normalizeSpaces(formatCRC(1234.56))).toBe('₡1 234,56')
  })

  it('devuelve — para null, undefined o NaN', () => {
    expect(formatCRC(null)).toBe('—')
    expect(formatCRC(undefined)).toBe('—')
    expect(formatCRC(Number.NaN)).toBe('—')
  })
})

describe('formatCurrencyInput', () => {
  it('formatea enteros sin decimales y decimales con 2 dígitos, sin símbolo ₡', () => {
    expect(normalizeSpaces(formatCurrencyInput(500000))).toBe('500 000')
    expect(normalizeSpaces(formatCurrencyInput(1234.5))).toBe('1 234,50')
    expect(normalizeSpaces(formatCurrencyInput(1234.56))).toBe('1 234,56')
    expect(normalizeSpaces(formatCurrencyInput(-500))).toBe('-500')
    expect(formatCurrencyInput(0)).toBe('0')
  })

  it('devuelve cadena vacía para NaN o infinito', () => {
    expect(formatCurrencyInput(Number.NaN)).toBe('')
    expect(formatCurrencyInput(Number.POSITIVE_INFINITY)).toBe('')
  })
})

describe('parseCurrencyInput', () => {
  it('interpreta un único punto o coma como separador decimal (nunca multiplica)', () => {
    expect(parseCurrencyInput('1234.56')).toBe(1234.56)
    expect(parseCurrencyInput('1234,56')).toBe(1234.56)
    expect(parseCurrencyInput('350000.555')).toBe(350000.555)
    expect(parseCurrencyInput('1234.')).toBe(1234)
    expect(parseCurrencyInput('₡1 234,56')).toBe(1234.56)
  })

  it('cuando coexisten punto y coma, toma el último como decimal y el otro como miles', () => {
    expect(parseCurrencyInput('1,234.56')).toBe(1234.56)
    expect(parseCurrencyInput('1.234,56')).toBe(1234.56)
    expect(parseCurrencyInput('1.234.567,89')).toBe(1234567.89)
  })

  it('interpreta múltiples ocurrencias del mismo separador como miles', () => {
    expect(parseCurrencyInput('1.500.000')).toBe(1500000)
    expect(parseCurrencyInput('1,500,000')).toBe(1500000)
  })

  it('conserva negativos y cero, y devuelve NaN para vacío o entradas inválidas', () => {
    expect(parseCurrencyInput('-500')).toBe(-500)
    expect(parseCurrencyInput('0')).toBe(0)
    expect(parseCurrencyInput('-0')).toBe(0)
    expect(parseCurrencyInput('')).toBeNaN()
    expect(parseCurrencyInput('   ')).toBeNaN()
    expect(parseCurrencyInput('-')).toBeNaN()
    expect(parseCurrencyInput('50-0')).toBeNaN()
    expect(parseCurrencyInput('abc')).toBeNaN()
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
