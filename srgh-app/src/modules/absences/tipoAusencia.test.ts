import { describe, expect, it } from 'vitest'
import { tipoAusenciaSchema } from '@/modules/absences/types'
import { tipoAusenciaDbError } from '@/modules/absences/lib/tipoAusenciaErrors'

const base = {
  tau_codigo: 'perm_x',
  tau_nombre: 'Permiso X',
  tau_paga_empleador_dias: 2,
  tau_porcentaje_pago_empleador: 100,
  tau_referencia_legal: '',
}

describe('tipoAusenciaSchema', () => {
  it('normaliza el codigo a mayusculas y vacios a null', () => {
    const r = tipoAusenciaSchema.parse({
      ...base,
      tau_paga_ccss_desde_dia: NaN,
      tau_porcentaje_subsidio_ccss: NaN,
    })
    expect(r.tau_codigo).toBe('PERM_X')
    expect(r.tau_referencia_legal).toBeNull()
    expect(r.tau_paga_ccss_desde_dia).toBeNull()
    expect(r.tau_es_intradia).toBe(false)
  })

  it('rechaza codigos con espacios o simbolos', () => {
    expect(tipoAusenciaSchema.safeParse({ ...base, tau_codigo: 'a b' }).success).toBe(false)
  })

  it('rechaza porcentajes fuera de 0-100 y dias negativos', () => {
    expect(
      tipoAusenciaSchema.safeParse({ ...base, tau_porcentaje_pago_empleador: 101 }).success
    ).toBe(false)
    expect(tipoAusenciaSchema.safeParse({ ...base, tau_paga_empleador_dias: -1 }).success).toBe(
      false
    )
  })

  it('exige dia y porcentaje del subsidio juntos o ninguno', () => {
    expect(tipoAusenciaSchema.safeParse({ ...base, tau_paga_ccss_desde_dia: 4 }).success).toBe(
      false
    )
    expect(
      tipoAusenciaSchema.safeParse({
        ...base,
        tau_paga_ccss_desde_dia: 4,
        tau_porcentaje_subsidio_ccss: 60,
      }).success
    ).toBe(true)
  })
})

describe('tipoAusenciaDbError', () => {
  it('explica codigo duplicado y tipo en uso', () => {
    expect(tipoAusenciaDbError({ code: '23505' }, 'VAC', 'crear')).toContain('VAC')
    expect(tipoAusenciaDbError({ code: '23503' }, 'VAC', 'eliminar')).toContain(
      'ausencias registradas'
    )
    expect(tipoAusenciaDbError({}, 'VAC', 'actualizar')).toBe(
      'No se pudo actualizar el tipo de ausencia.'
    )
  })
})
