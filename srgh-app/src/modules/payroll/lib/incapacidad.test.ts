import { describe, expect, it } from 'vitest'
import { calcularMontoIncapacidad, diasSuperpuestos, repartirDiasIncapacidad } from './incapacidad'
import { parseFechaLocal } from './fechas'

describe('diasSuperpuestos', () => {
  it('rango totalmente adentro de otro', () => {
    expect(
      diasSuperpuestos(
        parseFechaLocal('2026-07-01'),
        parseFechaLocal('2026-07-31'),
        parseFechaLocal('2026-07-10'),
        parseFechaLocal('2026-07-12')
      )
    ).toBe(3)
  })

  it('rangos que no se tocan da 0', () => {
    expect(
      diasSuperpuestos(
        parseFechaLocal('2026-07-01'),
        parseFechaLocal('2026-07-15'),
        parseFechaLocal('2026-07-20'),
        parseFechaLocal('2026-07-25')
      )
    ).toBe(0)
  })

  it('incapacidad que cruza de una quincena a otra: cuenta solo lo que cae en cada una', () => {
    // Incapacidad del 12 al 18 de julio; quincena 1 va del 1 al 15.
    const inicioQ1 = parseFechaLocal('2026-07-01')
    const finQ1 = parseFechaLocal('2026-07-15')
    const inicioInc = parseFechaLocal('2026-07-12')
    const finInc = parseFechaLocal('2026-07-18')

    expect(diasSuperpuestos(inicioQ1, finQ1, inicioInc, finInc)).toBe(4) // 12,13,14,15

    const inicioQ2 = parseFechaLocal('2026-07-16')
    const finQ2 = parseFechaLocal('2026-07-31')
    expect(diasSuperpuestos(inicioQ2, finQ2, inicioInc, finInc)).toBe(3) // 16,17,18
  })

  it('un solo día (inicio = fin) cuenta como 1', () => {
    expect(
      diasSuperpuestos(
        parseFechaLocal('2026-07-01'),
        parseFechaLocal('2026-07-31'),
        parseFechaLocal('2026-07-10'),
        parseFechaLocal('2026-07-10')
      )
    ).toBe(1)
  })
})

describe('repartirDiasIncapacidad', () => {
  it('sin tope usado todavía: hasta 3 días los paga el patrono', () => {
    expect(repartirDiasIncapacidad(2, 0)).toEqual({ diasEmpleador: 2, diasCcss: 0 })
    expect(repartirDiasIncapacidad(5, 0)).toEqual({ diasEmpleador: 3, diasCcss: 2 })
  })

  it('con parte del tope ya usado en otro periodo del mismo mes', () => {
    // Ya se pagaron 2 días este mes; en este periodo hay 3 días de incapacidad.
    expect(repartirDiasIncapacidad(3, 2)).toEqual({ diasEmpleador: 1, diasCcss: 2 })
  })

  it('tope ya agotado: todo pasa a la CCSS', () => {
    expect(repartirDiasIncapacidad(4, 3)).toEqual({ diasEmpleador: 0, diasCcss: 4 })
  })

  it('tope configurable', () => {
    expect(repartirDiasIncapacidad(10, 0, 5)).toEqual({ diasEmpleador: 5, diasCcss: 5 })
  })
})

describe('calcularMontoIncapacidad', () => {
  it('días del patrono × salario diario × porcentaje', () => {
    expect(calcularMontoIncapacidad(3, 20000, 50)).toBe(30000)
  })

  it('0 días del patrono da 0', () => {
    expect(calcularMontoIncapacidad(0, 20000, 50)).toBe(0)
  })

  it('redondea a 2 decimales', () => {
    expect(calcularMontoIncapacidad(1, 10000.333, 50)).toBe(5000.17)
  })
})
