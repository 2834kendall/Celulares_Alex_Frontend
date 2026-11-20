import { describe, expect, it } from 'vitest'
import { MAX_NOMBRES_FALTANTES, empleadosQueFaltan } from './empleadosFaltantes'

const activo = (labId: number, nombre: string) => ({ labId, nombre })

describe('empleadosQueFaltan', () => {
  it('devuelve a los activos sin fila, en orden alfabético', () => {
    const r = empleadosQueFaltan(
      [activo(1, 'Zoe Mora'), activo(2, 'Ana Ruiz'), activo(3, 'Luis Soto')],
      [3]
    )

    expect(r).toEqual({ total: 2, nombres: ['Ana Ruiz', 'Zoe Mora'] })
  })

  it('con todos en el periodo no falta nadie', () => {
    expect(empleadosQueFaltan([activo(1, 'Ana'), activo(2, 'Luis')], [1, 2])).toEqual({
      total: 0,
      nombres: [],
    })
  })

  it('una fila de un contrato que ya no es activo no cuenta de más', () => {
    expect(empleadosQueFaltan([activo(1, 'Ana')], [1, 99])).toEqual({ total: 0, nombres: [] })
  })

  it('muestra hasta el máximo de nombres pero cuenta a todos', () => {
    const muchos = Array.from({ length: MAX_NOMBRES_FALTANTES + 4 }, (_, i) =>
      activo(i + 1, `Persona ${String(i).padStart(2, '0')}`)
    )

    const r = empleadosQueFaltan(muchos, [])

    expect(r.total).toBe(MAX_NOMBRES_FALTANTES + 4)
    expect(r.nombres).toHaveLength(MAX_NOMBRES_FALTANTES)
    expect(r.nombres[0]).toBe('Persona 00')
  })
})
